/**
 * Fairy Permaculture — zod schemas for all game data.
 *
 * Schemas live in code. JSON data files under `data/*.json` are
 * validated against these at test time via `data-validation.test.js`.
 * Adding a new data file should not require updating the test — the
 * test auto-discovers files and looks up the matching schema by
 * filename.
 */

import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────

export const IdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "ids are kebab-case");

export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ─── branches.json ────────────────────────────────────────────────
// The food-chain tree: Root + 7 Branches + Climax.

const NodeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string(),
  prerequisites: z.array(IdSchema).default([]),
  unlocks: z
    .object({
      plants: z.array(IdSchema).default([]),
      animals: z.array(IdSchema).default([]),
      buildings: z.array(IdSchema).default([]),
      roles: z.array(IdSchema).default([]),
      actions: z.array(z.string()).default([]),
    })
    .default({}),
  product: z
    .enum(["HONEY", "FRUIT", "MILK", "EGGS", "GRAIN", "FISH", "MUSHROOM", "BIOMASS", "COMPOST", "NONE"])
    .optional(),
  challenge_introduced: z.array(IdSchema).default([]),
});

export const BranchesSchema = z.array(
  z.object({
    id: IdSchema,
    kind: z.enum(["root", "branch", "climax"]),
    name: z.string(),
    description: z.string().optional(),
    fairy_food_gated: z.enum(["HONEY", "FRUIT", "MILK", "NONE"]).default("NONE"),
    nodes: z.array(NodeSchema).min(1),
  })
);

// ─── plants.json ──────────────────────────────────────────────────

export const PlantSchema = z.object({
  id: IdSchema,
  name: z.string(),
  scientific_name: z.string().optional(),
  family: z.string(),
  category: z.enum([
    "pioneer",
    "grass",
    "herbaceous",
    "groundcover",
    "shrub",
    "cane-fruit",
    "small-tree",
    "canopy-tree",
    "vine",
    "root",
    "aquatic",
    "fungi",
  ]),
  roles: z.array(
    z.enum([
      "n-fixer",
      "dynamic-accumulator",
      "biomass",
      "insectary",
      "trap-crop",
      "pollinator",
      "pest-confuser",
      "mulch",
      "windbreak",
      "edible",
      "medicinal",
      "fiber",
    ])
  ),
  lifecycle: z.enum(["annual", "biennial", "perennial"]),
  days_to_mature: z.number().int().positive(),
  soil_needs: z.object({
    om_min: z.number().min(0).max(20).default(1),
    ph_range: z.tuple([z.number(), z.number()]).default([5.5, 7.5]),
    moisture_min: z.number().min(0).max(100).default(25),
    fb_preference: z.enum(["bacterial", "balanced", "fungal"]).default("balanced"),
  }),
  products: z
    .array(
      z.object({
        id: IdSchema,
        yield_per_plant_per_season: z.number(),
        unit: z.string(),
      })
    )
    .default([]),
  native_biomes: z.array(IdSchema).default([]),
  mesh_generator: z.string().default("generic-herb"),
});

export const PlantsSchema = z.array(PlantSchema);

// ─── animals.json ─────────────────────────────────────────────────

export const AnimalSchema = z.object({
  id: IdSchema,
  name: z.string(),
  scientific_name: z.string().optional(),
  category: z.enum([
    "insect",
    "fish",
    "amphibian",
    "poultry",
    "small-livestock",
    "medium-livestock",
    "large-livestock",
    "draft",
    "wildlife",
    "predator",
  ]),
  diet: z.enum(["herbivore", "omnivore", "carnivore", "filter"]),
  forage: z.array(z.string()).default([]),
  products: z
    .array(
      z.object({
        id: IdSchema,
        rate_per_day: z.number().nonnegative(),
        unit: z.string(),
      })
    )
    .default([]),
  predators: z.array(IdSchema).default([]),
  lifespan_days: z.number().int().positive().optional(),
  native_biomes: z.array(IdSchema).default([]),
  mesh_asset: z.string().optional(),
});

export const AnimalsSchema = z.array(AnimalSchema);

// ─── guilds.json ──────────────────────────────────────────────────

export const GuildSchema = z.object({
  id: IdSchema,
  name: z.string(),
  central_species: IdSchema,
  members: z.array(
    z.object({
      species: IdSchema,
      role: z.string(),
      placement: z.enum([
        "drip-line",
        "inside-drip",
        "outside-drip",
        "matrix",
        "border",
        "overstory",
        "understory",
      ]),
    })
  ),
  biomes: z.array(IdSchema).default([]),
});

export const GuildsSchema = z.array(GuildSchema);

// ─── compost.json ─────────────────────────────────────────────────

export const CompostSchema = z.object({
  variants: z.array(
    z.object({
      id: IdSchema,
      name: z.string(),
      footprint_tiles: z.number().positive(),
      throughput_days_range: z.tuple([z.number(), z.number()]),
      output_quality_max: z.number().int().min(1).max(5),
      unlock_node: IdSchema,
    })
  ),
  ingredient_categories: z.array(
    z.object({
      id: z.enum(["greens", "browns", "bulkers", "inoculants", "accelerators"]),
      cn_range: z.tuple([z.number(), z.number()]).optional(),
      palette_color: z.string(),
      items: z.array(IdSchema).min(1),
    })
  ),
  states: z.array(
    z.enum([
      "empty",
      "filling",
      "triggered",
      "hot",
      "turn-window",
      "cooling",
      "curing",
      "finished",
      "anaerobic",
      "stalled",
      "ammonia-loss",
    ])
  ),
  hot_threshold_volume_m3: z.number().positive().default(1.0),
  hot_cn_band: z.tuple([z.number(), z.number()]).default([20, 40]),
  hot_moisture_band: z.tuple([z.number(), z.number()]).default([50, 65]),
  turn_window_days: z.tuple([z.number(), z.number()]).default([5, 7]),
});

