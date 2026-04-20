/**
 * state-machine.js tests — every transition + all 4 failure modes.
 */

import { describe, it, expect } from "vitest";
import {
  STATES,
  nextState,
  applyTurn,
  cnInBand,
  moistureInBand,
  volumeSufficient,
  hotReady,
  isPrimary,
  isFailure,
  HOT_RAMP_DAYS,
  TURN_WINDOW_MAX_DAYS,
  COOLING_DAYS,
  CURING_DAYS,
  DRY_STALL_DAYS,
  WET_ANAEROBIC_DAYS,
  CN_BAND_MIN,
  CN_BAND_MAX,
  MOISTURE_BAND_MIN,
  MOISTURE_BAND_MAX,
} from "./state-machine.js";

// Factory for a minimal pile-like object.
function makePile(overrides = {}) {
  return {
    state: STATES.EMPTY,
    daysInState: 0,
    volumeM3: 0,
    currentCN: 25,
    moisturePct: 55,
    tempC: 18,
    ingredients: [],
    turnsTotal: 0,
    daysUntilTurnWindow: 6,
    daysDry: 0,
    covered: false,
    ...overrides,
  };
}

const env = (o = {}) => ({ rainedToday: false, rainDaysStreak: 0, tempC: 18, ...o });

describe("primitive predicates", () => {
  it("cnInBand reflects data/compost.json range", () => {
    expect(cnInBand(CN_BAND_MIN)).toBe(true);
    expect(cnInBand(CN_BAND_MAX)).toBe(true);
    expect(cnInBand(CN_BAND_MIN - 1)).toBe(false);
    expect(cnInBand(CN_BAND_MAX + 1)).toBe(false);
  });

  it("moistureInBand reflects data/compost.json range", () => {
    expect(moistureInBand(MOISTURE_BAND_MIN)).toBe(true);
    expect(moistureInBand(MOISTURE_BAND_MAX)).toBe(true);
    expect(moistureInBand(MOISTURE_BAND_MIN - 1)).toBe(false);
  });

  it("volumeSufficient at 1 m³", () => {
    expect(volumeSufficient(0.99)).toBe(false);
    expect(volumeSufficient(1.0)).toBe(true);
    expect(volumeSufficient(2.0)).toBe(true);
  });

  it("hotReady requires all three predicates", () => {
    expect(hotReady({ volumeM3: 1.2, currentCN: 25, moisturePct: 55 })).toBe(true);
    expect(hotReady({ volumeM3: 0.5, currentCN: 25, moisturePct: 55 })).toBe(false);
    expect(hotReady({ volumeM3: 1.2, currentCN: 10, moisturePct: 55 })).toBe(false);
    expect(hotReady({ volumeM3: 1.2, currentCN: 25, moisturePct: 30 })).toBe(false);
  });

  it("isPrimary / isFailure partition the state set", () => {
    expect(isPrimary(STATES.HOT)).toBe(true);
    expect(isFailure(STATES.ANAEROBIC)).toBe(true);
    expect(isPrimary(STATES.ANAEROBIC)).toBe(false);
  });
});

// ─── Primary-state transitions ────────────────────────────────────

describe("EMPTY → FILLING", () => {
  it("fires once any mass is added", () => {
    const t = nextState(makePile({ state: STATES.EMPTY, volumeM3: 0.2 }), env());
    expect(t).toEqual({ state: STATES.FILLING, reason: "first-ingredient" });
  });

  it("no-op if still empty", () => {
    expect(nextState(makePile(), env())).toBeNull();
  });
});

describe("FILLING → TRIGGERED", () => {
  it("fires when volume+CN+moisture all meet the band", () => {
    const p = makePile({ state: STATES.FILLING, volumeM3: 1.2, currentCN: 25, moisturePct: 55 });
    expect(nextState(p, env())).toEqual({ state: STATES.TRIGGERED, reason: "thresholds-met" });
  });

  it("stays in FILLING below volume threshold", () => {
    const p = makePile({ state: STATES.FILLING, volumeM3: 0.5, currentCN: 25, moisturePct: 55 });
    expect(nextState(p, env())).toBeNull();
  });

  it("falls to AMMONIA_LOSS when CN < 15 with volume > 0", () => {
    const p = makePile({ state: STATES.FILLING, volumeM3: 0.5, currentCN: 8, moisturePct: 55 });
    expect(nextState(p, env())).toEqual({ state: STATES.AMMONIA_LOSS, reason: "cn-too-low" });
  });
});

describe("TRIGGERED → HOT", () => {
  it("fires after HOT_RAMP_DAYS", () => {
    const p = makePile({ state: STATES.TRIGGERED, daysInState: HOT_RAMP_DAYS });
    expect(nextState(p, env())).toEqual({ state: STATES.HOT, reason: "thermophilic" });
  });

  it("no-op before ramp complete", () => {
    const p = makePile({ state: STATES.TRIGGERED, daysInState: 2 });
    expect(nextState(p, env())).toBeNull();
  });
});

