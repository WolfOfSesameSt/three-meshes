/**
 * pile.js tests — integration of state machine + ingredient math.
 *
 * The marquee test: a well-balanced pile hits HOT within 5 days and
 * FINISHED within 45 days with quality ≥ 4.
 */

import { describe, it, expect } from "vitest";
import { Pile } from "./pile.js";
import { STATES } from "./state-machine.js";

// ─── Helpers ──────────────────────────────────────────────────────

function buildBalancedPile({ covered = true, inoculants = 2 } = {}) {
  const p = new Pile({ variant: "hot-pile", seed: 1, covered });
  // Target: ~310 kg dry mass (1.24 m³ at 250 kg/m³), CN ~23:1, moisture ~54%.
  // Greens (N-rich, wet) weighted slightly heavier than browns to push
  // moisture into the 50-65% hot band.
  p.addIngredient({ id: "fresh-manure",  dryMassKg: 100 }); // CN 18, 78% moisture
  p.addIngredient({ id: "fresh-grass",   dryMassKg: 90 });  // CN 15, 75%
  p.addIngredient({ id: "coffee-grounds", dryMassKg: 10 }); // CN 20, 60%
  p.addIngredient({ id: "dry-leaves",    dryMassKg: 60 });  // CN 60, 15%
  p.addIngredient({ id: "straw",         dryMassKg: 50 });  // CN 80, 12%
  if (inoculants >= 1) p.addIngredient({ id: "forest-duff-imo" });
  if (inoculants >= 2) p.addIngredient({ id: "worm-castings" });
  if (inoculants >= 3) p.addIngredient({ id: "finished-compost-seed" });
  return p;
}

const stableEnv = {
  seasonId: "spring",
  rainedToday: false,
  tempC: 18,
  rainDaysStreak: 0,
};

// ─── Construction ─────────────────────────────────────────────────

describe("new Pile defaults", () => {
  it("starts empty with sensible zero values", () => {
    const p = new Pile();
    expect(p.state).toBe(STATES.EMPTY);
    expect(p.variant).toBe("hot-pile");
    expect(p.ingredients).toEqual([]);
    expect(p.volumeM3).toBe(0);
    expect(p.turnsTotal).toBe(0);
  });

  it("respects variant + covered + seed opts", () => {
    const p = new Pile({ variant: "cold-pile", seed: 99, covered: true });
    expect(p.variant).toBe("cold-pile");
    expect(p.seed).toBe(99);
    expect(p.covered).toBe(true);
  });
});

// ─── addIngredient ────────────────────────────────────────────────

describe("addIngredient", () => {
  it("moves EMPTY → FILLING on first ingredient", () => {
    const p = new Pile();
    p.addIngredient("fresh-grass");
    expect(p.state).toBe(STATES.FILLING);
    expect(p.ingredients).toHaveLength(1);
    expect(p.volumeM3).toBeGreaterThan(0);
  });

  it("ignores unknown ingredient ids silently", () => {
    const p = new Pile();
    p.addIngredient("unobtainium");
    expect(p.state).toBe(STATES.EMPTY);
    expect(p.ingredients).toHaveLength(0);
  });

  it("tracks distinct inoculants in the quality tracker", () => {
    const p = new Pile();
    p.addIngredient("forest-duff-imo");
    p.addIngredient("worm-castings");
    p.addIngredient("worm-castings"); // dupe
    expect(p.qualityTracker.inoculantIds).toEqual([
      "forest-duff-imo",
      "worm-castings",
    ]);
  });

  it("updates mixed CN + moisture after each add", () => {
    const p = new Pile();
    p.addIngredient({ id: "fresh-grass", dryMassKg: 10 });
    const cn1 = p.currentCN;
    p.addIngredient({ id: "dry-leaves", dryMassKg: 10 });
    expect(p.currentCN).toBeGreaterThan(cn1);
  });
});

// ─── Marquee integration test ────────────────────────────────────

describe("balanced pile lifecycle (integration)", () => {
  it("reaches HOT within 5 days and FINISHED within 45 days with Q ≥ 4", () => {
    const p = buildBalancedPile({ covered: true, inoculants: 3 });

    // Sanity: composition lands inside hot band.
    expect(p.currentCN).toBeGreaterThanOrEqual(20);
    expect(p.currentCN).toBeLessThanOrEqual(40);
    expect(p.moisturePct).toBeGreaterThanOrEqual(50);
    expect(p.moisturePct).toBeLessThanOrEqual(65);
    expect(p.volumeM3).toBeGreaterThanOrEqual(1.0);

    let hotDay = -1;
    let finishedDay = -1;
    for (let day = 0; day < 60; day += 1) {
      p.tick(stableEnv);
      // On turn days, turn it to keep it hot.
      if (p.state === STATES.TURN_WINDOW) p.turn();
      if (hotDay < 0 && p.state === STATES.HOT) hotDay = day;
      if (p.state === STATES.FINISHED) {
        finishedDay = day;
        break;
      }
    }

    expect(hotDay).toBeGreaterThanOrEqual(0);
    expect(hotDay).toBeLessThanOrEqual(6); // triggered+ramp = ~5 days
    expect(finishedDay).toBeGreaterThan(0);
    expect(finishedDay).toBeLessThanOrEqual(45);

    const result = p.harvest();
    expect(result.quality).toBeGreaterThanOrEqual(4);
    expect(result.kg).toBeGreaterThan(0);
    expect(result.flags).not.toContain("early-harvest-capped");
  });
});

