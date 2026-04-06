/**
 * Resource Definitions — all resource types in Void Raiders.
 *
 * Three tiers:
 *   raw      — mined from deposits in realms
 *   refined  — crafted from raw materials at the station
 *   advanced — crafted from refined components
 *
 * Each resource has:
 *   id          unique kebab-case identifier
 *   name        display name
 *   category    "raw" | "refined" | "advanced"
 *   description short flavor/function text
 *   rarity      1 (common) – 5 (legendary)
 *   iconColor   hex color for UI chips and deposit visuals
 */

export const RESOURCE_CATEGORY = {
  RAW: "raw",
  REFINED: "refined",
  ADVANCED: "advanced",
};

const RESOURCES = [
  // ─── Raw Materials ──────────────────────────────────────────
  {
    id: "iron-ore",
    name: "Iron Ore",
    category: RESOURCE_CATEGORY.RAW,
    description: "Common structural metal. Foundation of all construction.",
    rarity: 1,
    iconColor: "#88aacc",
  },
  {
    id: "copper-ore",
    name: "Copper Ore",
    category: RESOURCE_CATEGORY.RAW,
    description: "Conductive metal essential for electronics and alloys.",
    rarity: 1,
    iconColor: "#cc8844",
  },
  {
    id: "titanium-ore",
    name: "Titanium Ore",
    category: RESOURCE_CATEGORY.RAW,
    description: "Lightweight high-strength metal for advanced alloys.",
    rarity: 3,
    iconColor: "#99bbdd",
  },
  {
    id: "crystal-shard",
    name: "Crystal Shard",
    category: RESOURCE_CATEGORY.RAW,
    description: "Resonant crystal used in energy systems and tech.",
    rarity: 2,
    iconColor: "#aa66dd",
  },
  {
    id: "quartz-crystal",
    name: "Quartz Crystal",
    category: RESOURCE_CATEGORY.RAW,
    description: "Piezoelectric mineral for sensors and optics.",
    rarity: 2,
    iconColor: "#ccaaee",
  },
  {
    id: "plasma-core",
    name: "Plasma Core",
    category: RESOURCE_CATEGORY.RAW,
    description: "Concentrated plasma energy. Volatile and valuable.",
    rarity: 4,
    iconColor: "#44ddff",
  },
  {
    id: "exotic-matter",
    name: "Exotic Matter",
    category: RESOURCE_CATEGORY.RAW,
    description: "Anomalous substance with negative mass properties.",
    rarity: 5,
    iconColor: "#ff44dd",
  },
  {
    id: "organic-matter",
    name: "Organic Matter",
    category: RESOURCE_CATEGORY.RAW,
    description: "Alien biological material. Used in bio-synthesis.",
    rarity: 1,
    iconColor: "#66cc44",
  },
  {
    id: "bio-compound",
    name: "Bio-Compound",
    category: RESOURCE_CATEGORY.RAW,
    description: "Complex organic molecules with regenerative properties.",
    rarity: 3,
    iconColor: "#44cc88",
  },
  {
    id: "silicon-dust",
    name: "Silicon Dust",
    category: RESOURCE_CATEGORY.RAW,
    description: "Fine silicon powder for circuit fabrication.",
    rarity: 2,
    iconColor: "#aabb88",
  },
  {
    id: "rare-earth",
    name: "Rare Earth",
    category: RESOURCE_CATEGORY.RAW,
    description: "Trace elements critical for advanced electronics.",
    rarity: 3,
    iconColor: "#ddaa66",
  },
  {
    id: "salvage-parts",
    name: "Salvage Parts",
    category: RESOURCE_CATEGORY.RAW,
    description: "Scavenged alien tech components.",
    rarity: 2,
    iconColor: "#8899aa",
  },

  // ─── Refined Components ─────────────────────────────────────
  {
    id: "steel-plate",
    name: "Steel Plate",
    category: RESOURCE_CATEGORY.REFINED,
    description: "Forged structural plate for hulls and armor.",
    rarity: 2,
    iconColor: "#aabbcc",
  },
  {
    id: "alloy-composite",
    name: "Alloy Composite",
    category: RESOURCE_CATEGORY.REFINED,
    description: "Titanium-copper blend. Light and strong.",
    rarity: 3,
    iconColor: "#bbccdd",
  },
  {
    id: "energy-cell",
    name: "Energy Cell",
    category: RESOURCE_CATEGORY.REFINED,
    description: "Compact crystal-plasma power source.",
    rarity: 3,
    iconColor: "#66bbff",
  },
  {
    id: "circuit-board",
    name: "Circuit Board",
    category: RESOURCE_CATEGORY.REFINED,
    description: "Silicon wafer with copper traces for processing.",
    rarity: 3,
    iconColor: "#88cc66",
  },
  {
    id: "bio-gel",
    name: "Bio-Gel",
    category: RESOURCE_CATEGORY.REFINED,
    description: "Synthesized regenerative compound.",
    rarity: 3,
    iconColor: "#55dd99",
  },

  // ─── Advanced Components ────────────────────────────────────
  {
    id: "shield-capacitor",
    name: "Shield Capacitor",
    category: RESOURCE_CATEGORY.ADVANCED,
    description: "High-density energy storage for shield generators.",
    rarity: 4,
    iconColor: "#4499ff",
  },
  {
    id: "quantum-processor",
    name: "Quantum Processor",
    category: RESOURCE_CATEGORY.ADVANCED,
    description: "Exotic matter-infused computation core.",
    rarity: 5,
    iconColor: "#dd66ff",
  },
  {
    id: "hull-armor",
    name: "Hull Armor",
    category: RESOURCE_CATEGORY.ADVANCED,
    description: "Layered steel-alloy plating for maximum protection.",
    rarity: 4,
    iconColor: "#7799bb",
  },
  {
    id: "nano-repair-paste",
    name: "Nano-Repair Paste",
    category: RESOURCE_CATEGORY.ADVANCED,
    description: "Self-replicating nanites that seal hull breaches.",
    rarity: 4,
    iconColor: "#44ddaa",
  },
];

/**
 * Map from resource id to its definition.
 * @type {Map<string, object>}
 */
export const RESOURCE_MAP = new Map(RESOURCES.map((r) => [r.id, r]));

/**
 * Get a resource definition by id. Returns undefined if not found.
 */
export function getResource(id) {
  return RESOURCE_MAP.get(id);
}

/**
 * Get all resources filtered by category.
 */
export function getResourcesByCategory(category) {
  return RESOURCES.filter((r) => r.category === category);
}

/**
 * All resource definitions (read-only reference).
 */
export const ALL_RESOURCES = RESOURCES;

/**
 * Short display label for a resource (used in cost strings and UI chips).
 * Maps resource id to a compact uppercase label.
 */
export const RESOURCE_LABELS = Object.fromEntries(
  RESOURCES.map((r) => [
    r.id,
    r.name.toUpperCase().replace(/ /g, " "),
  ]),
);
