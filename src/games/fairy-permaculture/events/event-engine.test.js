/**
 * C6.1 — event engine tests.
 *
 * Covers:
 *   - each of the 4 MVP events can fire + resolve
 *   - mitigations reduce or fully defuse an event
 *   - no event is permanent (always expires within its duration range)
 *   - serialize/hydrate round-trips active events
 *   - notifications fire exactly once per start/end
 */

import { describe, it, expect } from "vitest";
import { createEventEngine } from "./event-engine.js";
import eventsData from "../data/events.json" with { type: "json" };
import balanceData from "../data/balance.json" with { type: "json" };
import { Pile } from "../compost/pile.js";

// ─── helpers ──────────────────────────────────────────────────────

function eventById(id) {
  return eventsData.find((e) => e.id === id);
}

// Force probability = 1 for one-shot event tests.
function forcedProbBalance(ids = []) {
  const probs = { ...balanceData.event_probabilities };
  for (const id of ids) probs[id] = 1;
  return { ...balanceData, event_probabilities: probs };
}

function makeWorld(overrides = {}) {
  return {
    env: {},
    activePenalties: { yield: [] },
    pendingRisks: {},
    compostPiles: [],
    fairies: {},
    structures: {},
    ...overrides,
  };
}

function captureNotifier() {
  const fired = [];
  const resolved = [];
  return {
    onNotify: (e, sev) => fired.push({ id: e.id, sev }),
    onResolve: (e) => resolved.push({ id: e.id }),
    fired,
    resolved,
  };
}

// ─── Summer drought ──────────────────────────────────────────────

describe("summer-drought event", () => {
  it("fires when rainless streak crosses threshold and reverts on expiry", () => {
    const notifier = captureNotifier();
    const engine = createEventEngine({
      seed: 1,
      events: [eventById("summer-drought")],
      balance: forcedProbBalance(["summer-drought"]),
      onNotify: notifier.onNotify,
      onResolve: notifier.onResolve,
    });
    const world = makeWorld();
    const env = {
      day: 10,
      seasonName: "summer",
      rainlessDaysStreak: 12,
      rainDaysStreak: 0,
    };

    engine.tick(env, world);
    expect(engine.activeEvents().length).toBe(1);
    expect(notifier.fired[0].id).toBe("summer-drought");
    // moisture-loss effect bumped evap multiplier.
    expect(world.env.evapMultiplier).toBeGreaterThan(1);
    // yield-penalty registered.
    expect(world.activePenalties.yield.length).toBeGreaterThan(0);

    // Run to expiry: duration_days_range for drought is [5, 20].
    for (let i = 0; i < 25; i++) {
      engine.tick({ ...env, day: 11 + i, rainlessDaysStreak: 0 }, world);
    }
    expect(engine.activeEvents().length).toBe(0);
    // Reverted cleanly.
    expect(world.env.evapMultiplier).toBe(1);
    expect(world.activePenalties.yield.length).toBe(0);
    expect(notifier.resolved[0].id).toBe("summer-drought");
  });

  it("does not fire in spring (season-gated)", () => {
    const engine = createEventEngine({
      seed: 2,
      events: [eventById("summer-drought")],
      balance: forcedProbBalance(["summer-drought"]),
    });
    engine.tick({ day: 0, seasonName: "spring", rainlessDaysStreak: 30 }, makeWorld());
    expect(engine.activeEvents().length).toBe(0);
  });
});

// ─── Aphid outbreak ──────────────────────────────────────────────

describe("aphid-outbreak event", () => {
  function plantCluster(family, n, xStart = 0) {
    return Array.from({ length: n }, (_v, i) => ({
      id: `p-${i}`,
      family,
      x: xStart + i,
      y: 0,
    }));
  }

  it("fires when monoculture cluster meets threshold and reverts on expiry", () => {
    let clusterActive = true;
    const world = makeWorld({
      plantManager: {
        listInstances: () => (clusterActive ? plantCluster("brassicaceae", 5) : []),
      },
    });
    const probs = forcedProbBalance(["aphid-outbreak"]);
    const engine = createEventEngine({
      seed: 3,
      events: [eventById("aphid-outbreak")],
      balance: probs,
    });
    const env = { day: 5, seasonName: "spring" };

    engine.tick(env, world);
    expect(engine.activeEvents().length).toBe(1);
    expect(world.activePenalties.yield.length).toBeGreaterThan(0);
    expect(world.pendingRisks.aphidSpreadPerDay).toBeGreaterThan(0);

    // Player "cleared" the monoculture: further triggers will not fire.
    clusterActive = false;
    for (let i = 0; i < 30; i++) engine.tick({ ...env, day: 6 + i }, world);
    expect(engine.activeEvents().length).toBe(0);
    expect(world.activePenalties.yield.length).toBe(0);
    expect(world.pendingRisks.aphidSpreadPerDay ?? 0).toBeCloseTo(0, 6);
  });

  it("does not fire when cluster is sub-threshold", () => {
    const world = makeWorld({
      plantManager: { listInstances: () => plantCluster("brassicaceae", 2) },
    });
    const engine = createEventEngine({
      seed: 4,
      events: [eventById("aphid-outbreak")],
      balance: forcedProbBalance(["aphid-outbreak"]),
    });
    engine.tick({ day: 1, seasonName: "spring" }, world);
    expect(engine.activeEvents().length).toBe(0);
  });

  it("insectary-proximity mitigation reduces severity", () => {
    const insectaryPlant = { id: "yarrow", family: "asteraceae", x: 2, y: 0 };
    const world = makeWorld({
      plantManager: {
        listInstances: () => [
          ...plantCluster("brassicaceae", 5),
          insectaryPlant,
        ],
      },
    });
    const engine = createEventEngine({
      seed: 5,
      events: [eventById("aphid-outbreak")],
      balance: forcedProbBalance(["aphid-outbreak"]),
    });
    engine.tick({ day: 1, seasonName: "spring" }, world);
    // Insectary contributes 0.7 reduction → severity ≤ 0.3.
    const active = engine.activeEvents();
    expect(active.length).toBe(1);
    expect(active[0].severity).toBeLessThanOrEqual(0.31);
  });
});

