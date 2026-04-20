/**
 * determinism.test.js — same seed + same inputs → identical end-state.
 *
 * The pile simulation must never rely on Math.random or Date.now.
 */

import { describe, it, expect } from "vitest";
import { Pile } from "./pile.js";
import { STATES } from "./state-machine.js";

function sequence() {
  // A deterministic sequence of (day, action) steps.
  return [
    { day: 0, add: [{ id: "fresh-manure", dryMassKg: 80 }] },
    { day: 0, add: [{ id: "fresh-grass",  dryMassKg: 70 }] },
    { day: 0, add: [{ id: "dry-leaves",   dryMassKg: 80 }] },
    { day: 0, add: [{ id: "straw",        dryMassKg: 70 }] },
    { day: 0, add: [{ id: "coffee-grounds", dryMassKg: 10 }] },
    { day: 0, add: [{ id: "forest-duff-imo" }, { id: "worm-castings" }] },
  ];
}

function envForDay(day) {
  // Deterministic "weather" function of day index.
  const rainedToday = day % 5 === 0 && day > 0 && day < 10;
  return {
    seasonId: "spring",
    rainedToday,
    tempC: 18 + ((day * 3) % 7),
    rainDaysStreak: rainedToday ? 1 : 0,
  };
}

function runSimulation(seed) {
  const p = new Pile({ variant: "hot-pile", seed, covered: true });
  const steps = sequence();
  for (const s of steps) for (const ing of s.add) p.addIngredient(ing);

  for (let day = 0; day < 50; day += 1) {
    p.tick(envForDay(day));
    if (p.state === STATES.TURN_WINDOW) p.turn();
    if (p.state === STATES.FINISHED) break;
  }
  return p.serialize();
}

describe("determinism", () => {
  it("two runs with the same seed + inputs produce identical end-state", () => {
    const a = runSimulation(42);
    const b = runSimulation(42);
    expect(b).toEqual(a);
  });

  it("a mid-simulation serialize → deserialize → continue ends where one-shot ends", () => {
    const full = runSimulation(7);

    const p = new Pile({ variant: "hot-pile", seed: 7, covered: true });
    for (const ing of sequence().flatMap((s) => s.add)) p.addIngredient(ing);
    for (let day = 0; day < 10; day += 1) {
      p.tick(envForDay(day));
      if (p.state === STATES.TURN_WINDOW) p.turn();
    }
    const mid = p.serialize();
    const revived = Pile.fromSerialized(mid);
    for (let day = 10; day < 50; day += 1) {
      revived.tick(envForDay(day));
      if (revived.state === STATES.TURN_WINDOW) revived.turn();
      if (revived.state === STATES.FINISHED) break;
    }
    expect(revived.serialize()).toEqual(full);
  });

  it("different seeds currently produce identical simulations (no RNG jitter yet)", () => {
    // Documents current behavior: seed is stored but not consumed.
    // If a future chunk adds jitter this test should fail and prompt a
    // rewrite to verify divergence.
    const a = runSimulation(1);
    const b = runSimulation(999);
    // Compare everything EXCEPT the seed field.
    const { seed: _sa, ...aRest } = a;
    const { seed: _sb, ...bRest } = b;
    expect(bRest).toEqual(aRest);
  });
});
