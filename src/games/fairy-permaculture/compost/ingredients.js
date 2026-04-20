/**
 * Fairy Permaculture — Compost ingredient table + mixing helpers.
 *
 * Each ingredient has four physical stats the pile simulation reads:
 *   - dryMassKg  : dry-matter mass contribution (pile volume uses this)
 *   - cnRatio    : carbon-to-nitrogen ratio (dimensionless)
 *   - moisturePct: moisture content by weight (0-100)
 *   - category   : greens / browns / bulkers / inoculants / accelerators
 *
 * Category C:N ranges follow `data/compost.json`:
 *   greens  C:N 10-25     (fresh grass, manure, kitchen scraps)
 *   browns  C:N 50-500    (dry leaves, straw, cardboard, sawdust)
 *   bulkers C:N ~100-500  (structural carbon: wood chips coarse, twigs)
 *   inoculants/accelerators: negligible mass, carry microbial diversity
 *
 * C:N and moisture values are drawn from common composting references
 * (Rodale; Cornell Waste Management; On-Farm Composting Handbook).
 * These are *representative* values — real ingredients vary, but the
 * simulation math is stable as long as the table is internally
 * consistent.
 */

// ─── Table ────────────────────────────────────────────────────────

const INGREDIENTS = {
  // Greens (nitrogen-rich, wet)
  "fresh-grass":      { id: "fresh-grass",      category: "greens",       dryMassKg: 20, cnRatio: 15,  moisturePct: 75 },
  "comfrey-chop":     { id: "comfrey-chop",     category: "greens",       dryMassKg: 15, cnRatio: 10,  moisturePct: 85 },
  "kitchen-scraps":   { id: "kitchen-scraps",   category: "greens",       dryMassKg: 10, cnRatio: 17,  moisturePct: 80 },
  "fresh-manure":     { id: "fresh-manure",     category: "greens",       dryMassKg: 25, cnRatio: 18,  moisturePct: 78 },
  "coffee-grounds":   { id: "coffee-grounds",   category: "greens",       dryMassKg: 5,  cnRatio: 20,  moisturePct: 60 },
  "fish-trim":        { id: "fish-trim",        category: "greens",       dryMassKg: 3,  cnRatio: 5,   moisturePct: 80 },

  // Browns (carbon-rich, dry)
  "dry-leaves":       { id: "dry-leaves",       category: "browns",       dryMassKg: 15, cnRatio: 60,  moisturePct: 15 },
  "straw":            { id: "straw",            category: "browns",       dryMassKg: 20, cnRatio: 80,  moisturePct: 12 },
  "wood-chips":       { id: "wood-chips",       category: "browns",       dryMassKg: 30, cnRatio: 300, moisturePct: 25 },
  "cardboard":        { id: "cardboard",        category: "browns",       dryMassKg: 10, cnRatio: 350, moisturePct: 10 },
  "dead-corn-stalks": { id: "dead-corn-stalks", category: "browns",       dryMassKg: 25, cnRatio: 60,  moisturePct: 15 },
  "sawdust":          { id: "sawdust",          category: "browns",       dryMassKg: 10, cnRatio: 400, moisturePct: 20 },

  // Bulkers (structural air pockets; high C, negligible moisture)
  "wood-chips-coarse": { id: "wood-chips-coarse", category: "bulkers",    dryMassKg: 30, cnRatio: 400, moisturePct: 20 },
  "straw-bundles":    { id: "straw-bundles",    category: "bulkers",      dryMassKg: 20, cnRatio: 80,  moisturePct: 12 },
  "twigs":            { id: "twigs",            category: "bulkers",      dryMassKg: 15, cnRatio: 500, moisturePct: 15 },

  // Inoculants (microbial seed — mass small, diversity matters)
  "forest-duff-imo":     { id: "forest-duff-imo",     category: "inoculants", dryMassKg: 2, cnRatio: 25, moisturePct: 50 },
  "finished-compost-seed": { id: "finished-compost-seed", category: "inoculants", dryMassKg: 2, cnRatio: 15, moisturePct: 45 },
  "worm-castings":       { id: "worm-castings",       category: "inoculants", dryMassKg: 2, cnRatio: 12, moisturePct: 55 },
  "bd-500":              { id: "bd-500",              category: "inoculants", dryMassKg: 1, cnRatio: 20, moisturePct: 60 },

  // Accelerators (nitrogen/sugar boost — low mass, very high moisture)
  "urine":         { id: "urine",         category: "accelerators", dryMassKg: 1, cnRatio: 1,  moisturePct: 95 },
  "molasses-water": { id: "molasses-water", category: "accelerators", dryMassKg: 1, cnRatio: 40, moisturePct: 90 },
  "seaweed":       { id: "seaweed",       category: "accelerators", dryMassKg: 5, cnRatio: 19, moisturePct: 85 },
  "lab-culture":   { id: "lab-culture",   category: "accelerators", dryMassKg: 1, cnRatio: 10, moisturePct: 90 },
};

