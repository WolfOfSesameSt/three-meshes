import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPopulation } from "./population.js";
import { add as addFood, reset as resetFood } from "./fairy-food.js";

beforeEach(() => resetFood());

describe("createPopulation", () => {
  it("starts with 1 fairy (named) and the configured cap", () => {
    resetFood();
    const pop = createPopulation({ cap: 25 });
    expect(pop.count).toBe(1);
    expect(pop.cap).toBe(25);
    expect(pop.named.length).toBe(1);
  });

  it("can spawn with a single fairy-food but at higher cost (2× per fairy)", () => {
    resetFood();
    const pop = createPopulation({ cap: 25, costPerFairy: 2 });
    addFood("honey", 3.5); // 3.5 < 4 = 2 * 2× multiplier, so no spawn
    expect(pop.count).toBe(1);
    addFood("honey", 1);   // total 4.5 ≥ 4 → one spawn
    expect(pop.count).toBeGreaterThan(1);
  });

  it("spawns once each food is flowing + cost is paid", () => {
    resetFood();
    const spawns = [];
    const pop = createPopulation({
      cap: 25,
      costPerFairy: 2,
      onSpawn: (e) => spawns.push(e),
    });
    addFood("honey", 1);
    addFood("milk", 1);
    addFood("fruit", 1);
    expect(pop.count).toBeGreaterThan(1);
    expect(spawns.length).toBeGreaterThan(0);
    expect(typeof spawns[0].name).toBe("string");
  });

  it("respects cap", () => {
    resetFood();
    const pop = createPopulation({ cap: 3, costPerFairy: 1 });
    addFood("honey", 50);
    addFood("milk", 50);
    addFood("fruit", 50);
    expect(pop.count).toBe(3);
  });

  it("large food drop crosses multiple thresholds in one pass", () => {
    resetFood();
    const pop = createPopulation({ cap: 10, costPerFairy: 1 });
    addFood("honey", 10);
    addFood("milk", 10);
    addFood("fruit", 10);
    expect(pop.count).toBeGreaterThanOrEqual(4);
  });

  it("serialize → hydrate round-trips", () => {
    resetFood();
    const pop = createPopulation({ cap: 25, costPerFairy: 1 });
    addFood("honey", 3);
    addFood("milk", 3);
    addFood("fruit", 3);
    const saved = pop.serialize();

    resetFood();
    const pop2 = createPopulation({ cap: 25 });
    pop2.hydrate(saved);
    expect(pop2.count).toBe(pop.count);
    expect(pop2.named).toEqual(pop.named);
  });
});
