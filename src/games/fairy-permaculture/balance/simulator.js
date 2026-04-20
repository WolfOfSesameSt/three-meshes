/**
 * Fairy Permaculture — headless progression simulator.
 *
 * Runs the day-tick scheduler for `years` game-years with no renderer,
 * sampling a player-profile's action each day. Ticks weather + events +
 * a simplified soil/economy model, and records per-day metrics.
 *
 * Performance target: 3-year run < 5 s. Key tactics:
 *   - pre-sized typed-array record buffers
 *   - scalar (not per-tile) soil model
 *   - no per-day object allocation (mutate in place)
 *   - flat events/balance data loaded once
 */

import { createScheduler, advanceDay } from "../core/day-tick.js";
import { createRng, createWeatherListener } from "../core/weather.js";
import branchesJson from "../data/branches.json" with { type: "json" };
import balanceJson from "../data/balance.json" with { type: "json" };
import eventsJson from "../data/events.json" with { type: "json" };

import {
  createSimState,
  seasonNameForDay,
  unlockedCount,
  isUnlocked,
} from "./sim-state.js";
import { PROFILES, resolveAction } from "./profiles.js";

const STALL_WINDOW_DAYS = 7;
const RUNAWAY_WINDOW_DAYS = 14;

/**
 * Run one simulation.
 *
 * @param {object} opts
 * @param {number} opts.seed      — deterministic seed (default 42)
 * @param {string} opts.profile   — 'ideal'|'typical'|'naive'|'chaotic'
 * @param {string} opts.biome     — 'bc-coastal' (only biome in MVP)
 * @param {number} opts.years     — number of game-years (1..5)
 * @param {object} [opts.biomeConfig] — inject biome JSON directly
 * @returns {Run} record
 */
export function runSimulation({
  seed = 42,
  profile = "typical",
  biome = "bc-coastal",
  years = 3,
  biomeConfig = null,
} = {}) {
  const balance = balanceJson;
  const profileFn = PROFILES[profile];
  if (!profileFn) throw new Error(`unknown profile: ${profile}`);

  // Lazily load the biome JSON; fall back to inline BC if not provided.
  // (`with { type: "json" }` isn't universal; make the sim work without it.)
  const biomeData = biomeConfig ?? DEFAULT_BIOME;

  const state = createSimState({
    seed,
    biome,
    branches: branchesJson,
    balance,
    years,
  });

  // Independent RNGs: one for weather (wrapped inside the listener),
  // one for player/profile/event rolls.
  const playerRng = createRng(seed ^ 0x9e3779b9);
  const eventRng  = createRng(seed ^ 0x85ebca77);

  const sched = createScheduler();
  const weatherListener = createWeatherListener(biomeData, seed ^ 0xc2b2ae3d);

  // Day-tick wiring — weather listener populates env, our main handler
  // consumes it.
  sched.dayListeners.add(weatherListener);
  sched.dayListeners.add((env) => tickOneDay(state, env, profileFn, playerRng, eventRng, balance));

  for (let i = 0; i < state.totalDays; i++) {
    advanceDay(sched);
    if (i > state.totalDays) break;
  }

  // Detect runaway/stall windows from the recorded curve.
  detectWindows(state);

  return buildRunRecord(state, { seed, profile, biome, years });
}

/**
 * Day-step driver. Pure-mutation; no allocation other than the
 * action descriptor for unlock-node (which is a small object — we
 * accept this as it's once per action, not per fairy).
 */
