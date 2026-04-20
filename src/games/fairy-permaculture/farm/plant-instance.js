/**
 * Fairy Permaculture — plant instance (C3.1 / C4.1).
 *
 * A PlantInstance is the per-planted-plant runtime record:
 *   { id (species), tileX, tileY, stage, ageDays, health, ripeAmount }
 *
 * Stages form a monotone chain:
 *   seed → seedling → juvenile → mature → senescent → (dead)
 *
 * Stage transitions are driven by
 *   (1) age vs species `days_to_mature` (from data/plants.json), and
 *   (2) soil fit — pH / moisture / organic-matter far outside the
 *       species `soil_needs` tanks `health`; health ≤ 0 kills the plant.
 *
 * Ripening (fruit production) only happens while the plant is
 * `mature` and the species has a `fruit` product entry. Ripe mass
 * accumulates on `ripeAmount` until the player harvests it; harvest
 * zeroes ripeAmount and (unless stage has already advanced to
 * senescent) lets it re-ripen.
 *
 * This module is pure logic — no Three.js. See `plant-mesh.js` for
 * procgen visuals and `plant-manager.js` for the per-day orchestration.
 */

/** Stage order — index into this array is used for comparisons. */
export const STAGES = [
  "seed",
  "seedling",
  "juvenile",
  "mature",
  "senescent",
  "dead",
];

export function stageIndex(stage) {
  const i = STAGES.indexOf(stage);
  return i < 0 ? 0 : i;
}

export function isAlive(plant) {
  return plant.stage !== "dead";
}

/**
 * Factory for a freshly planted seed.
 *
 * @param {object} species  entry from plants.json
 * @param {number} tileX
 * @param {number} tileY
 * @param {object} [opts]
 * @param {number} [opts.seed] deterministic seed for per-plant variance
 */
export function createPlantInstance(species, tileX, tileY, opts = {}) {
  if (!species || !species.id) {
    throw new Error("createPlantInstance: species entry with `id` required");
  }
  return {
    id: species.id,
    tileX,
    tileY,
    stage: "seed",
    ageDays: 0,
    health: 1.0, // 0..1 — 0 = dead, 1 = perfect
    ripeAmount: 0, // kg of unharvested ripe product
    seed: opts.seed ?? ((tileX * 73856093) ^ (tileY * 19349663)) >>> 0,
  };
}

/**
 * Stage thresholds as fractions of `days_to_mature`.
 *   seed     [0.00, 0.10)
 *   seedling [0.10, 0.33)
 *   juvenile [0.33, 1.00)
 *   mature   [1.00, 3.00)   — main productive window
 *   senescent ≥ 3.00        — starts declining, stops ripening
 *
 * These ratios are the same for every species; the absolute time
 * scales with the species' `days_to_mature` (20 d dandelion → 720 d apple).
 */
export const STAGE_THRESHOLDS = {
  seedling: 0.1,
  juvenile: 0.33,
  mature: 1.0,
  senescent: 3.0,
};

/**
 * Compute the stage a plant ought to be in, given its age and species.
 * Pure function — does NOT mutate.
 */
export function stageFromAge(ageDays, species) {
  const dtm = Math.max(1, species.days_to_mature);
  const f = ageDays / dtm;
  if (f >= STAGE_THRESHOLDS.senescent) return "senescent";
  if (f >= STAGE_THRESHOLDS.mature) return "mature";
  if (f >= STAGE_THRESHOLDS.juvenile) return "juvenile";
  if (f >= STAGE_THRESHOLDS.seedling) return "seedling";
  return "seed";
}

/**
 * Soil-fit score for a species on a given soil tile, in [0, 1].
 *
 * Returns 1.0 when pH, moisture and OM all sit comfortably inside the
 * species' `soil_needs`; drops toward 0 the further outside the bands
 * the tile sits. Used to drive health + ripening rate.
 */