// ─── Lookup ───────────────────────────────────────────────────────

/**
 * Return a fresh copy of the reference data for the given ingredient id.
 * Returns null for unknown ids so callers can fail soft.
 */
export function getIngredient(id) {
  const base = INGREDIENTS[id];
  if (!base) return null;
  return { ...base };
}

/**
 * Return all known ingredient ids (useful for UI dropdowns / tests).
 */
export function listIngredients() {
  return Object.keys(INGREDIENTS);
}

/**
 * Return all known categories (for palette / UI grouping).
 */
export const INGREDIENT_CATEGORIES = [
  "greens",
  "browns",
  "bulkers",
  "inoculants",
  "accelerators",
];

// ─── Mixing math ──────────────────────────────────────────────────
//
// For a pile of ingredients, overall C:N and moisture are computed as
// mass-weighted averages. We use:
//
//   carbon(i)   = dryMass(i) * cnRatio(i) / (1 + cnRatio(i))
//   nitrogen(i) = dryMass(i) / (1 + cnRatio(i))
//
// This is a common simplification that lets us mix on the carbon/
// nitrogen *masses* and then divide. It matches what most composting
// calculators do and is stable when the summed C:N is what matters.
//
// Moisture is the dry-mass-weighted average of moisture percentages,
// which is a reasonable first-order approximation. (A more precise
// model would separate water mass from dry mass; we can upgrade later
// if the sim calls for it.)
//
// `wetMass(i)` = dryMass(i) / (1 - moisturePct(i)/100) when a caller
// wants a "total pile weight including water" number.

/**
 * Weighted C:N ratio across an array of ingredient entries.
 * Accepts either full ingredient records or { id, dryMassKg } pairs
 * (where the rest is looked up).
 *
 * Returns Infinity if there is zero nitrogen (pure carbon), or NaN if
 * the array is empty — callers should handle these edge cases.
 */
export function mixCN(ingredients) {
  if (!ingredients || ingredients.length === 0) return NaN;
  let totalC = 0;
  let totalN = 0;
  for (const ing of ingredients) {
    const rec = resolveIngredient(ing);
    if (!rec) continue;
    const cn = rec.cnRatio;
    const m = rec.dryMassKg;
    const n = m / (1 + cn);
    const c = m - n;
    totalC += c;
    totalN += n;
  }
  if (totalN === 0) return Infinity;
  return totalC / totalN;
}

/**
 * Dry-mass-weighted moisture percentage across a list of ingredients.
 */
export function mixMoisture(ingredients) {
  if (!ingredients || ingredients.length === 0) return NaN;
  let totalMass = 0;
  let totalWater = 0;
  for (const ing of ingredients) {
    const rec = resolveIngredient(ing);
    if (!rec) continue;
    totalMass += rec.dryMassKg;
    totalWater += rec.dryMassKg * rec.moisturePct;
  }
  if (totalMass === 0) return NaN;
  return totalWater / totalMass;
}

/**
 * Total dry-mass of a list of ingredients.
 */
export function totalDryMass(ingredients) {
  if (!ingredients) return 0;
  let m = 0;
  for (const ing of ingredients) {
    const rec = resolveIngredient(ing);
    if (rec) m += rec.dryMassKg;
  }
  return m;
}

/**
 * Accept either a full ingredient record (with cnRatio etc.) or a
 * partial entry that just references an id by string or { id, dryMassKg }.
 * Caller-provided dryMassKg overrides the table value so the same
 * ingredient can be added in multiple sizes (one shovel vs one wheelbarrow).
 */
function resolveIngredient(ing) {
  if (!ing) return null;
  if (typeof ing === "string") return getIngredient(ing);
  if (ing.cnRatio != null && ing.moisturePct != null && ing.dryMassKg != null) {
    return ing;
  }
  const base = getIngredient(ing.id);
  if (!base) return null;
  return {
    ...base,
    dryMassKg: ing.dryMassKg != null ? ing.dryMassKg : base.dryMassKg,
    moisturePct: ing.moisturePct != null ? ing.moisturePct : base.moisturePct,
  };
}

export { resolveIngredient };