// ─── Failure paths ────────────────────────────────────────────────

describe("failure: anaerobic under heavy rain", () => {
  it("uncovered pile hit by 3 rain days on HOT flips to anaerobic and caps quality", () => {
    const p = buildBalancedPile({ covered: false, inoculants: 3 });

    // Tick into HOT.
    for (let i = 0; i < 7 && p.state !== STATES.HOT; i += 1) p.tick(stableEnv);
    expect(p.state).toBe(STATES.HOT);

    // 3-day rain streak.
    p.tick({ ...stableEnv, rainedToday: true, rainDaysStreak: 1 });
    p.tick({ ...stableEnv, rainedToday: true, rainDaysStreak: 2 });
    p.tick({ ...stableEnv, rainedToday: true, rainDaysStreak: 3 });

    expect(p.state).toBe(STATES.ANAEROBIC);
    expect(p.qualityTracker.anaerobicFlag).toBe(true);

    const result = p.harvest();
    // Anaerobic → Q1.
    expect(result.quality).toBe(1);
    expect(result.flags).toContain("anaerobic-capped");
  });
});

describe("failure: stalled when dry", () => {
  it("HOT pile that dries out (moisture <30% for DRY_STALL_DAYS) flips to stalled", () => {
    // Start with a balanced pile so it reaches HOT.
    const p = buildBalancedPile({ covered: true, inoculants: 1 });
    // Tick into HOT.
    for (let i = 0; i < 10 && p.state !== STATES.HOT; i += 1) p.tick(stableEnv);
    expect(p.state).toBe(STATES.HOT);

    // Force rapid evaporation by zeroing out moisture directly — this is
    // the kind of emergency drought scenario stalled handles.
    p.moisturePct = 25;
    for (let i = 0; i < 5 && p.state !== STATES.STALLED; i += 1) p.tick(stableEnv);
    expect(p.state).toBe(STATES.STALLED);
  });

  it("salvage: adding wet material pushes moisture back into band → FILLING", () => {
    const p = buildBalancedPile({ covered: true, inoculants: 1 });
    for (let i = 0; i < 10 && p.state !== STATES.HOT; i += 1) p.tick(stableEnv);
    p.moisturePct = 25;
    for (let i = 0; i < 5 && p.state !== STATES.STALLED; i += 1) p.tick(stableEnv);
    expect(p.state).toBe(STATES.STALLED);

    // Dump in a bucket of manure + grass to rewet it.
    p.addIngredient({ id: "fresh-manure", dryMassKg: 100 });
    p.addIngredient({ id: "fresh-grass",  dryMassKg: 100 });
    p.tick(stableEnv);
    expect(p.state).toBe(STATES.FILLING);
  });
});

describe("failure: ammonia-loss on pure greens", () => {
  it("all-greens CN<15 pile enters ammonia-loss", () => {
    const p = new Pile();
    p.addIngredient({ id: "fish-trim",   dryMassKg: 30 }); // CN 5
    p.addIngredient({ id: "fresh-grass", dryMassKg: 30 }); // CN 15
    // Tick once — state machine should catch the low CN.
    p.tick(stableEnv);
    expect(p.state).toBe(STATES.AMMONIA_LOSS);
    expect(p.qualityTracker.ammoniaFlag).toBe(true);
  });

  it("salvage: adding browns to raise CN → FILLING", () => {
    const p = new Pile();
    p.addIngredient({ id: "fish-trim",   dryMassKg: 30 });
    p.addIngredient({ id: "fresh-grass", dryMassKg: 30 });
    p.tick(stableEnv);
    expect(p.state).toBe(STATES.AMMONIA_LOSS);

    // Dump in browns to raise CN back into band.
    p.addIngredient({ id: "straw",      dryMassKg: 200 });
    p.addIngredient({ id: "dry-leaves", dryMassKg: 100 });
    p.tick(stableEnv);
    expect(p.state).toBe(STATES.FILLING);

    // Harvest path should still show the ammonia-cap flag at the end.
    // Push it to finished + harvest for that assertion.
    for (let i = 0; i < 55 && p.state !== STATES.FINISHED; i += 1) {
      if (p.state === STATES.TURN_WINDOW) p.turn();
      p.tick(stableEnv);
    }
    // Ammonia cap persists through to harvest.
    const h = p.harvest();
    expect(h.flags).toContain("ammonia-capped");
    expect(h.quality).toBeLessThanOrEqual(3);
  });
});

describe("turn action", () => {
  it("turn() is a no-op outside TURN_WINDOW", () => {
    const p = new Pile();
    expect(p.turn()).toBe(false);
  });

  it("turn() in TURN_WINDOW increments turnsTotal and returns to HOT", () => {
    const p = buildBalancedPile({ covered: true });
    // Fast-forward into turn-window.
    for (let i = 0; i < 20 && p.state !== STATES.TURN_WINDOW; i += 1) p.tick(stableEnv);
    expect(p.state).toBe(STATES.TURN_WINDOW);
    expect(p.turn()).toBe(true);
    expect(p.state).toBe(STATES.HOT);
    expect(p.turnsTotal).toBe(1);
  });
});