export function soilFitness(species, soilTile) {
  const needs = species.soil_needs;
  const [phLo, phHi] = needs.ph_range;
  const ph = soilTile.ph;

  // pH — tolerance band = pH_range; falloff over ±1 pH unit outside it.
  let phFit;
  if (ph >= phLo && ph <= phHi) {
    phFit = 1.0;
  } else {
    const dist = ph < phLo ? phLo - ph : ph - phHi;
    phFit = Math.max(0, 1 - dist); // 1 pH unit outside = 0 fit
  }

  // Moisture — need at least `moisture_min`; above that is fine. Below
  // it, linear falloff over a 20-point window.
  const m = soilTile.moisture;
  const mNeed = needs.moisture_min;
  const mFit = m >= mNeed ? 1.0 : Math.max(0, 1 - (mNeed - m) / 20);

  // Organic matter — analogous to moisture.
  const omNeed = needs.om_min;
  const omFit =
    soilTile.om >= omNeed ? 1.0 : Math.max(0, 1 - (omNeed - soilTile.om) / 3);

  // Combine — multiplicative so any single catastrophic axis kills it.
  return phFit * mFit * omFit;
}

/**
 * Advance a single plant by one day. Mutates `plant` in place.
 *
 * @param {object} plant
 * @param {object} species    entry from plants.json
 * @param {object} soilTile   output of soil.getTile(field, x, y)
 * @param {object} [env]      weather snapshot from scheduler (optional)
 * @returns {object}  the mutated plant (for chaining)
 */
export function tickPlant(plant, species, soilTile, env = {}) {
  if (plant.stage === "dead") return plant;

  plant.ageDays += 1;

  // ── Soil-driven health ──────────────────────────────────────
  const fit = soilFitness(species, soilTile);
  // Health gravitates toward fitness with a modest inertia. A value
  // of 0.2 drift-rate means hostile tiles kill in ~15 days. Senescent
  // plants cap fitness-driven recovery so they still decline with age.
  const isSenescent = plant.stage === "senescent";
  const fitTarget = isSenescent ? Math.min(fit, plant.health) : fit;
  plant.health += (fitTarget - plant.health) * 0.2;
  if (plant.health <= 0.05) {
    plant.stage = "dead";
    plant.ripeAmount = 0;
    return plant;
  }

  // ── Stage transition (age-driven, shortcut on hostile soil) ──
  // If fitness is very low, freeze stage progression (plant is
  // stressed; it can recover if conditions improve).
  const newStage = fit > 0.25 ? stageFromAge(plant.ageDays, species) : plant.stage;
  if (stageIndex(newStage) > stageIndex(plant.stage)) {
    plant.stage = newStage;
  }

  // ── Ripening ────────────────────────────────────────────────
  if (plant.stage === "mature") {
    const fruit = (species.products || []).find((p) => p.id === "fruit");
    if (fruit && fruit.yield_per_plant_per_season > 0) {
      // `yield_per_plant_per_season` is per 30-day season. Ripen a
      // fraction of that per day, scaled by health + fitness.
      // Full ripe at ~1 season of mature time if healthy.
      const perDay = fruit.yield_per_plant_per_season / 30;
      plant.ripeAmount = Math.min(
        fruit.yield_per_plant_per_season,
        plant.ripeAmount + perDay * plant.health
      );
    }
  }

  // ── Senescent decline ───────────────────────────────────────
  if (plant.stage === "senescent") {
    plant.health *= 0.98;
    if (plant.health <= 0.05) plant.stage = "dead";
  }

  return plant;
}

/**
 * True if this plant currently has ripe product ready for harvest.
 * "Ripe enough" = at least ~30 % of the season's max yield.
 */
export function isRipe(plant, species) {
  if (plant.stage !== "mature") return false;
  const fruit = (species.products || []).find((p) => p.id === "fruit");
  if (!fruit) return false;
  return plant.ripeAmount >= fruit.yield_per_plant_per_season * 0.3;
}

/**
 * Approximate biomass (kg) of a plant at its current stage — used by
 * chop-and-drop. Scales with species `biomass` product yield and
 * stage (juvenile returns ~⅓, mature full, senescent ~80 %).
 */
export function estimatedBiomassKg(plant, species) {
  const bio = (species.products || []).find((p) => p.id === "biomass");
  if (!bio) {
    // Fall back to half the fruit product mass for species without
    // an explicit biomass line (roots, leaves, stems still carry mass).
    const fruit = (species.products || []).find((p) => p.id === "fruit");
    return fruit ? fruit.yield_per_plant_per_season * 0.5 : 0.5;
  }
  const max = bio.yield_per_plant_per_season;
  switch (plant.stage) {
    case "seed":
    case "seedling":
      return max * 0.05;
    case "juvenile":
      return max * 0.4;
    case "mature":
      return max;
    case "senescent":
      return max * 0.8;
    default:
      return 0;
  }
}
