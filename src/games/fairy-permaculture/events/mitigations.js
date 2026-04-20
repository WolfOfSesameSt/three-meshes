/**
 * Fairy Permaculture — mitigation evaluators (C6.1).
 *
 * For each `mitigation.type` present in events.json, check whether the
 * player's current world state satisfies the mitigation condition and
 * return its `reduces_severity_by` contribution (0..1).
 *
 * Final severity reduction = min(1, sum(contributions)). We cap at 1
 * so stacking many counters can't invert the event into a bonus.
 *
 * Every evaluator is defensive: when the relevant subsystem isn't
 * available (e.g. no swale manager yet), it returns 0 — the event will
 * land at full severity, which is the correct MVP behavior.
 */

// Helpers ─────────────────────────────────────────────────────────

function tileDist2(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  return dx * dx + dy * dy;
}

function anyWithinRadius(items, center, radiusTiles, pred = () => true) {
  if (!Array.isArray(items)) return false;
  const r2 = radiusTiles * radiusTiles;
  for (const it of items) {
    if (!it) continue;
    if (!pred(it)) continue;
    if (tileDist2(it, center) <= r2) return true;
  }
  return false;
}

// Mitigation evaluators ───────────────────────────────────────────

function swaleCoverage(m, _ctx, world) {
  const radius = m.params.radius_tiles ?? 12;
  const swales = world?.structures?.swales;
  const center = _ctx?.center;
  if (!center || !Array.isArray(swales)) return 0;
  return anyWithinRadius(swales, center, radius) ? m.reduces_severity_by : 0;
}

function pondNearby(m, ctx, world) {
  const radius = m.params.radius_tiles ?? 8;
  const ponds = world?.structures?.ponds;
  const center = ctx?.center;
  if (!center || !Array.isArray(ponds)) return 0;
  return anyWithinRadius(ponds, center, radius) ? m.reduces_severity_by : 0;
}

function healerFairyWatering(m, _ctx, world) {
  return world?.fairies?.healersActive ? m.reduces_severity_by : 0;
}

function healerFairyTreatment(m, _ctx, world) {
  return world?.fairies?.healersActive ? m.reduces_severity_by : 0;
}

function mulchCoverage(m, _ctx, world) {
  return world?.structures?.mulchApplied ? m.reduces_severity_by : 0;
}

function insectaryProximity(m, ctx, world) {
  const pm = world?.plantManager;
  if (!pm || typeof pm.listInstances !== "function" || !ctx?.center) return 0;
  const radius = m.params.radius_tiles ?? 8;
  const species = m.params.species ?? [];
  const insectaries = pm.listInstances().filter((p) => species.includes(p.id));
  return anyWithinRadius(insectaries, ctx.center, radius) ? m.reduces_severity_by : 0;
}

function ladybugRelease(m, _ctx, world) {
  return world?.fairies?.ladybugReleaseActive ? m.reduces_severity_by : 0;
}

function addBrownsBulkers(m, ctx, world) {
  // If any affected pile has a bulker/brown category in its ingredients,
  // treat the player as having actively mitigated.
  const piles = world?.compostPiles;
  const idxs = ctx?.pileIndices ?? [];
  if (!Array.isArray(piles) || idxs.length === 0) return 0;
  const anyMitigated = idxs.some((i) => {
    const p = piles[i];
    if (!p || !Array.isArray(p.ingredients)) return false;
    return p.ingredients.some(
      (ing) => ing?.category === "browns" || ing?.category === "bulkers"
    );
  });
  return anyMitigated ? m.reduces_severity_by : 0;
}

function coverPileTarp(m, ctx, world) {
  const piles = world?.compostPiles;
  const idxs = ctx?.pileIndices ?? [];
  if (!Array.isArray(piles) || idxs.length === 0) return 0;
  const allCovered = idxs.every((i) => piles[i]?.covered);
  return allCovered ? m.reduces_severity_by : 0;
}

function siteUnderCanopy(m, ctx, world) {
  // World can annotate piles with { canopyCover } — MVP heuristic.
  const piles = world?.compostPiles;
  const idxs = ctx?.pileIndices ?? [];
  if (!Array.isArray(piles) || idxs.length === 0) return 0;
  const covered = idxs.every((i) => (piles[i]?.canopyCover ?? 0) >= 0.5);
  return covered ? m.reduces_severity_by : 0;
}

function canopyCover(m, _ctx, world) {
  const frac = m.params.fraction_min ?? 0.3;
  const current = world?.canopyCoverFraction ?? 0;
  return current >= frac ? m.reduces_severity_by : 0;
}

function guardAnimalNearby(m, _ctx, world) {
  const am = world?.animalManager;
  if (!am || typeof am.listFlocks !== "function") return 0;
  const species = m.params.species ?? [];
  return am.listFlocks().some((f) => species.includes(f?.species))
    ? m.reduces_severity_by
    : 0;
}

function chickenTractorUnderCanopy(m, _ctx, world) {
  return world?.structures?.chickenTractorUnderCanopy ? m.reduces_severity_by : 0;
}

// ─── Registry ────────────────────────────────────────────────────

export const MITIGATIONS = Object.freeze({
  "swale-coverage": swaleCoverage,
  "pond-nearby": pondNearby,
  "healer-fairy-watering": healerFairyWatering,
  "healer-fairy-treatment": healerFairyTreatment,
  "mulch-coverage": mulchCoverage,
  "insectary-proximity": insectaryProximity,
  "ladybug-release": ladybugRelease,
  "add-browns-bulkers": addBrownsBulkers,
  "cover-pile-tarp": coverPileTarp,
  "site-under-canopy": siteUnderCanopy,
  "canopy-cover": canopyCover,
  "guard-animal-nearby": guardAnimalNearby,
  "chicken-tractor-under-canopy": chickenTractorUnderCanopy,
});

/**
 * Score total severity reduction for an event firing. Returns a float
 * in [0, 1] — 0 means full event, 1 means event is fully defused.
 */
export function computeSeverityReduction(event, context, world) {
  let total = 0;
  for (const m of event.mitigations ?? []) {
    const fn = MITIGATIONS[m.type];
    if (!fn) continue; // unknown mitigation → skip
    total += fn(m, context, world);
    if (total >= 1) return 1;
  }
  return Math.min(1, total);
}

/**
 * Convenience: given an event + context + world, return the active
 * severity multiplier (1 - reduction), in [0, 1].
 */
export function severityMultiplier(event, context, world) {
  return 1 - computeSeverityReduction(event, context, world);
}
