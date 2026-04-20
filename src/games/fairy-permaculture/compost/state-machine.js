/**
 * Fairy Permaculture — Compost state machine.
 *
 * 8 primary states + 3 failure states (see data/compost.json):
 *
 *   empty → filling → triggered → hot → turn-window → cooling → curing → finished
 *                         ↓           ↓          ↓
 *                       stalled    anaerobic   stalled       (ammonia-loss can hit any
 *                                                              hot / turn-window state)
 *
 * Transitions are pure functions `(pile, env) -> { state, reason? }`.
 * `pile` is read-only in these helpers; state timing bookkeeping
 * (daysInState, turnsTotal, etc.) is updated in pile.js.
 *
 * Thresholds are loaded from compost.json so the data file stays the
 * source of truth; defaults live here as fallbacks for testing.
 */

import compostData from "../data/compost.json" with { type: "json" };

// ─── Thresholds (sourced from compost.json) ───────────────────────

export const HOT_VOLUME_M3 = compostData.hot_threshold_volume_m3 ?? 1.0;
export const [CN_BAND_MIN, CN_BAND_MAX] = compostData.hot_cn_band ?? [20, 40];
export const [MOISTURE_BAND_MIN, MOISTURE_BAND_MAX] =
  compostData.hot_moisture_band ?? [50, 65];
export const [TURN_WINDOW_MIN_DAYS, TURN_WINDOW_MAX_DAYS] =
  compostData.turn_window_days ?? [5, 7];

// Extra timing constants (not in data file — keep co-located with state logic).
export const HOT_RAMP_DAYS = 3;        // filling→triggered ramp (thermophilic onset, low end of 3-5)
export const COOLING_DAYS = 4;         // cooling window
export const CURING_DAYS = 10;         // shortened "mellow-activity" cure
export const DRY_STALL_DAYS = 3;       // moisture <30% for this many days → stalled
export const WET_ANAEROBIC_DAYS = 3;   // rain-days streak on uncovered hot pile → anaerobic
export const DRY_STALL_MOISTURE = 30;  // percent — below this counts as "dry"
export const AMMONIA_CN_THRESHOLD = 15; // any tick where mix CN < this → ammonia loss risk
export const FULLY_COOKED_TURNS = 3;   // after this many turns, pile is "done cooking"
                                       // — next turn goes to cooling, not back to hot.
                                       // Keeps a balanced pile inside the "3-6 turns = balanced"
                                       // quality-bias band.

// ─── States ───────────────────────────────────────────────────────

export const STATES = Object.freeze({
  EMPTY:        "empty",
  FILLING:      "filling",
  TRIGGERED:    "triggered",
  HOT:          "hot",
  TURN_WINDOW:  "turn-window",
  COOLING:      "cooling",
  CURING:       "curing",
  FINISHED:     "finished",
  ANAEROBIC:    "anaerobic",
  STALLED:      "stalled",
  AMMONIA_LOSS: "ammonia-loss",
});

const PRIMARY_STATES = new Set([
  STATES.EMPTY,
  STATES.FILLING,
  STATES.TRIGGERED,
  STATES.HOT,
  STATES.TURN_WINDOW,
  STATES.COOLING,
  STATES.CURING,
  STATES.FINISHED,
]);

const FAILURE_STATES = new Set([
  STATES.ANAEROBIC,
  STATES.STALLED,
  STATES.AMMONIA_LOSS,
]);

export function isPrimary(state) {
  return PRIMARY_STATES.has(state);
}

export function isFailure(state) {
  return FAILURE_STATES.has(state);
}

// ─── Predicates ───────────────────────────────────────────────────

export function cnInBand(cn) {
  return cn >= CN_BAND_MIN && cn <= CN_BAND_MAX;
}

export function moistureInBand(m) {
  return m >= MOISTURE_BAND_MIN && m <= MOISTURE_BAND_MAX;
}

export function volumeSufficient(volumeM3) {
  return volumeM3 >= HOT_VOLUME_M3;
}

export function hotReady(pile) {
  return (
    volumeSufficient(pile.volumeM3) &&
    cnInBand(pile.currentCN) &&
    moistureInBand(pile.moisturePct)
  );
}

// ─── Transitions ──────────────────────────────────────────────────
//
// Each function returns either:
//   { state, reason }      — a state transition happened
//   null                   — no transition; caller keeps current state
//
// Callers apply this to a day tick. pile.js handles bookkeeping
// (daysInState reset, quality accumulators, etc.).

/** EMPTY → FILLING once any mass has been added. */
export function stepEmpty(pile) {
  if (pile.volumeM3 > 0 || (pile.ingredients && pile.ingredients.length > 0)) {
    return { state: STATES.FILLING, reason: "first-ingredient" };
  }
  return null;
}

/** FILLING → TRIGGERED when volume + C:N + moisture all meet hot threshold.
 *  FILLING can also fall into ammonia-loss if pure-greens. */
export function stepFilling(pile) {
  if (pile.currentCN != null && pile.currentCN < AMMONIA_CN_THRESHOLD && pile.volumeM3 > 0) {
    return { state: STATES.AMMONIA_LOSS, reason: "cn-too-low" };
  }
  if (hotReady(pile)) {
    return { state: STATES.TRIGGERED, reason: "thresholds-met" };
  }
  return null;
}

