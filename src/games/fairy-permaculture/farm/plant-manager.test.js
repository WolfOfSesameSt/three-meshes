import { describe, it, expect } from "vitest";
import plantsCatalogue from "../data/plants.json" with { type: "json" };
import { createPlantManager } from "./plant-manager.js";
import {
  createPlantInstance,
  tickPlant,
  stageFromAge,
  soilFitness,
  isRipe,
  estimatedBiomassKg,
  STAGES,
  stageIndex,
  isAlive,
} from "./plant-instance.js";
import {
  createSoilField,
  initializeFromOmField,
  getTile,
} from "./soil.js";

// ─── Helpers ──────────────────────────────────────────────────────

function findSpecies(id) {
  const s = plantsCatalogue.find((p) => p.id === id);
  if (!s) throw new Error(`test-fixture: plants.json missing '${id}'`);
  return s;
}

/**
 * Build a small soil field tuned to satisfy `species.soil_needs`.
 */
function happySoilFor(species, mapTiles = 8) {
  const field = createSoilField(mapTiles);
  const om = new Float32Array(mapTiles * mapTiles);
  om.fill(Math.max(species.soil_needs.om_min, 4));
  initializeFromOmField(field, om);
  // Force pH & moisture inside the species' comfort bands.
  const [phLo, phHi] = species.soil_needs.ph_range;
  const midPh = (phLo + phHi) / 2;
  field.ph.fill(midPh);
  field.moisture.fill(Math.max(species.soil_needs.moisture_min + 10, 50));
  return field;
}

/** Soil wildly outside the species' needs — should kill it. */
function hostileSoilFor(species, mapTiles = 4) {
  const field = createSoilField(mapTiles);
  const om = new Float32Array(mapTiles * mapTiles);
  om.fill(0.1);
  initializeFromOmField(field, om);
  field.ph.fill(3.5); // extreme acid, outside every species' band
  field.moisture.fill(0);
  return field;
}

function simulateDays(manager, field, days, env = {}) {
  for (let d = 0; d < days; d++) {
    manager.tick(d, env, field);
  }
}

// ─── plant-instance tests ─────────────────────────────────────────

describe("plant-instance — stage math", () => {
  it("stageFromAge respects species days_to_mature", () => {
    const sb = findSpecies("salmonberry"); // 90 days
    expect(stageFromAge(0, sb)).toBe("seed");
    expect(stageFromAge(12, sb)).toBe("seedling"); // ~13% → seedling
    expect(stageFromAge(45, sb)).toBe("juvenile"); // 50%
    expect(stageFromAge(90, sb)).toBe("mature");
    expect(stageFromAge(300, sb)).toBe("senescent"); // >3x
  });

  it("STAGES ordering is monotone via stageIndex", () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(stageIndex(STAGES[i])).toBeGreaterThan(stageIndex(STAGES[i - 1]));
    }
  });

  it("isAlive flips on death", () => {
    const p = createPlantInstance(findSpecies("salmonberry"), 1, 1);
    expect(isAlive(p)).toBe(true);
    p.stage = "dead";
    expect(isAlive(p)).toBe(false);
  });

  it("soilFitness is 1.0 on ideal soil, < 1 on deficient soil", () => {
    const sb = findSpecies("salmonberry");
    const good = {
      om: 6,
      ph: 6.2,
      moisture: 60,
      nAvail: 20,
      pAvail: 10,
      kAvail: 30,
      fb: 1,
      biology: 0.7,
    };
    expect(soilFitness(sb, good)).toBeGreaterThan(0.95);
    const dry = { ...good, moisture: 10 };
    expect(soilFitness(sb, dry)).toBeLessThan(0.5);
    const acid = { ...good, ph: 3.5 };
    expect(soilFitness(sb, acid)).toBeLessThan(0.5);
  });

  it("createPlantInstance defaults + deterministic seed", () => {
    const sb = findSpecies("salmonberry");
    const a = createPlantInstance(sb, 2, 3);
    const b = createPlantInstance(sb, 2, 3);
    expect(a.stage).toBe("seed");
    expect(a.ageDays).toBe(0);
    expect(a.health).toBe(1.0);
    expect(a.ripeAmount).toBe(0);
    expect(a.seed).toBe(b.seed);
  });

  it("rejects species without id", () => {
    expect(() => createPlantInstance({}, 0, 0)).toThrow();
  });
});

