/**
 * Fairy Permaculture — day-tick scheduler.
 *
 * The world advances in discrete **days**. All simulation systems
 * (soil, compost, plants, animals, events, fairy behavior) subscribe
 * here and run their tick(day, env) each day. Renderers drive
 * interpolation; the sim itself is day-discrete per the plan's
 * "Day-tick" decision.
 *
 * Speed control:
 *   setSpeed(0) pauses; 1×/2×/4× scale real-time day length
 *   (default 60 s per in-game day).
 *
 * This module is pure logic — no Three.js. The real-time driver in
 * `clock.js` pumps `advanceDay()` at the right cadence.
 */

import {
  SECONDS_PER_DAY,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  SEASONS_PER_YEAR,
} from "../config.js";

const SEASON_NAMES = ["spring", "summer", "autumn", "winter"];

/**
 * @returns a Scheduler object: { day, season, year, ... }
 */
export function createScheduler(initial = {}) {
  const sched = {
    day: initial.day ?? 0,            // 0-indexed day since game start
    seasonDay: initial.seasonDay ?? 0, // 0..DAYS_PER_SEASON-1
    seasonIndex: initial.seasonIndex ?? 0,
    year: initial.year ?? 0,
    speed: 1, // 0 pause, 1 normal, 2 fast, 4 faster
    dayListeners: new Set(),
    seasonListeners: new Set(),
    yearListeners: new Set(),
  };
  return sched;
}

export function currentSeasonName(sched) {
  return SEASON_NAMES[sched.seasonIndex];
}

export function setSpeed(sched, speed) {
  if (![0, 1, 2, 4].includes(speed)) throw new Error(`invalid speed ${speed}`);
  sched.speed = speed;
}

/** Subscribe to per-day ticks. Returns unsubscribe fn. */
export function onDay(sched, cb) {
  sched.dayListeners.add(cb);
  return () => sched.dayListeners.delete(cb);
}
export function onSeason(sched, cb) {
  sched.seasonListeners.add(cb);
  return () => sched.seasonListeners.delete(cb);
}
export function onYear(sched, cb) {
  sched.yearListeners.add(cb);
  return () => sched.yearListeners.delete(cb);
}

/**
 * Advance the clock by exactly one day. Drives listeners.
 * `env` is passed straight through to dayListeners (weather snapshot,
 * day number, etc.). Header constants are also provided.
 */
export function advanceDay(sched, env = {}) {
  const fullEnv = {
    day: sched.day,
    seasonDay: sched.seasonDay,
    seasonIndex: sched.seasonIndex,
    seasonName: currentSeasonName(sched),
    year: sched.year,
    ...env,
  };

  for (const cb of sched.dayListeners) cb(fullEnv);

  // Increment clock state.
  sched.day += 1;
  sched.seasonDay += 1;
  if (sched.seasonDay >= DAYS_PER_SEASON) {
    sched.seasonDay = 0;
    sched.seasonIndex += 1;
    if (sched.seasonIndex >= SEASONS_PER_YEAR) {
      sched.seasonIndex = 0;
      sched.year += 1;
      for (const cb of sched.yearListeners) cb({ ...fullEnv, year: sched.year });
    }
    for (const cb of sched.seasonListeners)
      cb({ ...fullEnv, seasonIndex: sched.seasonIndex, seasonName: currentSeasonName(sched) });
  }
}

/** Serializes to plain JSON for save-load. */
export function serializeScheduler(sched) {
  return {
    day: sched.day,
    seasonDay: sched.seasonDay,
    seasonIndex: sched.seasonIndex,
    year: sched.year,
    speed: sched.speed,
  };
}

export function hydrateScheduler(sched, saved) {
  sched.day = saved.day;
  sched.seasonDay = saved.seasonDay;
  sched.seasonIndex = saved.seasonIndex;
  sched.year = saved.year;
  sched.speed = saved.speed ?? 1;
}

export { SECONDS_PER_DAY, DAYS_PER_SEASON, DAYS_PER_YEAR, SEASONS_PER_YEAR, SEASON_NAMES };