function tickOneDay(state, env, profileFn, playerRng, eventRng, balance) {
  const day = state.day;
  if (day >= state.totalDays) return;
  state.seasonIndex = env.seasonIndex;
  state.year = env.year;

  // ── Weather-driven soil scalar updates ────────────────────────────
  const rainMm = env.rainMm ?? 0;
  const tempC = env.tempC ?? 15;
  // Moisture: rain adds, heat evaporates.
  const evap = Math.max(0.5, (tempC - 5) * 0.15);
  state.soilMoisture = clamp(state.soilMoisture + rainMm - evap, 0, 100);
  // Standing biomass grows with moisture + warmth + soilOm.
  const growthFactor = tempC > 5 && tempC < 32
    ? (state.soilMoisture / 100) * (state.soilOm / 4) * (env.seasonName === "winter" ? 0.1 : 1.0)
    : 0;
  state.standingBiomass = clamp(state.standingBiomass * 1.002 + growthFactor * 1.2, 0, 50000);
  // Slow OM decay counteracted by applied compost.
  state.soilOm = Math.max(0.5, state.soilOm - 0.0008);
  if (env.rainlessDaysStreak !== undefined) {
    state.consecutiveRainless = env.rainlessDaysStreak;
  }

  // ── Event rolls (per events.json per-day probabilities) ──────────
  maybeFireEvents(state, env, eventRng, balance);

  // ── Player action ────────────────────────────────────────────────
  // If the pending action isn't done, continue it; else pick a new one.
  if (!state.pendingAction || state.pendingAction.remainingDays <= 0) {
    const descriptor = profileFn(state, playerRng);
    const action = resolveAction(descriptor);
    state.pendingAction = { action, remainingDays: action.duration };
    // Log first 200 actions for debugging — small, cheap.
    if (state.actionLog.length < 200) {
      state.actionLog.push({ day, name: action.id });
    }
  }

  // Apply once per day (we could apply only on completion — but applying
  // a per-day fraction gives smoother curves; we apply on completion day
  // to keep the abstract action's duration meaningful).
  state.pendingAction.remainingDays -= 1;
  if (state.pendingAction.remainingDays <= 0) {
    state.pendingAction.action.apply(state, playerRng);
    state.pendingAction = null;
  }

  // ── Passive daily effects from unlocked product nodes ────────────
  passiveYield(state, env);

  // ── Fairy population update ──────────────────────────────────────
  updateFairyPop(state, balance, playerRng);

  // ── Record sample ────────────────────────────────────────────────
  const rec = state.rec;
  rec.day[day]           = day;
  rec.fairyCount[day]    = state.fairyCount;
  rec.biomassStock[day]  = state.biomass + state.standingBiomass + state.compost * 20;
  rec.compostStock[day]  = state.compost;
  rec.honeyStock[day]    = state.honey;
  rec.milkStock[day]     = state.milk;
  rec.fruitStock[day]    = state.fruit;
  rec.soilOm[day]        = state.soilOm;
  rec.yieldUnits[day]    = state.dailyYieldUnits;
  rec.unlockedCount[day] = unlockedCount(state);

  // Yearly cumulative yield
  if (state.year < state.yearlyYieldUnits.length) {
    state.yearlyYieldUnits[state.year] += state.dailyYieldUnits;
  }

  // Reset per-day counter
  state.dailyYieldUnits = 0;
  state.day += 1;
}

/**
 * Passive per-day fairy-food yield from product nodes that are
 * unlocked but not hand-harvested this tick. Keeps the curve smooth
 * once a branch's product is online.
 */
function passiveYield(state, env) {
  const season = env.seasonName ?? "spring";
  const mult = { spring: 0.9, summer: 1.1, autumn: 0.6, winter: 0.1 }[season] ?? 0.5;

  // Starter kitchen garden — a slow trickle from day 1 to cover the
  // earliest fairies. Represents overgrown pioneers + forager picks
  // (Branch-A1 "pioneer plants" is part of the canonical opening).
  const starter = 0.30 * mult;
  state.fruit += starter;
  state.dailyYieldUnits += starter;

  if (isUnlocked(state, "a4")) {
    const g = 0.7 * mult;
    state.honey += g;
    state.dailyYieldUnits += g;
  }
  if (isUnlocked(state, "c1")) {
    // Chickens produce a little ambient fairy-food via eggs.
    const g = 0.2 * mult;
    state.fruit += g;
    state.dailyYieldUnits += g;
  }
  if (isUnlocked(state, "c3")) {
    const g = 0.8 * mult;
    state.milk += g;
    state.dailyYieldUnits += g;
  }
  if (isUnlocked(state, "b1")) {
    const g = 0.5 * mult;
    state.fruit += g;
    state.dailyYieldUnits += g;
  }
}