// ─── plant-manager tests ──────────────────────────────────────────

describe("plant-manager — basics", () => {
  it("plantSeed adds an instance to the manager", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const p = mgr.plantSeed("salmonberry", 3, 4);
    expect(mgr.count()).toBe(1);
    expect(p.id).toBe("salmonberry");
    expect(p.stage).toBe("seed");
    expect(mgr.findAt(3, 4)).toBe(p);
  });

  it("plantSeed throws on unknown species", () => {
    const mgr = createPlantManager(plantsCatalogue);
    expect(() => mgr.plantSeed("not-a-real-plant", 0, 0)).toThrow(/unknown species/);
  });

  it("constructor rejects non-array catalogue", () => {
    expect(() => createPlantManager({})).toThrow();
  });

  it("onChange fires when tick() runs", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const sb = findSpecies("salmonberry");
    mgr.plantSeed("salmonberry", 1, 1);
    const field = happySoilFor(sb);
    let calls = 0;
    const off = mgr.onChange(() => calls++);
    mgr.tick(0, {}, field);
    expect(calls).toBe(1);
    off();
    mgr.tick(1, {}, field);
    expect(calls).toBe(1);
  });
});

describe("plant-manager — grow cycle timing", () => {
  it("a salmonberry progresses seed → seedling → juvenile → mature on happy soil", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const sb = findSpecies("salmonberry"); // 90-day species
    const field = happySoilFor(sb);
    const plant = mgr.plantSeed("salmonberry", 2, 2);

    simulateDays(mgr, field, 5);
    expect(plant.stage).toBe("seed");

    simulateDays(mgr, field, 10); // now day 15 (~17 %)
    expect(plant.stage).toBe("seedling");

    simulateDays(mgr, field, 30); // day 45 (50 %)
    expect(plant.stage).toBe("juvenile");

    simulateDays(mgr, field, 60); // day 105 (>100 %)
    expect(plant.stage).toBe("mature");
  });

  it("a fast-cycle dandelion matures inside 20 days", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const dd = findSpecies("dandelion");
    const field = happySoilFor(dd);
    const plant = mgr.plantSeed("dandelion", 1, 1);
    simulateDays(mgr, field, 25);
    expect(plant.stage).toBe("mature");
  });
});

describe("plant-manager — ripening + harvest yields", () => {
  it("mature salmonberry accumulates ripeAmount and isRipe becomes true", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const sb = findSpecies("salmonberry");
    const field = happySoilFor(sb);
    const plant = mgr.plantSeed("salmonberry", 0, 0);

    simulateDays(mgr, field, 120); // well into mature

    expect(plant.stage).toBe("mature");
    expect(plant.ripeAmount).toBeGreaterThan(0);
    expect(isRipe(plant, sb)).toBe(true);
    const found = mgr.findRipe();
    expect(found).toContain(plant);
  });

  it("harvest returns fruit amount matching plants.json within ±50 %", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const sb = findSpecies("salmonberry"); // 2 kg/season
    const field = happySoilFor(sb);
    mgr.plantSeed("salmonberry", 5, 5);
    simulateDays(mgr, field, 180);

    const pick = mgr.harvest(5, 5);
    expect(pick).not.toBeNull();
    expect(pick.product).toBe("fruit");
    expect(pick.unit).toBe("kg");
    // Expected: ~2 kg, but ripening tops out at the season yield.
    expect(pick.amount).toBeGreaterThan(1.0);
    expect(pick.amount).toBeLessThanOrEqual(2.0 + 1e-6);
  });

  it("harvest on a non-ripe plant returns null", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const sb = findSpecies("salmonberry");
    const field = happySoilFor(sb);
    mgr.plantSeed("salmonberry", 0, 0);
    simulateDays(mgr, field, 5); // still a seed
    expect(mgr.harvest(0, 0)).toBeNull();
  });

  it("harvest on empty tile returns null", () => {
    const mgr = createPlantManager(plantsCatalogue);
    expect(mgr.harvest(99, 99)).toBeNull();
  });

  it("species without a fruit product never ripens", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const comfrey = findSpecies("comfrey-bocking14"); // biomass-only
    const field = happySoilFor(comfrey);
    const p = mgr.plantSeed("comfrey-bocking14", 1, 1);
    simulateDays(mgr, field, 200);
    expect(p.stage).toMatch(/mature|senescent/);
    expect(p.ripeAmount).toBe(0);
    expect(isRipe(p, comfrey)).toBe(false);
  });
});

