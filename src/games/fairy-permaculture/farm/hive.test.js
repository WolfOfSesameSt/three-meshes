import { describe, it, expect } from 'vitest';
import {
  createHive,
  tickHive,
  harvestHoney,
  countFloweringPollinatorPlants,
} from './hive.js';

// Stub plant-manager matching the expected contract.
function stubPlantManager(plants) {
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

describe('hive — construction', () => {
  it('creates a warre hive with defaults', () => {
    const h = createHive('warre', 1, 2);
    expect(h.type).toBe('warre');
    expect(h.x).toBe(1);
    expect(h.y).toBe(2);
    expect(h.honeyStored).toBe(0);
    expect(h.colonyStrength).toBeGreaterThan(0);
  });

  it('creates a mason-tubes hive', () => {
    const h = createHive('mason-tubes', 0, 0);
    expect(h.type).toBe('mason-tubes');
    expect(h._defs.honeyKgPerDayAtMax).toBe(0);
  });

  it('throws on unknown type', () => {
    expect(() => createHive('skyscraper-hive', 0, 0)).toThrow(/unknown type/);
  });
});

describe('hive — defensive plant-manager', () => {
  it('null plant-manager → 0 flowering', () => {
    expect(countFloweringPollinatorPlants(null, 0, 0, 10)).toBe(0);
  });

  it('plant-manager without the method → 0 flowering', () => {
    expect(countFloweringPollinatorPlants({}, 0, 0, 10)).toBe(0);
  });

  it('plant-manager returning null → 0 flowering', () => {
    const pm = { findFloweringPlantsWithin: () => null };
    expect(countFloweringPollinatorPlants(pm, 0, 0, 10)).toBe(0);
  });
});

describe('hive — colony dynamics', () => {
  it('colony grows with forage, decays without', () => {
    const pmGood = stubPlantManager([
      { x: 0, y: 0, roles: ['pollinator'], flowering: true },
      { x: 2, y: 2, roles: ['pollinator'], flowering: true },
    ]);
    const hive = createHive('warre', 0, 0);
    const startStrength = hive.colonyStrength;
    for (let d = 0; d < 20; d++) tickHive(hive, d, pmGood);
    const afterGrowth = hive.colonyStrength;
    expect(afterGrowth).toBeGreaterThan(startStrength);

    // Now remove forage (empty plant manager) and let it decay.
    const pmNone = stubPlantManager([]);
    for (let d = 20; d < 40; d++) tickHive(hive, d, pmNone);
    expect(hive.colonyStrength).toBeLessThan(afterGrowth);
  });

  it('bee count (colony strength) scales with nearby flowering plants', () => {
    // Two hives, one with many flowers, one with few. After equal time
    // the one with more forage should have more colony strength.
    const fewPlants = stubPlantManager([
      { x: 0, y: 0, roles: ['pollinator'], flowering: true },
    ]);
    const manyPlants = stubPlantManager([
      { x: 0, y: 0, roles: ['pollinator'], flowering: true },
      { x: 1, y: 1, roles: ['pollinator'], flowering: true },
      { x: 2, y: 2, roles: ['pollinator'], flowering: true },
      { x: 3, y: 3, roles: ['pollinator'], flowering: true },
      { x: 4, y: 4, roles: ['pollinator'], flowering: true },
      { x: 5, y: 5, roles: ['pollinator'], flowering: true },
    ]);

    const hA = createHive('warre', 0, 0);
    const hB = createHive('warre', 0, 0);
    for (let d = 0; d < 15; d++) {
      tickHive(hA, d, fewPlants);
      tickHive(hB, d, manyPlants);
    }
    expect(hB.colonyStrength).toBeGreaterThan(hA.colonyStrength);
  });
});

describe('hive — honey accumulation', () => {
  it('honey accumulates ONLY when pollinators have forage', () => {
    const hive = createHive('warre', 0, 0);

    // No forage → no honey.
    const pmNone = stubPlantManager([]);
    for (let d = 0; d < 10; d++) tickHive(hive, d, pmNone);
    expect(hive.honeyStored).toBe(0);

    // Add forage → honey accrues.
    const pmYes = stubPlantManager([
      { x: 0, y: 0, roles: ['pollinator'], flowering: true },
      { x: 2, y: 2, roles: ['pollinator'], flowering: true },
    ]);
    for (let d = 10; d < 30; d++) tickHive(hive, d, pmYes);
    expect(hive.honeyStored).toBeGreaterThan(0);
  });

  it('mason tubes never accumulate honey (pollination only)', () => {
    const hive = createHive('mason-tubes', 0, 0);
    const pmYes = stubPlantManager([
      { x: 0, y: 0, roles: ['pollinator'], flowering: true },
    ]);
    for (let d = 0; d < 60; d++) tickHive(hive, d, pmYes);
    expect(hive.honeyStored).toBe(0);
  });

  it('non-flowering pollinator plants do not feed the hive', () => {
    const pm = stubPlantManager([
      { x: 0, y: 0, roles: ['pollinator'], flowering: false },
      { x: 2, y: 2, roles: ['pollinator'], flowering: false },
    ]);
    const hive = createHive('warre', 0, 0);
    for (let d = 0; d < 20; d++) tickHive(hive, d, pm);
    expect(hive.honeyStored).toBe(0);
  });

  it('plants outside forage radius do not feed the hive', () => {
    const pm = stubPlantManager([
      { x: 500, y: 500, roles: ['pollinator'], flowering: true },
    ]);
    const hive = createHive('warre', 0, 0);
    for (let d = 0; d < 20; d++) tickHive(hive, d, pm);
    expect(hive.honeyStored).toBe(0);
  });
});

describe('hive — harvestHoney', () => {
  it('empties the storage and returns the kg', () => {
    const hive = createHive('warre', 0, 0);
    hive.honeyStored = 3.5;
    expect(harvestHoney(hive)).toBe(3.5);
    expect(hive.honeyStored).toBe(0);
  });
});

describe('hive — per-day scan caching', () => {
  it('re-ticking the same day reuses the cached scan', () => {
    let calls = 0;
    const pm = {
      findFloweringPlantsWithin: () => {
        calls += 1;
        return [{ x: 0, y: 0, roles: ['pollinator'], flowering: true }];
      },
    };
    const hive = createHive('warre', 0, 0);
    tickHive(hive, 7, pm);
    tickHive(hive, 7, pm);
    tickHive(hive, 7, pm);
    expect(calls).toBe(1);

    tickHive(hive, 8, pm);
    expect(calls).toBe(2);
  });
});