/**
 * Population growth: new fairies born once we have enough food, capacity,
 * and habitat (unlocked foundation nodes).
 *
 * Model: each new fairy costs `foodCostPerFairy * 4` units of the
 * combined fairy-food pool (honey+milk+fruit). We raise capacity as
 * branches unlock + as pop grows (snowball).
 */
function updateFairyPop(state, balance, rng) {
  // Capacity scales primarily with unlocked tree + a small standing-biomass
  // bonus (a few extra fairies the farm can host even without formal
  // infrastructure). Unlocks remain the dominant lever so naive stays low.
  const unlocked = unlockedCount(state);
  // Additional biomass bonus is capped so players can't farm-bomb past
  // the unlock ceiling.
  const biomassBonus = Math.min(10, Math.floor(state.standingBiomass / 400));
  state.fairyCapacity = Math.min(
    state.popCap,
    Math.max(
      2,
      3 + unlocked * 4 + biomassBonus
    )
  );

  const pool = state.honey + state.milk + state.fruit;
  const perFairyCost = state.foodCostPerFairy; // balance.json = 3 units

  // "Starvation" — no growth if below a reserve
  if (state.fairyCount >= state.fairyCapacity) return;
  if (pool < perFairyCost) return;

  // Daily growth probability: higher pool → faster growth, capped.
  const capacitySlack = state.fairyCapacity - state.fairyCount;
  const chance = Math.min(0.25, (pool / perFairyCost) * 0.05) * Math.min(1, capacitySlack / 3);
  if (rng() < chance) {
    state.fairyCount += 1;
    // Consume food evenly from the three pools
    const spent = perFairyCost;
    const h = Math.min(state.honey, spent / 3);
    const m = Math.min(state.milk,  spent / 3);
    const f = Math.min(state.fruit, spent / 3);
    state.honey -= h;
    state.milk  -= m;
    state.fruit -= f;
    // Any leftover comes out of the richest pool
    let remainder = spent - (h + m + f);
    while (remainder > 0.001) {
      if (state.fruit >= remainder) { state.fruit -= remainder; remainder = 0; break; }
      if (state.honey >= remainder) { state.honey -= remainder; remainder = 0; break; }
      if (state.milk >= remainder)  { state.milk  -= remainder; remainder = 0; break; }
      break; // whole pool drained; stop
    }
    state.lastProgressDay = state.day;
  }
}

/**
 * Events fire by rolling against balance.event_probabilities. These
 * are *daily* probabilities scaled down to avoid firing every week.
 */
function maybeFireEvents(state, env, rng, balance) {
  const probs = balance.event_probabilities ?? {};
  const season = env.seasonName;

  for (const ev of eventsJson) {
    const season_ok = !ev.trigger?.season || ev.trigger.season === "any" || ev.trigger.season === season;
    if (!season_ok) continue;
    // Scale the coarse season-probability to a per-day probability.
    const dailyP = (probs[ev.id] ?? ev.trigger?.probability ?? 0) / 30;
    if (rng() < dailyP) {
      fireEvent(state, ev, rng);
    }
  }

  // Advance active events
  for (let i = state.activeEvents.length - 1; i >= 0; i--) {
    const a = state.activeEvents[i];
    a.remainingDays -= 1;
    if (a.remainingDays <= 0) state.activeEvents.splice(i, 1);
  }
}