/** TRIGGERED → HOT after ramp days (temperature climbing). */
export function stepTriggered(pile) {
  if (pile.daysInState >= HOT_RAMP_DAYS) {
    return { state: STATES.HOT, reason: "thermophilic" };
  }
  return null;
}

/** HOT: check for failure (anaerobic / stalled / ammonia) or turn window. */
export function stepHot(pile, env) {
  // Failure: uncovered + heavy rain streak → anaerobic.
  if (!pile.covered && env && env.rainDaysStreak >= WET_ANAEROBIC_DAYS) {
    return { state: STATES.ANAEROBIC, reason: "rain-saturation" };
  }
  // Failure: pile dried out.
  if (pile.daysDry >= DRY_STALL_DAYS) {
    return { state: STATES.STALLED, reason: "dry" };
  }
  // Failure: C:N dipped below threshold — ammonia loss.
  if (pile.currentCN < AMMONIA_CN_THRESHOLD) {
    return { state: STATES.AMMONIA_LOSS, reason: "cn-too-low" };
  }
  // Turn-window opens.
  if (pile.daysUntilTurnWindow <= 0) {
    return { state: STATES.TURN_WINDOW, reason: "turn-due" };
  }
  return null;
}

/** TURN_WINDOW: waiting for a turn. If the caller hasn't turned
 *  within `turnWindowMaxDays`, the pile cools. Failures also apply. */
export function stepTurnWindow(pile, env) {
  if (!pile.covered && env && env.rainDaysStreak >= WET_ANAEROBIC_DAYS) {
    return { state: STATES.ANAEROBIC, reason: "rain-saturation" };
  }
  if (pile.daysDry >= DRY_STALL_DAYS) {
    return { state: STATES.STALLED, reason: "dry" };
  }
  if (pile.daysInState >= TURN_WINDOW_MAX_DAYS) {
    return { state: STATES.COOLING, reason: "turn-missed" };
  }
  return null;
}

/** COOLING → CURING after cooling period. */
export function stepCooling(pile) {
  if (pile.daysInState >= COOLING_DAYS) {
    return { state: STATES.CURING, reason: "cooled" };
  }
  return null;
}

/** CURING → FINISHED after cure time. */
export function stepCuring(pile) {
  if (pile.daysInState >= CURING_DAYS) {
    return { state: STATES.FINISHED, reason: "cured" };
  }
  return null;
}

/** Finished state is terminal (waits for harvest). */
export function stepFinished() {
  return null;
}

// ─── Failure-state transitions (salvage paths) ────────────────────
//
// No failure is terminal — each has a fix path back to a primary state.
// Quality caps live in quality.js; here we just allow the pile to
// continue on its journey.

/** ANAEROBIC → FILLING once the player/fairy covers + adds browns.
 *  Triggers when covered is true AND moisture drops into the upper band. */
export function stepAnaerobic(pile) {
  if (pile.covered && pile.moisturePct <= MOISTURE_BAND_MAX) {
    return { state: STATES.FILLING, reason: "rebalanced" };
  }
  return null;
}

/** STALLED → FILLING once moisture is restored above the dry threshold. */
export function stepStalled(pile) {
  if (pile.moisturePct >= MOISTURE_BAND_MIN) {
    return { state: STATES.FILLING, reason: "rewetted" };
  }
  return null;
}

/** AMMONIA_LOSS → FILLING once enough browns push C:N back into band.
 *  The quality cap is recorded elsewhere. */
export function stepAmmoniaLoss(pile) {
  if (pile.currentCN >= CN_BAND_MIN) {
    return { state: STATES.FILLING, reason: "cn-restored" };
  }
  return null;
}

// ─── Dispatcher ───────────────────────────────────────────────────

const DISPATCH = {
  [STATES.EMPTY]:        stepEmpty,
  [STATES.FILLING]:      stepFilling,
  [STATES.TRIGGERED]:    stepTriggered,
  [STATES.HOT]:          stepHot,
  [STATES.TURN_WINDOW]:  stepTurnWindow,
  [STATES.COOLING]:      stepCooling,
  [STATES.CURING]:       stepCuring,
  [STATES.FINISHED]:     stepFinished,
  [STATES.ANAEROBIC]:    stepAnaerobic,
  [STATES.STALLED]:      stepStalled,
  [STATES.AMMONIA_LOSS]: stepAmmoniaLoss,
};

/**
 * Compute the next state for a pile given an env snapshot. Pure function:
 * does not mutate pile. Returns `null` if the pile should remain in its
 * current state this tick.
 */
export function nextState(pile, env) {
  const fn = DISPATCH[pile.state];
  if (!fn) return null;
  return fn(pile, env);
}

/**
 * TURN action: if the pile is in TURN_WINDOW, a successful turn rebounds
 * to HOT and resets the turn timer. After FULLY_COOKED_TURNS the pile is
 * "done" and the next turn sends it to COOLING instead — otherwise a
 * diligent player could keep a pile hot forever.
 */
export function applyTurn(pile) {
  if (pile.state !== STATES.TURN_WINDOW) return null;
  if ((pile.turnsTotal ?? 0) >= FULLY_COOKED_TURNS) {
    return { state: STATES.COOLING, reason: "fully-cooked" };
  }
  return { state: STATES.HOT, reason: "turned" };
}