describe("plant-manager — chop & drop", () => {
  it("chopAndDrop on a mature comfrey returns ~8 kg biomass", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const comfrey = findSpecies("comfrey-bocking14"); // 8 kg / season biomass
    const field = happySoilFor(comfrey);
    mgr.plantSeed("comfrey-bocking14", 2, 3);
    simulateDays(mgr, field, 60); // mature by day 45

    const drop = mgr.chopAndDrop(2, 3);
    expect(drop).not.toBeNull();
    expect(drop.biomassKg).toBeCloseTo(8, 1);
    expect(drop.speciesId).toBe("comfrey-bocking14");
    // After chopping, the plant is dead.
    const p = mgr.all().find((pp) => pp.tileX === 2 && pp.tileY === 3);
    expect(p?.stage).toBe("dead");
  });

  it("estimatedBiomassKg scales with stage", () => {
    const comfrey = findSpecies("comfrey-bocking14");
    const seed = createPlantInstance(comfrey, 0, 0);
    const young = { ...seed, stage: "juvenile" };
    const mature = { ...seed, stage: "mature" };
    expect(estimatedBiomassKg(seed, comfrey)).toBeLessThan(
      estimatedBiomassKg(young, comfrey)
    );
    expect(estimatedBiomassKg(young, comfrey)).toBeLessThan(
      estimatedBiomassKg(mature, comfrey)
    );
  });

  it("chopAndDrop on empty tile returns null", () => {
    const mgr = createPlantManager(plantsCatalogue);
    expect(mgr.chopAndDrop(7, 7)).toBeNull();
  });

  it("biomass fallback works for species without biomass product", () => {
    const saskatoon = findSpecies("saskatoon"); // fruit-only, no biomass
    const p = createPlantInstance(saskatoon, 0, 0);
    p.stage = "mature";
    const kg = estimatedBiomassKg(p, saskatoon);
    // Fallback: half of fruit yield = 1.5 kg
    expect(kg).toBeGreaterThan(0);
  });
});

describe("plant-manager — dying on hostile soil", () => {
  it("a salmonberry on hostile soil dies within 30 days", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const sb = findSpecies("salmonberry");
    const field = hostileSoilFor(sb);
    const plant = mgr.plantSeed("salmonberry", 0, 0);
    simulateDays(mgr, field, 30);
    expect(plant.stage).toBe("dead");
  });

  it("dead plants get purged from the manager on subsequent ticks", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const sb = findSpecies("salmonberry");
    const field = hostileSoilFor(sb);
    mgr.plantSeed("salmonberry", 0, 0);
    simulateDays(mgr, field, 60);
    expect(mgr.count()).toBe(0);
  });

  it("senescent plants eventually die from decline", () => {
    const mgr = createPlantManager(plantsCatalogue);
    const dd = findSpecies("dandelion"); // 20-day cycle
    const field = happySoilFor(dd);
    const plant = mgr.plantSeed("dandelion", 0, 0);
    simulateDays(mgr, field, 60); // well into senescent
    expect(plant.stage).toBe("senescent");
    simulateDays(mgr, field, 400); // long decline
    expect(plant.stage).toBe("dead");
  });
});

describe("plant-instance — tickPlant edge cases", () => {
  it("ticking a dead plant is a no-op", () => {
    const sb = findSpecies("salmonberry");
    const p = createPlantInstance(sb, 0, 0);
    p.stage = "dead";
    const age = p.ageDays;
    const field = happySoilFor(sb);
    tickPlant(p, sb, getTile(field, 0, 0));
    expect(p.ageDays).toBe(age);
  });

  it("low-fitness soil freezes stage progression", () => {
    const sb = findSpecies("salmonberry");
    const p = createPlantInstance(sb, 0, 0);
    const field = createSoilField(2);
    const om = new Float32Array(4);
    om.fill(2.5); // just OM-ok
    initializeFromOmField(field, om);
    // Marginal pH + low moisture — fitness ~ 0.1
    field.ph.fill(4.8);
    field.moisture.fill(20);
    for (let d = 0; d < 20; d++) {
      tickPlant(p, sb, getTile(field, 0, 0));
      if (p.stage === "dead") break;
    }
    // Either still a seed/seedling or dead — never raced to mature.
    expect(["seed", "seedling", "dead"]).toContain(p.stage);
  });
});