function fireEvent(state, ev, rng) {
  // Mitigation from swales/compost/etc. We don't model full placement,
  // but swales and applied compost give partial coverage.
  let severity = 1.0;
  if (state.swales && state.swales > 0) severity *= 0.6;
  if (state.soilOm > 5) severity *= 0.8;

  // Apply simplified effects
  switch (ev.id) {
    case "summer-drought":
      state.soilMoisture = Math.max(0, state.soilMoisture - 15 * severity);
      state.standingBiomass *= (1 - 0.2 * severity);
      break;
    case "aphid-outbreak":
      state.fruit *= (1 - 0.2 * severity);
      state.standingBiomass *= (1 - 0.1 * severity);
      break;
    case "wet-pile-failure":
      state.compost = Math.max(0, state.compost - 1);
      break;
    case "hawk-strike":
      if ((state.chickens ?? 0) > 0) {
        state.chickens = Math.max(0, state.chickens - Math.ceil(1 + rng() * 2));
      }
      break;
  }
  const [min, max] = ev.duration_days_range ?? [1, 3];
  const durDays = Math.floor(min + rng() * (max - min + 1));
  state.activeEvents.push({ id: ev.id, severity, remainingDays: durDays });
}

/** Scan recorded fairy counts for runaway (doubling <14 d) + stalls (>7 d flat). */
function detectWindows(state) {
  const rec = state.rec;
  const n = rec.fairyCount.length;

  // Stall = window of 7 days with NO increase in fairyCount AND
  // no increase in unlockedCount.
  let stallStart = -1;
  for (let d = 1; d < n; d++) {
    const flat =
      rec.fairyCount[d] === rec.fairyCount[d - 1] &&
      rec.unlockedCount[d] === rec.unlockedCount[d - 1];
    if (flat) {
      if (stallStart < 0) stallStart = d;
      if (d - stallStart >= STALL_WINDOW_DAYS) {
        rec.stallFlag[d] = 1;
      }
    } else {
      if (stallStart >= 0 && d - stallStart >= STALL_WINDOW_DAYS) {
        state.stallEvents.push({ startDay: stallStart, endDay: d - 1, len: d - stallStart });
      }
      stallStart = -1;
    }
  }
  if (stallStart >= 0 && n - stallStart >= STALL_WINDOW_DAYS) {
    state.stallEvents.push({ startDay: stallStart, endDay: n - 1, len: n - stallStart });
  }

  // Runaway = fairy count doubles within 14-day window.
  for (let d = RUNAWAY_WINDOW_DAYS; d < n; d++) {
    const prev = rec.fairyCount[d - RUNAWAY_WINDOW_DAYS];
    if (prev >= 3 && rec.fairyCount[d] >= prev * 2) {
      state.runawayEvents.push({
        startDay: d - RUNAWAY_WINDOW_DAYS,
        endDay: d,
        from: prev,
        to: rec.fairyCount[d],
      });
      // Coalesce — skip ahead so one doubling event isn't counted twice
      d += RUNAWAY_WINDOW_DAYS;
    }
  }
}

/** Assemble the finished Run record. */
function buildRunRecord(state, meta) {
  const branchInvestment = { ...state.branchInvestment };
  const yearlyYield = Array.from(state.yearlyYieldUnits);
  return {
    meta,
    days: state.totalDays,
    rec: state.rec,
    fairyCountFinal: state.fairyCount,
    unlockedFinal: unlockedCount(state),
    branchInvestment,
    yearlyYield,
    stallEvents: state.stallEvents,
    runawayEvents: state.runawayEvents,
    actionLog: state.actionLog,
    stocksFinal: {
      honey: state.honey,
      milk: state.milk,
      fruit: state.fruit,
      biomass: state.biomass,
      compost: state.compost,
      soilOm: state.soilOm,
    },
    index: {
      nodeIds: state.index.nodeIds,
      branchIds: state.index.branchIds,
      unlocked: Array.from(state.unlocked),
    },
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Fallback biome — matches data/biomes/bc-coastal.json. Loading JSON
 * with `with { type: "json" }` import attributes isn't supported on
 * every Node version; embedding the minimal bits we need (climate)
 * keeps the sim hermetic.
 */
export const DEFAULT_BIOME = {
  id: "bc-coastal",
  climate: {
    rainfall_chance_per_season: { spring: 0.50, summer: 0.15, autumn: 0.50, winter: 0.80 },
    frost_chance_per_season:    { spring: 0.05, summer: 0.00, autumn: 0.10, winter: 0.60 },
  },
};
