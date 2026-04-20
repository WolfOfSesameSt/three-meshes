import { describe, it, expect, beforeEach } from 'vitest';
import { createAnimalManager } from './animal-manager.js';
import { fairyFood, reset as resetFood } from './fairy-food.js';
import { house } from './coop.js';

// Small stub plant-manager that exposes findFloweringPlantsWithin.
// Each plant is { x, y, species, roles } — we mimic what the real
// plant-manager is expected to expose once it lands.
function makePlantStub(plants) {
  return {
    findFloweringPlantsWithin(x, y, radius) {
      return plants.filter((p) => {
        if (!p.roles?.includes('pollinator')) return false;
        if (!p.flowering) return false;
        const dx = p.x - x;
        const dy = p.y - y;
        return dx * dx + dy * dy <= radius * radius;
      });
    },
  };
}

describe('animal-manager — placement', () => {
  beforeEach(() => resetFood());

  it('placeAnimal creates an instance with species defaults', () => {
    const m = createAnimalManager();
    const a = m.placeAnimal('chicken-layer', 0, 0);
    expect(a.id).toBe('chicken-layer');
    expect(a.age).toBe(0);
    expect(a.health).toBeGreaterThan(0);
    expect(m.animals).toHaveLength(1);
  });

  it('placeAnimal throws on unknown species', () => {
    const m = createAnimalManager();
    expect(() => m.placeAnimal('pegasus', 0, 0)).toThrow(/unknown species/);
  });

  it('placeHive and placeCoop/GoatShed register buildings', () => {
    const m = createAnimalManager();
    m.placeHive('warre', 0, 0);
    m.placeCoop(1, 1);
    m.placeGoatShed(2, 2);
    expect(m.hives).toHaveLength(1);
    expect(m.buildings).toHaveLength(2);
  });
});

describe('animal-manager — egg collection', () => {
  beforeEach(() => resetFood());

  it('chicken accrues eggs at ~animals.json rate_per_day', () => {
    const m = createAnimalManager();
    const chicken = m.placeAnimal('chicken-layer', 0, 0);
    // Tick 10 days; chicken-layer rate_per_day = 0.8.
    for (let d = 0; d < 10; d++) m.tick(d);
    // Health starts at 1 and stays close to 1 (hunger stays below 0.9
    // over 10 days with default gain). Expected stock ≈ 8.0.
    const accrued = chicken.productStock.egg;
    expect(accrued).toBeGreaterThan(6);
    expect(accrued).toBeLessThan(9);
  });

  it('collectEgg zeroes the stock and returns count', () => {
    const m = createAnimalManager();
    m.placeAnimal('chicken-layer', 5, 5);
    for (let d = 0; d < 5; d++) m.tick(d);
    const c = m.collectEgg(5, 5);
    expect(c).toBeGreaterThan(0);
    // Eggs are NOT fairy food.
    expect(fairyFood.honey + fairyFood.milk + fairyFood.fruit).toBe(0);
  });

  it('collectEgg returns 0 when no chicken/duck present', () => {
    const m = createAnimalManager();
    expect(m.collectEgg(0, 0)).toBe(0);
  });
});

describe('animal-manager — milk', () => {
  beforeEach(() => resetFood());

  it('dairy-goat milk stock matches animals.json rate_per_day', () => {
    const m = createAnimalManager();
    const goat = m.placeAnimal('dairy-goat', 0, 0);
    // rate_per_day = 3.0; run 5 days. Health ≈ 1 so accrual ≈ 15.
    for (let d = 0; d < 5; d++) m.tick(d);
    expect(goat.productStock.milk).toBeGreaterThan(12);
    expect(goat.productStock.milk).toBeLessThan(16);
  });

  it('milk() harvests the goat and credits fairyFood.milk', () => {
    const m = createAnimalManager();
    m.placeAnimal('dairy-goat', 10, 10);
    for (let d = 0; d < 3; d++) m.tick(d);
    const liters = m.milk(10, 10);
    expect(liters).toBeGreaterThan(0);
    expect(fairyFood.milk).toBeCloseTo(liters, 6);
    // Calling again with no time elapsed → nothing to harvest.
    expect(m.milk(10, 10)).toBe(0);
  });

  it('milk() picks the nearest milkable animal', () => {
    const m = createAnimalManager();
    m.placeAnimal('dairy-goat', 0, 0);
    const far = m.placeAnimal('dairy-goat', 100, 100);
    m.tick(0);
    m.milk(99, 99);
    expect(far.productStock.milk).toBe(0);
  });
});

