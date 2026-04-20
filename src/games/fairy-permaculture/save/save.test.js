/**
 * C6.5 — save/load tests.
 *
 * Round-trip: mid-game state → serialize → hydrate → deep equal on the
 * observable subsystems (scheduler, tree-state, events, compost,
 * weather streaks, fairy-food).
 *
 * Plus schema-version migration + rejection of newer saves.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { serializeGame } from "./serialize.js";
import { hydrateGame } from "./hydrate.js";
import { SAVE_SCHEMA_VERSION, MIGRATIONS, migratePayload } from "./schema-version.js";
import {
  saveSlot,
  loadSlot,
  listSlots,
  deleteSlot,
  loadSlotMeta,
} from "./storage.js";
import { startAutosave } from "./autosave.js";

import {
  createScheduler,
  advanceDay,
} from "../core/day-tick.js";
import { createTreeState, unlock } from "../progression/tree-state.js";
import {
  createSoilField,
  initializeFromOmField,
  tickSoil,
} from "../farm/soil.js";
import { createWeatherListener } from "../core/weather.js";
import { createEventEngine } from "../events/event-engine.js";
import { Pile } from "../compost/pile.js";

import eventsData from "../data/events.json" with { type: "json" };
import balanceData from "../data/balance.json" with { type: "json" };
import biomeData from "../data/biomes/bc-coastal.json" with { type: "json" };

// ─── In-memory localStorage shim ─────────────────────────────────

class MemStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

beforeEach(() => {
  // Fresh in-memory store for every test.
  globalThis.localStorage = new MemStorage();
});

// ─── Builders ────────────────────────────────────────────────────

function buildGame({ soilSize = 4 } = {}) {
  const scheduler = createScheduler();
  const treeState = createTreeState();
  const soilField = createSoilField(soilSize);
  initializeFromOmField(soilField, new Float32Array(soilSize * soilSize).fill(3));
  const weatherListener = createWeatherListener(biomeData, 42);
  const eventEngine = createEventEngine({
    seed: 42,
    events: eventsData,
    balance: balanceData,
  });
  const compostPiles = [];
  const fairyFood = { honey: 0, milk: 0, fruit: 0 };
  return {
    scheduler,
    treeState,
    soilField,
    weatherListener,
    eventEngine,
    compostPiles,
    fairyFood,
    biomeSeed: 42,
  };
}

// ─── Round-trip ──────────────────────────────────────────────────

describe("save round-trip", () => {
  it("deep-equals across scheduler + tree + weather + fairy-food + soil summary", () => {
    const a = buildGame();
    // Drive 50 days, pick up a root unlock, stash some fairy food.
    for (let i = 0; i < 50; i++) {
      const env = { day: a.scheduler.day };
      a.weatherListener(env);
      tickSoil(a.soilField, env);
      advanceDay(a.scheduler, env);
    }
    // Unlock any currently-available node (the Root in BC's tree).
    const rootId = [...a.treeState.available][0];
    unlock(a.treeState, rootId);
    a.fairyFood.honey = 12;
    a.fairyFood.milk = 4;
    a.fairyFood.fruit = 9;

    // Add a compost pile mid-lifecycle.
    const pile = new Pile({ variant: "hot-pile", covered: true });
    pile.addIngredient({ id: "fresh-grass", dryMassKg: 40 });
    pile.addIngredient({ id: "dry-leaves", dryMassKg: 40 });
    for (let i = 0; i < 3; i++) pile.tick({ seasonId: "spring", rainedToday: false });
    a.compostPiles.push(pile);

    const payload = serializeGame(a);
    expect(payload.version).toBe(SAVE_SCHEMA_VERSION);

    // Fresh game, hydrate into it.
    const b = buildGame();
    hydrateGame(b, payload);

    expect(b.scheduler.day).toBe(a.scheduler.day);
    expect(b.scheduler.year).toBe(a.scheduler.year);
    expect(b.scheduler.seasonIndex).toBe(a.scheduler.seasonIndex);
    expect([...b.treeState.unlocked]).toEqual([...a.treeState.unlocked]);
    expect(b.fairyFood).toEqual(a.fairyFood);
    expect(b.weatherListener.serialize()).toEqual(a.weatherListener.serialize());
    expect(b.compostPiles.length).toBe(1);
    expect(b.compostPiles[0].state).toBe(pile.state);
    expect(b.compostPiles[0].ingredients).toEqual(pile.ingredients);
  });

  it("serialize → JSON.stringify → JSON.parse → hydrate preserves state", () => {
    const a = buildGame();
    for (let i = 0; i < 20; i++) {
      const env = { day: a.scheduler.day };
      a.weatherListener(env);
      advanceDay(a.scheduler, env);
    }
    const payload = JSON.parse(JSON.stringify(serializeGame(a)));
    const b = buildGame();
    hydrateGame(b, payload);
    expect(b.scheduler.day).toBe(a.scheduler.day);
  });

  it("restores an active event with effects re-applied to world state", () => {
    const a = buildGame();
    // Force a drought to fire right now.
    const forcedBalance = {
      ...balanceData,
      event_probabilities: { ...balanceData.event_probabilities, "summer-drought": 1 },
    };
    a.eventEngine = createEventEngine({
      seed: 100,
      events: eventsData,
      balance: forcedBalance,
    });
    const env = {
      day: 0,
      seasonName: "summer",
      rainlessDaysStreak: 15,
    };
    const world = {
      env: {},
      activePenalties: { yield: [] },
      pendingRisks: {},
      compostPiles: a.compostPiles,
    };
    a.eventEngine.tick(env, world);
    expect(a.eventEngine.activeEvents().length).toBe(1);

    const payload = serializeGame(a);

    const b = buildGame();
    b.eventEngine = createEventEngine({
      seed: 0,
      events: eventsData,
      balance: forcedBalance,
    });
    const bWorld = {
      env: {},
      activePenalties: { yield: [] },
      pendingRisks: {},
      compostPiles: b.compostPiles,
    };
    hydrateGame(b, payload, { world: bWorld });
    expect(b.eventEngine.activeEvents().length).toBe(1);
    expect(bWorld.env.evapMultiplier).toBeGreaterThan(1);
    expect(bWorld.activePenalties.yield.length).toBeGreaterThan(0);
  });
});

// ─── Migration registry ──────────────────────────────────────────

describe("schema-version migration", () => {
  it("returns payload unchanged when version matches", () => {
    const out = migratePayload({ version: SAVE_SCHEMA_VERSION, foo: 1 });
    expect(out.foo).toBe(1);
    expect(out.version).toBe(SAVE_SCHEMA_VERSION);
  });

  it("registry is empty at v1 — older saves without a migration path throw", () => {
    expect(MIGRATIONS.length).toBe(0);
    expect(() => migratePayload({ version: 0 })).toThrow();
  });

  it("rejects newer-version saves", () => {
    expect(() =>
      migratePayload({ version: SAVE_SCHEMA_VERSION + 1 })
    ).toThrow(/newer build/);
  });

  it("applies a migration step when one exists", () => {
    // Temporarily add a migration so v0 → current resolves.
    MIGRATIONS.push({
      from: 0,
      to: SAVE_SCHEMA_VERSION,
      migrate: (p) => ({ ...p, added: true }),
    });
    const out = migratePayload({ version: 0, value: 3 });
    expect(out.added).toBe(true);
    expect(out.version).toBe(SAVE_SCHEMA_VERSION);
    MIGRATIONS.length = 0; // restore
  });
});

// ─── Storage ─────────────────────────────────────────────────────

describe("storage", () => {
  it("saveSlot + loadSlot round-trips via listSlots", () => {
    const ok = saveSlot("slot-a", { version: 1, scheduler: { day: 7 } });
    expect(ok).toBe(true);
    expect(loadSlot("slot-a")).toEqual({ version: 1, scheduler: { day: 7 } });

    const meta = loadSlotMeta("slot-a");
    expect(meta.day).toBe(7);
    expect(meta.slotId).toBe("slot-a");

    const slots = listSlots();
    expect(slots.map((s) => s.slotId)).toContain("slot-a");
  });

  it("handles corrupt JSON gracefully", () => {
    globalThis.localStorage.setItem("fp.save.corrupt", "{not json");
    globalThis.localStorage.setItem(
      "fp.save.index",
      JSON.stringify(["corrupt"])
    );
    expect(loadSlot("corrupt")).toBeNull();
    expect(listSlots()).toEqual([]); // filtered out, no crash
  });

  it("deleteSlot removes both payload + index entry", () => {
    saveSlot("x", { version: 1 });
    deleteSlot("x");
    expect(loadSlot("x")).toBeNull();
    expect(listSlots().find((s) => s.slotId === "x")).toBeUndefined();
  });
});

// ─── Autosave ────────────────────────────────────────────────────

describe("autosave", () => {
  it("writes to autosave slot after every day-tick", () => {
    const game = buildGame();
    const off = startAutosave(game);
    for (let i = 0; i < 3; i++) advanceDay(game.scheduler);
    const saved = loadSlot("autosave");
    expect(saved).not.toBeNull();
    // scheduler.onDay fires before the day increment, so after 3 calls
    // to advanceDay the last listener call happened with day=2 and the
    // scheduler has since incremented to day=3. `serializeScheduler`
    // captures the current scheduler.day at the moment of serialize,
    // which runs inside the listener → 2 on the final tick.
    expect(saved.scheduler.day).toBe(2);
    off();
  });

  it("stops writing after unsubscribe", () => {
    const game = buildGame();
    const off = startAutosave(game);
    advanceDay(game.scheduler);
    off();
    advanceDay(game.scheduler);
    const saved = loadSlot("autosave");
    expect(saved.scheduler.day).toBe(0); // listener fired before increment on day 0
  });

  it("respects the enabled toggle", () => {
    const game = buildGame();
    let on = false;
    startAutosave(game, { enabled: () => on });
    advanceDay(game.scheduler);
    expect(loadSlot("autosave")).toBeNull();
    on = true;
    advanceDay(game.scheduler);
    expect(loadSlot("autosave")).not.toBeNull();
  });
});