describe("HOT state: normal + failure transitions", () => {
  it("HOT → TURN_WINDOW when the turn counter hits 0", () => {
    const p = makePile({ state: STATES.HOT, daysUntilTurnWindow: 0 });
    expect(nextState(p, env())).toEqual({ state: STATES.TURN_WINDOW, reason: "turn-due" });
  });

  it("HOT → ANAEROBIC after heavy rain streak on uncovered pile", () => {
    const p = makePile({ state: STATES.HOT, covered: false });
    expect(nextState(p, env({ rainDaysStreak: WET_ANAEROBIC_DAYS }))).toEqual({
      state: STATES.ANAEROBIC, reason: "rain-saturation",
    });
  });

  it("HOT stays put if the pile is covered, even after a long rain streak", () => {
    const p = makePile({ state: STATES.HOT, covered: true, daysUntilTurnWindow: 3 });
    expect(nextState(p, env({ rainDaysStreak: 10 }))).toBeNull();
  });

  it("HOT → STALLED after dry-streak exceeds DRY_STALL_DAYS", () => {
    const p = makePile({ state: STATES.HOT, daysDry: DRY_STALL_DAYS, daysUntilTurnWindow: 3 });
    expect(nextState(p, env())).toEqual({ state: STATES.STALLED, reason: "dry" });
  });

  it("HOT → AMMONIA_LOSS when CN slips below 15", () => {
    const p = makePile({ state: STATES.HOT, currentCN: 10, daysUntilTurnWindow: 3 });
    expect(nextState(p, env())).toEqual({ state: STATES.AMMONIA_LOSS, reason: "cn-too-low" });
  });
});

describe("TURN_WINDOW", () => {
  it("TURN_WINDOW → COOLING after window expires", () => {
    const p = makePile({ state: STATES.TURN_WINDOW, daysInState: TURN_WINDOW_MAX_DAYS });
    expect(nextState(p, env())).toEqual({ state: STATES.COOLING, reason: "turn-missed" });
  });

  it("applyTurn in TURN_WINDOW rebounds to HOT", () => {
    expect(applyTurn({ state: STATES.TURN_WINDOW })).toEqual({ state: STATES.HOT, reason: "turned" });
  });

  it("applyTurn is a no-op outside TURN_WINDOW", () => {
    expect(applyTurn({ state: STATES.HOT })).toBeNull();
    expect(applyTurn({ state: STATES.EMPTY })).toBeNull();
  });

  it("TURN_WINDOW can still go anaerobic", () => {
    const p = makePile({ state: STATES.TURN_WINDOW, covered: false, daysInState: 1 });
    expect(nextState(p, env({ rainDaysStreak: WET_ANAEROBIC_DAYS }))).toEqual({
      state: STATES.ANAEROBIC, reason: "rain-saturation",
    });
  });

  it("TURN_WINDOW can stall from dryness", () => {
    const p = makePile({ state: STATES.TURN_WINDOW, daysDry: DRY_STALL_DAYS });
    expect(nextState(p, env())).toEqual({ state: STATES.STALLED, reason: "dry" });
  });
});

describe("COOLING → CURING", () => {
  it("fires after COOLING_DAYS", () => {
    const p = makePile({ state: STATES.COOLING, daysInState: COOLING_DAYS });
    expect(nextState(p, env())).toEqual({ state: STATES.CURING, reason: "cooled" });
  });

  it("no-op before COOLING_DAYS", () => {
    const p = makePile({ state: STATES.COOLING, daysInState: 1 });
    expect(nextState(p, env())).toBeNull();
  });
});

describe("CURING → FINISHED", () => {
  it("fires after CURING_DAYS", () => {
    const p = makePile({ state: STATES.CURING, daysInState: CURING_DAYS });
    expect(nextState(p, env())).toEqual({ state: STATES.FINISHED, reason: "cured" });
  });

  it("no-op before CURING_DAYS", () => {
    const p = makePile({ state: STATES.CURING, daysInState: 5 });
    expect(nextState(p, env())).toBeNull();
  });
});

describe("FINISHED is terminal", () => {
  it("returns null from the step function", () => {
    const p = makePile({ state: STATES.FINISHED });
    expect(nextState(p, env())).toBeNull();
  });
});

// ─── Failure-state salvage paths ──────────────────────────────────

describe("ANAEROBIC salvage", () => {
  it("returns to FILLING when covered + moisture drops into band", () => {
    const p = makePile({ state: STATES.ANAEROBIC, covered: true, moisturePct: MOISTURE_BAND_MAX });
    expect(nextState(p, env())).toEqual({ state: STATES.FILLING, reason: "rebalanced" });
  });

  it("stays anaerobic while uncovered", () => {
    const p = makePile({ state: STATES.ANAEROBIC, covered: false, moisturePct: 60 });
    expect(nextState(p, env())).toBeNull();
  });

  it("stays anaerobic while still saturated", () => {
    const p = makePile({ state: STATES.ANAEROBIC, covered: true, moisturePct: 90 });
    expect(nextState(p, env())).toBeNull();
  });
});

describe("STALLED salvage", () => {
  it("returns to FILLING once moisture crosses the lower band edge", () => {
    const p = makePile({ state: STATES.STALLED, moisturePct: MOISTURE_BAND_MIN });
    expect(nextState(p, env())).toEqual({ state: STATES.FILLING, reason: "rewetted" });
  });

  it("stays stalled while still dry", () => {
    const p = makePile({ state: STATES.STALLED, moisturePct: 20 });
    expect(nextState(p, env())).toBeNull();
  });
});

describe("AMMONIA_LOSS salvage", () => {
  it("returns to FILLING once CN climbs back into band", () => {
    const p = makePile({ state: STATES.AMMONIA_LOSS, currentCN: CN_BAND_MIN });
    expect(nextState(p, env())).toEqual({ state: STATES.FILLING, reason: "cn-restored" });
  });

  it("stays in ammonia-loss while CN below band", () => {
    const p = makePile({ state: STATES.AMMONIA_LOSS, currentCN: 10 });
    expect(nextState(p, env())).toBeNull();
  });
});

describe("unknown state", () => {
  it("nextState returns null for an unknown state string (defensive)", () => {
    expect(nextState({ state: "nonexistent-state" }, env())).toBeNull();
  });
});