describe('animal-manager — predator events', () => {
  beforeEach(() => resetFood());

  it('hawk-strike removes unhoused chickens', () => {
    const m = createAnimalManager();
    m.placeAnimal('chicken-layer', 0, 0);
    m.placeAnimal('chicken-layer', 1, 0);
    m.placeAnimal('chicken-layer', 2, 0);
    const before = m.animals.length;
    const result = m.applyPredatorEvent({
      effects: [
        { type: 'lose-animals', params: { min: 2, max: 2, species: ['chicken-layer'] } },
      ],
    });
    expect(result.lost).toHaveLength(2);
    expect(m.animals.length).toBe(before - 2);
  });

  it('canopy-covered coop fully protects housed chickens', () => {
    const m = createAnimalManager();
    const coop = m.placeCoop(0, 0);
    coop.coveredByCanopy = true;
    const a = m.placeAnimal('chicken-layer', 0, 0);
    const b = m.placeAnimal('chicken-layer', 1, 0);
    house(coop, a);
    house(coop, b);
    const result = m.applyPredatorEvent({
      effects: [
        { type: 'lose-animals', params: { min: 3, max: 3, species: ['chicken-layer'] } },
      ],
    });
    expect(result.lost).toHaveLength(0);
    expect(coop.durability).toBe(1.0); // took no damage
  });

  it('uncovered coop absorbs damage and may break', () => {
    const m = createAnimalManager();
    const coop = m.placeCoop(0, 0);
    expect(coop.coveredByCanopy).toBe(false);
    const a = m.placeAnimal('chicken-layer', 0, 0);
    house(coop, a);

    // Single hit shouldn't break it — one chicken, attempted loss.
    m.applyPredatorEvent({
      effects: [
        { type: 'lose-animals', params: { min: 1, max: 1, species: ['chicken-layer'] } },
      ],
    });
    expect(coop.durability).toBeLessThan(1.0);
    expect(coop.durability).toBeGreaterThan(0);
    // Chicken protected: building still intact.
    expect(m.animals).toHaveLength(1);
  });
});

describe('animal-manager — findReady', () => {
  beforeEach(() => resetFood());

  it('lists animals with pending product', () => {
    const m = createAnimalManager();
    m.placeAnimal('chicken-layer', 0, 0);
    m.placeAnimal('dairy-goat', 5, 5);
    m.tick(0);
    m.tick(1);
    const ready = m.findReady();
    expect(ready.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores dead animals', () => {
    const m = createAnimalManager();
    const a = m.placeAnimal('chicken-layer', 0, 0);
    m.tick(0);
    a.health = 0;
    // Prune dead via predator-event path (applyPredatorEvent prunes).
    m.applyPredatorEvent({ effects: [] });
    expect(m.findReady()).not.toContain(a);
  });
});

describe('animal-manager — plant-manager defensive import', () => {
  beforeEach(() => resetFood());

  it('hive with no plant-manager produces no honey', () => {
    const m = createAnimalManager(); // no plant manager
    m.placeHive('warre', 0, 0);
    for (let d = 0; d < 30; d++) m.tick(d);
    const kg = m.harvestHoney();
    expect(kg).toBe(0);
    expect(fairyFood.honey).toBe(0);
  });

  it('hive with plant-manager and flowering plants produces honey', () => {
    const plants = [
      { x: 0, y: 0, roles: ['pollinator'], flowering: true },
      { x: 5, y: 5, roles: ['pollinator'], flowering: true },
      { x: 8, y: 8, roles: ['pollinator'], flowering: true },
    ];
    const m = createAnimalManager({ plantManager: makePlantStub(plants) });
    const hive = m.placeHive('warre', 0, 0);
    for (let d = 0; d < 30; d++) m.tick(d);
    const kg = m.harvestHoney(hive.uid);
    expect(kg).toBeGreaterThan(0);
    expect(fairyFood.honey).toBeCloseTo(kg, 6);
  });
});