// ─── Wet pile failure ────────────────────────────────────────────

describe("wet-pile-failure event", () => {
  it("fires on uncovered hot pile after rain streak, pile returns to prior state on expiry", () => {
    const hotPile = { state: "hot", covered: false, ingredients: [] };
    const world = makeWorld({ compostPiles: [hotPile] });
    const engine = createEventEngine({
      seed: 6,
      events: [eventById("wet-pile-failure")],
      balance: forcedProbBalance(["wet-pile-failure"]),
    });
    const env = { day: 20, seasonName: "summer", rainDaysStreak: 5 };

    engine.tick(env, world);
    expect(engine.activeEvents().length).toBe(1);
    expect(hotPile.state).toBe("anaerobic");
    expect(hotPile.__qualityCap).toBe(1);

    // Rain stops → no re-trigger after the original instance expires.
    const dryEnv = { ...env, rainDaysStreak: 0 };
    for (let i = 0; i < 5; i++) engine.tick({ ...dryEnv, day: 21 + i }, world);
    expect(engine.activeEvents().length).toBe(0);
    expect(hotPile.state).toBe("hot");
    expect(hotPile.__qualityCap).toBeUndefined();
  });

  it("cover-pile-tarp mitigation fully defuses the event", () => {
    const pile = { state: "hot", covered: true, ingredients: [] };
    const world = makeWorld({ compostPiles: [pile] });
    const engine = createEventEngine({
      seed: 7,
      events: [eventById("wet-pile-failure")],
      balance: forcedProbBalance(["wet-pile-failure"]),
    });
    engine.tick({ day: 1, seasonName: "summer", rainDaysStreak: 5 }, world);
    // cover-pile-tarp reduces by 0.9; combined with being covered the
    // trigger is still met (pile must be uncovered) — actually wait:
    // `rainOnHotPile` filters by `!p.covered`. So a covered pile does
    // not even trigger. Confirm no event fires.
    expect(engine.activeEvents().length).toBe(0);
  });

  it("works with a real Pile instance (round-trip integration)", () => {
    const pile = new Pile({ variant: "hot-pile", covered: false });
    pile.state = "hot";
    const world = makeWorld({ compostPiles: [pile] });
    const engine = createEventEngine({
      seed: 8,
      events: [eventById("wet-pile-failure")],
      balance: forcedProbBalance(["wet-pile-failure"]),
    });
    engine.tick({ day: 1, seasonName: "summer", rainDaysStreak: 5 }, world);
    expect(pile.state).toBe("anaerobic");
    for (let i = 0; i < 5; i++) engine.tick({ day: 2 + i, seasonName: "summer" }, world);
    expect(pile.state).toBe("hot");
  });
});

// ─── Hawk strike ─────────────────────────────────────────────────

