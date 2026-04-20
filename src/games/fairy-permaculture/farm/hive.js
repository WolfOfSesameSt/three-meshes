/**
 * Fairy Permaculture — hive buildings (C4.2 Branch A).
 *
 * Two kinds:
 *   • 'mason-tubes' — passive tube station that native mason bees
 *     colonize. Produces POLLINATION-SERVICE only.
 *   • 'warre'       — honeybee Warré hive. Produces HONEY (fairy food)
 *     AND pollination service; the marquee unlock of branch-a (node a4).
 *
 * Honey only accumulates when the hive has flowering plants within a
 * pollinator-radius. We query a `plantManager` interface for pollinator
 * plants (plants with role 'pollinator') via
 * `plantManager.findFloweringPlantsWithin(x, y, radius)`. If no plant
 * manager is available (or the method is missing), we fall back to an
 * empty array — tests and the boot sequence can still run without the
 * parallel plant branch.
 *
 * Per-day work is O(hives) — each hive caches its plant scan for the
 * current day and only re-runs once per (day, hiveId) pair.
 */

const HIVE_DEFAULTS = {
  'mason-tubes': {
    pollinatorSpecies: ['mason-bee'],
    maxColonyStrength: 0.6,   // cap: native tubes are small
    honeyKgPerDayAtMax: 0,    // mason bees don't make harvestable honey
    forageRadius: 25,         // meters
    colonyGrowthPerDay: 0.05,
    colonyDecayPerDay: 0.03,
  },
  'warre': {
    pollinatorSpecies: ['honeybee'],
    maxColonyStrength: 1.0,
    honeyKgPerDayAtMax: 0.2,  // matches honeybee.products[0].rate_per_day
    forageRadius: 40,
    colonyGrowthPerDay: 0.04,
    colonyDecayPerDay: 0.05,
  },
};

let nextHiveUid = 1;

/**
 * Create a hive object.
 *
 * @param {'warre'|'mason-tubes'} type
 * @param {number} x
 * @param {number} y
 * @returns {object} hive
 */
export function createHive(type, x, y) {
  const defs = HIVE_DEFAULTS[type];
  if (!defs) throw new Error(`hive: unknown type '${type}'`);
  return {
    uid: `hive-${nextHiveUid++}`,
    type,
    x,
    y,
    colonyStrength: 0.2,          // starts small; grows with forage
    pollinatorIds: [],            // visual swarm references (set by mesh layer)
    honeyStored: 0,               // kg waiting for harvest
    _lastScanDay: -1,
    _lastScanFlowering: 0,        // cached count of flowering plants nearby
    _defs: defs,
  };
}

/**
 * Defensive query of the plant-manager for flowering plants in range.
 * Returns the count. Missing / partial plant-manager → 0.
 *
 * @param {any} plantManager
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @returns {number}
 */
export function countFloweringPollinatorPlants(plantManager, x, y, radius) {
  const q = plantManager?.findFloweringPlantsWithin;
  if (typeof q !== 'function') return 0;
  const results = q.call(plantManager, x, y, radius) ?? [];
  return results.length;
}

/**
 * Per-day tick for a single hive. Updates colony strength based on
 * forage availability and, for warré hives, accumulates honey.
 *
 * Caches the plant-scan once per day so a swarm of N hives and M
 * plants stays O(N + M).
 *
 * @param {object} hive
 * @param {number} day          current day index
 * @param {any} plantManager    optional; may be null
 * @returns {{ flowering: number, honeyAdded: number }}
 */
export function tickHive(hive, day, plantManager) {
  const defs = hive._defs;
  let flowering;
  if (hive._lastScanDay === day) {
    flowering = hive._lastScanFlowering;
  } else {
    flowering = countFloweringPollinatorPlants(
      plantManager,
      hive.x,
      hive.y,
      defs.forageRadius
    );
    hive._lastScanDay = day;
    hive._lastScanFlowering = flowering;
  }

  // Colony strength dynamics: grow when there's forage, decay otherwise.
  if (flowering > 0) {
    // Saturating curve — more plants help but with diminishing returns.
    const feedFactor = Math.min(1, flowering / 6);
    hive.colonyStrength = Math.min(
      defs.maxColonyStrength,
      hive.colonyStrength + defs.colonyGrowthPerDay * feedFactor
    );
  } else {
    hive.colonyStrength = Math.max(
      0,
      hive.colonyStrength - defs.colonyDecayPerDay
    );
  }

  // Honey accrues only when there IS forage and we have a colony.
  let honeyAdded = 0;
  if (defs.honeyKgPerDayAtMax > 0 && flowering > 0) {
    honeyAdded = defs.honeyKgPerDayAtMax * hive.colonyStrength;
    hive.honeyStored += honeyAdded;
  }

  return { flowering, honeyAdded };
}

/**
 * Harvest accumulated honey. Zeros `honeyStored` and returns the kg
 * harvested. Caller is responsible for routing into `fairyFood.honey`.
 *
 * @param {object} hive
 * @returns {number} kg harvested
 */
export function harvestHoney(hive) {
  const kg = hive.honeyStored;
  hive.honeyStored = 0;
  return kg;
}

/** Internal reset for tests. */
export function __resetHiveUids() {
  nextHiveUid = 1;
}
