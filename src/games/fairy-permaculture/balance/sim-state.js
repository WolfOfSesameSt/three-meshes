/**
 * Fairy Permaculture — headless simulator state.
 *
 * The progression simulator does NOT use the full 250k-tile SoilField
 * or the full branch-tree. It keeps enough state to compute fairy-count /
 * biomass / yield curves and nothing else.
 *
 * Design notes:
 * - All branches from data/branches.json are flattened once at setup into
 *   a node-lookup table; per-node progress is tracked as "invested-days",
 *   which (when it crosses a threshold) flips the node to unlocked.
 * - Fairy-food stocks (honey / milk / fruit) are scalar pools, burned at
 *   balance.json's food_unit_cost_per_fairy rate when new fairies spawn.
 * - Soil is summarized as two scalars — avg OM and avg moisture — driven
 *   by weather + applied-compost, not a tile-by-tile simulation.
 * - No object allocation inside the hot per-day loop; every mutation is
 *   in-place. The only arrays that grow are the per-day sample records,
 *   and those live in typed arrays sized once at construction.
 */

/** Seasons (matches day-tick.js ordering). */
const SEASON_NAMES = ["spring", "summer", "autumn", "winter"];

/**
 * Build a node lookup + branch index from branches.json.
 *
 * Output shape:
 *   byId: { [nodeId]: { id, branchId, kind, prerequisites, product } }
 *   branchIds: ['root', 'branch-a', ..., 'climax']
 *   nodeIds:   ['r1', 'r2', ..., 'cx-watershed']
 */
export function indexBranches(branchesJson) {
  const byId = Object.create(null);
  const branchIds = [];
  const nodeIds = [];
  for (const branch of branchesJson) {
    branchIds.push(branch.id);
    for (const node of branch.nodes) {
      byId[node.id] = {
        id: node.id,
        branchId: branch.id,
        kind: branch.kind,
        prerequisites: node.prerequisites ?? [],
        product: node.product ?? null, // HONEY | MILK | FRUIT | null
        fairyFoodGated: branch.fairy_food_gated ?? "NONE",
      };
      nodeIds.push(node.id);
    }
  }
  return { byId, branchIds, nodeIds };
}

/**
 * Allocate a fresh SimState for one run.
 * Fields are either scalars or typed arrays sized once.
 */
export function createSimState({ seed, biome, branches, balance, years }) {
  const totalDays = 360 * years; // 4 seasons × 30 days × years (matches config)
  const index = indexBranches(branches);
  const nodeCount = index.nodeIds.length;

  // Per-node integer counters.
  const unlocked = new Uint8Array(nodeCount);      // 1 = unlocked
  const invested = new Uint16Array(nodeCount);     // fairy-days invested
  const UNLOCK_COST = 3; // fairy-days per node, scaled by node kind below

  // Per-branch investment total (for dead-branch detection).
  const branchInvestment = Object.create(null);
  for (const id of index.branchIds) branchInvestment[id] = 0;

  const state = {
    // Clock ──────────────────────────────────────────────────────────
    day: 0,
    seasonIndex: 0,  // 0-3
    year: 0,
    totalDays,

    // Economy ────────────────────────────────────────────────────────
    fairyCount: 2,          // start with the initial pair
    fairyCapacity: 25,      // balance.fairy_pop_curve.mvp_pop_cap
    popCap: balance.fairy_pop_curve.pop_cap,
    foodCostPerFairy: balance.fairy_pop_curve.food_unit_cost_per_fairy,
    pendingAction: null,    // { name, remainingDays }

    // Fairy-food stocks (abstract units) ─────────────────────────────
    honey: 0,
    milk: 0,
    fruit: 0,

    // Materials ──────────────────────────────────────────────────────
    biomass: 0,        // kg — raw biomass collected/standing
    compost: 0,        // m³ — finished compost waiting to be spread
    soilOm: 1.5,       // avg OM % across the "played" footprint
    soilMoisture: 50,  // avg % field capacity
    standingBiomass: 0, // plant biomass living on tiles, grows over time

    // Branch-tree state ──────────────────────────────────────────────
    index,
    unlocked,
    invested,
    UNLOCK_COST,
    branchInvestment,

    // Tracking ───────────────────────────────────────────────────────
    lastProgressDay: 0,       // set when *any* growth (fairy or biomass)
    dailyYieldUnits: 0,       // fairy-food units produced today
    yearlyYieldUnits: new Float64Array(years + 1), // [y0, y1, y2, ...]
    fairyMilestones: [],      // snapshot records for runaway detection

    // Active events ──────────────────────────────────────────────────
    activeEvents: [],         // [{ id, remainingDays, severity }]
    consecutiveRainless: 0,

    // Random ─────────────────────────────────────────────────────────
    seed: seed >>> 0,

    // Run recording ──────────────────────────────────────────────────
    // Typed arrays sized up-front — zero allocation in the hot loop.
    rec: {
      day:             new Uint16Array(totalDays),
      fairyCount:      new Uint16Array(totalDays),
      biomassStock:    new Float32Array(totalDays),
      compostStock:    new Float32Array(totalDays),
      honeyStock:      new Float32Array(totalDays),
      milkStock:       new Float32Array(totalDays),
      fruitStock:      new Float32Array(totalDays),
      soilOm:          new Float32Array(totalDays),
      yieldUnits:      new Float32Array(totalDays),
      unlockedCount:   new Uint16Array(totalDays),
      stallFlag:       new Uint8Array(totalDays),
    },
    stallEvents: [],  // array of { startDay, endDay, len }
    runawayEvents: [],
    actionLog: [],    // array of { day, name } — small, capped
  };
  return state;
}

/** Returns the current season name given the day index. */
export function seasonNameForDay(day) {
  const dayInYear = day % 360;
  const s = Math.floor(dayInYear / 90);
  return SEASON_NAMES[s] ?? "spring";
}

/** Look up a node by id. */
export function getNode(state, id) {
  return state.index.byId[id] ?? null;
}

/** Return true iff every listed prerequisite is unlocked. */
export function prereqsSatisfied(state, nodeId) {
  const node = state.index.byId[nodeId];
  if (!node) return false;
  for (const pre of node.prerequisites) {
    const idx = state.index.nodeIds.indexOf(pre);
    if (idx < 0) return false;
    if (!state.unlocked[idx]) return false;
  }
  // Product-gated branches need enough of their fairy-food first — but
  // only for branches whose fairy_food_gated says so, which only matters
  // for *future* unlocks past the branch's first product node.
  return true;
}

/** Marks a node unlocked (idempotent). */
export function unlockNode(state, nodeId) {
  const idx = state.index.nodeIds.indexOf(nodeId);
  if (idx < 0) return false;
  if (state.unlocked[idx]) return false;
  state.unlocked[idx] = 1;
  return true;
}

/** Count unlocked nodes. */
export function unlockedCount(state) {
  let n = 0;
  for (let i = 0; i < state.unlocked.length; i++) n += state.unlocked[i];
  return n;
}

/** Returns true iff the named node is unlocked. */
export function isUnlocked(state, nodeId) {
  const idx = state.index.nodeIds.indexOf(nodeId);
  if (idx < 0) return false;
  return state.unlocked[idx] === 1;
}

export { SEASON_NAMES };