describe("setCovered", () => {
  it("toggles cover and coerces truthiness", () => {
    const p = new Pile();
    p.setCovered(true);
    expect(p.covered).toBe(true);
    p.setCovered(0);
    expect(p.covered).toBe(false);
  });
});

describe("harvest", () => {
  it("resets the pile to EMPTY after harvest", () => {
    const p = buildBalancedPile({ covered: true, inoculants: 3 });
    for (let i = 0; i < 60 && p.state !== STATES.FINISHED; i += 1) {
      if (p.state === STATES.TURN_WINDOW) p.turn();
      p.tick(stableEnv);
    }
    p.harvest();
    expect(p.state).toBe(STATES.EMPTY);
    expect(p.ingredients).toEqual([]);
    expect(p.turnsTotal).toBe(0);
    expect(p.qualityTracker.turnsTotal).toBe(0);
  });

  it("early harvest before FINISHED flags the cap", () => {
    const p = buildBalancedPile({ covered: true });
    // Tick only a few days (nowhere near finished).
    for (let i = 0; i < 10; i += 1) {
      if (p.state === STATES.TURN_WINDOW) p.turn();
      p.tick(stableEnv);
    }
    const r = p.harvest();
    expect(r.flags).toContain("early-harvest-capped");
    expect(r.quality).toBeLessThanOrEqual(3);
  });
});

// ─── Weather / physics ───────────────────────────────────────────

describe("weather + physics", () => {
  it("rain bumps moisture more on uncovered piles than covered ones", () => {
    const p1 = buildBalancedPile({ covered: false });
    const p2 = buildBalancedPile({ covered: true });
    const m1Before = p1.moisturePct;
    const m2Before = p2.moisturePct;
    p1.tick({ ...stableEnv, rainedToday: true });
    p2.tick({ ...stableEnv, rainedToday: true });
    const d1 = p1.moisturePct - m1Before;
    const d2 = p2.moisturePct - m2Before;
    // Covered pile gets a smaller moisture delta for the same rain day
    // (we allow a small tolerance since evaporation also fires in HOT).
    expect(d1).toBeGreaterThan(d2);
  });

  it("temp drifts upward when HOT", () => {
    const p = buildBalancedPile({ covered: true });
    for (let i = 0; i < 10 && p.state !== STATES.HOT; i += 1) p.tick(stableEnv);
    const tempBefore = p.tempC;
    p.tick(stableEnv);
    expect(p.tempC).toBeGreaterThanOrEqual(tempBefore);
  });
});

// ─── Serialization ────────────────────────────────────────────────

describe("serialize / fromSerialized round-trip", () => {
  it("mid-simulation pile round-trips identically", () => {
    const p = buildBalancedPile({ covered: true, inoculants: 2 });
    // Advance a bunch of days, including a turn.
    for (let i = 0; i < 15; i += 1) {
      if (p.state === STATES.TURN_WINDOW) p.turn();
      p.tick(stableEnv);
    }
    const payload = p.serialize();
    const json = JSON.stringify(payload);
    const revived = Pile.fromSerialized(json);

    // Deep-equal: serialize both and compare.
    expect(revived.serialize()).toEqual(payload);
  });

  it("round-trips NaN / Infinity sentinel values", () => {
    const p = new Pile();
    // currentCN is NaN before any ingredients.
    expect(Number.isNaN(p.currentCN)).toBe(true);
    const json = JSON.stringify(p.serialize());
    const revived = Pile.fromSerialized(json);
    expect(Number.isNaN(revived.currentCN)).toBe(true);
    expect(Number.isNaN(revived.moisturePct)).toBe(true);
  });

  it("round-trips finished pile including quality flags", () => {
    const p = buildBalancedPile({ covered: false, inoculants: 3 });
    // Force anaerobic path.
    for (let i = 0; i < 7 && p.state !== STATES.HOT; i += 1) p.tick(stableEnv);
    p.tick({ ...stableEnv, rainedToday: true, rainDaysStreak: 1 });
    p.tick({ ...stableEnv, rainedToday: true, rainDaysStreak: 2 });
    p.tick({ ...stableEnv, rainedToday: true, rainDaysStreak: 3 });
    expect(p.state).toBe(STATES.ANAEROBIC);

    const serialized = p.serialize();
    const revived = Pile.fromSerialized(serialized);
    expect(revived.state).toBe(STATES.ANAEROBIC);
    expect(revived.qualityTracker.anaerobicFlag).toBe(true);
  });

  it("fromSerialized accepts a JSON string too", () => {
    const p = new Pile({ variant: "cold-pile", seed: 7 });
    const json = JSON.stringify(p.serialize());
    const revived = Pile.fromSerialized(json);
    expect(revived.variant).toBe("cold-pile");
    expect(revived.seed).toBe(7);
  });
});