// ─── fairies.json ─────────────────────────────────────────────────

export const FairiesSchema = z.object({
  roles: z.array(
    z.object({
      id: z.enum([
        "composter",
        "digger",
        "harvester",
        "beekeeper",
        "shepherd",
        "forager",
        "builder",
        "healer",
      ]),
      name: z.string(),
      hat_mesh: z.string(),
      tool_mesh: z.string(),
      unlock_node: IdSchema,
      primary_actions: z.array(z.string()).min(1),
      xp_sources: z.array(z.string()).min(1),
      level_bonuses: z.array(
        z.object({
          level: z.number().int().min(1).max(5),
          title: z.string(),
          multiplier: z.number().positive(),
          unique_ability: z.string().optional(),
        })
      ),
    })
  ),
  swap_cost_days: z.number().int().nonnegative(),
  swap_cost_fairy_food_units: z.number().int().nonnegative(),
});

// ─── balance.json ─────────────────────────────────────────────────

export const BalanceSchema = z.object({
  fairy_pop_curve: z.object({
    food_unit_cost_per_fairy: z.number().positive(),
    pop_cap: z.number().int().positive(),
    mvp_pop_cap: z.number().int().positive(),
  }),
  fairy_xp_curve: z.array(z.number().int().nonnegative()).length(5),
  target_curves: z.object({
    fairy_count: z.record(
      z.string(),
      z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
    ),
    biomass_stock_kg: z.record(
      z.string(),
      z.tuple([z.number().nonnegative(), z.number().nonnegative()])
    ),
    yearly_output_fairy_food_units: z.record(
      z.string(),
      z.tuple([z.number().nonnegative(), z.number().nonnegative()])
    ),
  }),
  compost: z.object({
    om_boost_per_m3_q3: z.number().positive(),
    application_radius_tiles: z.number().positive(),
  }),
  event_probabilities: z.record(IdSchema, z.number().min(0).max(1)),
  simulator_tolerance: z.number().positive().default(0.15),
});

// ─── events.json ──────────────────────────────────────────────────

export const EventSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string(),
  trigger: z.object({
    type: z.enum([
      "consecutive-rainless-days",
      "monoculture-cluster",
      "rain-on-hot-pile",
      "open-pasture-daylight",
      "late-frost-prob",
      "fruit-abundance",
    ]),
    params: z.record(z.string(), z.any()).default({}),
    season: z.enum(["any", "spring", "summer", "autumn", "winter"]).default("any"),
    probability: z.number().min(0).max(1).default(0.02),
  }),
  severity: z.enum(["nuisance", "real-loss", "catastrophic"]),
  effects: z.array(
    z.object({
      type: z.string(),
      params: z.record(z.string(), z.any()).default({}),
    })
  ),
  mitigations: z.array(
    z.object({
      type: z.string(),
      params: z.record(z.string(), z.any()).default({}),
      reduces_severity_by: z.number().min(0).max(1).default(0.5),
    })
  ),
  duration_days_range: z.tuple([z.number().int(), z.number().int()]),
});

export const EventsSchema = z.array(EventSchema);

// ─── biomes/*.json ────────────────────────────────────────────────

export const BiomeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  map_tiles: z.number().int().positive(),
  tile_meters: z.number().positive(),
  default_seed: z.number().int().nonnegative(),
  climate: z.object({
    days_per_year: z.number().int().positive(),
    days_per_season: z.number().int().positive(),
    rainfall_chance_per_season: z.object({
      spring: z.number().min(0).max(1),
      summer: z.number().min(0).max(1),
      autumn: z.number().min(0).max(1),
      winter: z.number().min(0).max(1),
    }),
    frost_chance_per_season: z.object({
      spring: z.number().min(0).max(1),
      summer: z.number().min(0).max(1).default(0),
      autumn: z.number().min(0).max(1),
      winter: z.number().min(0).max(1),
    }),
  }),
  pois: z.array(
    z.object({
      id: IdSchema,
      kind: z.enum([
        "old-growth-forest-edge",
        "freshwater-stream",
        "rocky-outcrop",
        "abandoned-farmstead-ruin",
        "pond",
        "wetland",
        "settlement",
      ]),
      placement_rule: z.string(),
      footprint_tiles_range: z.tuple([z.number().int(), z.number().int()]).default([10, 30]),
    })
  ),
  species_pool: z.object({
    plants: z.array(IdSchema),
    animals: z.array(IdSchema),
  }),
  microclimates: z.array(
    z.object({
      id: IdSchema,
      modifier: z.record(z.string(), z.number()),
    })
  ),
  starting_homestead: z.object({
    size_tiles: z.number().int().positive(),
    starting_om_pct: z.number().positive(),
    near_water: z.boolean(),
  }),
});

// ─── Filename → schema registry ───────────────────────────────────

export const SCHEMA_BY_FILENAME = {
  "branches.json": BranchesSchema,
  "plants.json": PlantsSchema,
  "animals.json": AnimalsSchema,
  "guilds.json": GuildsSchema,
  "compost.json": CompostSchema,
  "fairies.json": FairiesSchema,
  "balance.json": BalanceSchema,
  "events.json": EventsSchema,
};

export const BIOME_SCHEMA = BiomeSchema;