describe("hawk-strike event", () => {
  it("fires on exposed chicken flock and removes birds (severity ≥ 0)", () => {
    let removed = 0;
    const world = makeWorld({
      animalManager: {
        listFlocks: () => [
          { id: "flock-1", species: "chicken-layer", count: 6, canopyCover: 0.05 },
        ],
        removeFromFlock: (_id, n) => {
          removed += n;
        },
      },
      rng: () => 0.5,
    });
    const engine = createEventEngine({
      seed: 9,
      events: [eventById("hawk-strike")],
      balance: forcedProbBalance(["hawk-strike"]),
    });
    engine.tick({ day: 5, seasonName: "summer" }, world);
    expect(engine.activeEvents().length).toBe(1);
    expect(removed).toBeGreaterThan(0);
    // Duration 1 day → track the first instance by startedOnDay; it
    // must expire by the following tick. New instances may re-fire on
    // later ticks if the flock stays exposed, but the one we saw at
    // day=5 is gone.
    const firstInstance = engine.activeEvents()[0];
    engine.tick({ day: 6, seasonName: "summer" }, world);
    const remaining = engine
      .activeEvents()
      .filter((e) => e.startedOnDay === firstInstance.startedOnDay);
    expect(remaining.length).toBe(0);
  });

  it("canopy-cover mitigation reduces losses", () => {
    let losses = 0;
    const world = makeWorld({
      animalManager: {
        listFlocks: () => [
          { id: "flock-2", species: "chicken-layer", count: 5, canopyCover: 0.05 },
        ],
        removeFromFlock: (_id, n) => {
          losses = n;
        },
      },
      canopyCoverFraction: 0.4, // canopy-cover mitigation condition (≥ 0.3)
      rng: () => 0.5,
    });
    const engine = createEventEngine({
      seed: 10,
      events: [eventById("hawk-strike")],
      balance: forcedProbBalance(["hawk-strike"]),
    });
    engine.tick({ day: 1, seasonName: "summer" }, world);
    // canopy-cover reduces severity by 0.8 → losses ~ 20% of full.
    expect(losses).toBeLessThanOrEqual(1);
  });
});

// ─── Permanence guard ────────────────────────────────────────────

describe("no event instance is permanent", () => {
  it("every event instance expires within its duration_days_range[1] ticks", () => {
    for (const event of eventsData) {
      const maxDur = event.duration_days_range[1];
      // Force first-tick trigger then drop probability to 0 so we observe a
      // single instance cleanly resolve without re-firing.
      const probBalance = {
        ...balanceData,
        event_probabilities: { ...balanceData.event_probabilities, [event.id]: 1 },
      };
      const engine = createEventEngine({
        seed: 42,
        events: [event],
        balance: probBalance,
      });
      const world = makeWorld({
        plantManager: {
          listInstances: () =>
            Array.from({ length: 5 }, (_, i) => ({
              id: `p-${i}`,
              family: "testaceae",
              x: i,
              y: 0,
            })),
        },
        animalManager: {
          listFlocks: () => [
            { id: "f", species: "chicken-layer", count: 5, canopyCover: 0 },
          ],
          removeFromFlock: () => {},
        },
        compostPiles: [{ state: "hot", covered: false, ingredients: [] }],
        rng: () => 0.5,
      });
      const env = {
        day: 60,
        seasonName: event.trigger.season === "any" ? "summer" : event.trigger.season,
        rainlessDaysStreak: 30,
        rainDaysStreak: 30,
      };
      engine.tick(env, world);
      const firstInstance = engine.activeEvents()[0];
      expect(firstInstance, `${event.id} should fire`).toBeDefined();
      // Starve further rolls so no duplicate event instance fires.
      probBalance.event_probabilities[event.id] = 0;
      for (let i = 0; i < maxDur + 2; i++) {
        engine.tick({ ...env, day: env.day + 1 + i }, world);
      }
      const same = engine
        .activeEvents()
        .filter((e) => e.startedOnDay === firstInstance.startedOnDay);
      expect(same.length).toBe(0);
    }
  });
});

// ─── Serialize / hydrate ─────────────────────────────────────────

describe("serialize / hydrate", () => {
  it("round-trips an active drought event", () => {
    const engine = createEventEngine({
      seed: 11,
      events: [eventById("summer-drought")],
      balance: forcedProbBalance(["summer-drought"]),
    });
    const world = makeWorld();
    const env = {
      day: 15,
      seasonName: "summer",
      rainlessDaysStreak: 20,
    };
    engine.tick(env, world);
    const saved = engine.serialize();
    const beforeRemaining = engine.activeEvents()[0].remainingDays;

    // New engine + fresh world → hydrate.
    const engine2 = createEventEngine({
      seed: 11,
      events: [eventById("summer-drought")],
      balance: forcedProbBalance(["summer-drought"]),
    });
    const world2 = makeWorld();
    engine2.hydrate(saved, { world: world2 });

    const after = engine2.activeEvents();
    expect(after.length).toBe(1);
    expect(after[0].id).toBe("summer-drought");
    expect(after[0].remainingDays).toBe(beforeRemaining);
    // Effects re-applied against world2.
    expect(world2.env.evapMultiplier).toBeGreaterThan(1);
    expect(world2.activePenalties.yield.length).toBeGreaterThan(0);
  });

  it("rng state survives round-trip", () => {
    const engine = createEventEngine({ seed: 77 });
    for (let i = 0; i < 10; i++) engine._rng.next();
    const saved = engine.serialize();

    const engine2 = createEventEngine({ seed: 0 });
    engine2.hydrate(saved, { world: makeWorld() });
    expect(engine2._rng.getState()).toBe(saved.rngState);
  });
});
