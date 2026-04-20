/**
 * Fairy Permaculture — event effect applicators (C6.1).
 *
 * Each effect has an `apply(effect, context, world, severity)` that
 * mutates `world` in a reversible way, and a matching `revert(effect,
 * context, world, appliedSnapshot)` that restores the pre-event state
 * when the event ends.
 *
 * Effects record their own before/after state inside the returned
 * `snapshot` so the event engine can reverse them without reading the
 * registry a second time. `severity` is 0..1 after mitigation scaling.
 *
 * Where a target subsystem isn't wired in (e.g. no plantManager yet),
 * `apply` returns an empty snapshot and the corresponding `revert`
 * becomes a no-op — consistent with the MVP "degrade gracefully"
 * posture of the event layer.
 */

// ─── moisture-loss ───────────────────────────────────────────────
// Multiplies per-day evaporation for the event's duration. We store a
// pending-multiplier on world.env so soil.tick can read it (soil layer
// already takes `evapBase` in env). Non-destructive: revert removes it.
function applyMoistureLoss(effect, _ctx, world) {
  const factor = effect.params.factor ?? 2.0;
  world.env = world.env ?? {};
  const prev = world.env.evapMultiplier ?? 1;
  world.env.evapMultiplier = prev * factor;
  return { kind: "moisture-loss", prev, factor };
}
function revertMoistureLoss(_effect, _ctx, world, snap) {
  if (!snap || !world?.env) return;
  world.env.evapMultiplier = snap.prev;
}

// ─── unwatered-yield-penalty ─────────────────────────────────────
// Applies a scalar yield multiplier to plants not near water. Stored
// on world.activePenalties.yield so the plant yield loop can read it.
function applyYieldPenalty(effect, ctx, world, severity = 1) {
  const minP = effect.params.min ?? 0.3;
  const maxP = effect.params.max ?? 0.7;
  // Severity 1 → max penalty, severity 0 → no penalty.
  const penalty = minP + (maxP - minP) * severity;
  const reduction = 1 - penalty; // e.g. penalty 0.5 → yield × 0.5
  world.activePenalties = world.activePenalties ?? { yield: [] };
  const entry = { kind: "unwatered-yield-penalty", factor: reduction, ctx };
  world.activePenalties.yield.push(entry);
  return { kind: "unwatered-yield-penalty", entry };
}
function revertUnwateredYield(_effect, _ctx, world, snap) {
  if (!snap || !world?.activePenalties?.yield) return;
  const idx = world.activePenalties.yield.indexOf(snap.entry);
  if (idx >= 0) world.activePenalties.yield.splice(idx, 1);
}

function applyFlatYieldPenalty(effect, ctx, world, severity = 1) {
  const baseFactor = effect.params.factor ?? 0.5;
  // factor ∈ (0..1), where 0.5 = 50% yield loss at full severity.
  // Scale by severity (0 means no loss → multiplier 1).
  const factor = 1 - (1 - baseFactor) * severity;
  world.activePenalties = world.activePenalties ?? { yield: [] };
  const entry = { kind: "yield-penalty", factor, ctx };
  world.activePenalties.yield.push(entry);
  return { kind: "yield-penalty", entry };
}
function revertFlatYield(_effect, _ctx, world, snap) {
  if (!snap || !world?.activePenalties?.yield) return;
  const idx = world.activePenalties.yield.indexOf(snap.entry);
  if (idx >= 0) world.activePenalties.yield.splice(idx, 1);
}

// ─── sapling-death-risk ──────────────────────────────────────────
// Record a pending daily-risk on world; consumed by plantManager during
// its tick if present. No direct mutation at apply-time (MVP).
function applySaplingRisk(effect, _ctx, world, severity = 1) {
  const prob = (effect.params.probability ?? 0.05) * severity;
  world.pendingRisks = world.pendingRisks ?? {};
  const prev = world.pendingRisks.saplingDeathPerDay ?? 0;
  world.pendingRisks.saplingDeathPerDay = prev + prob;
  return { kind: "sapling-death-risk", added: prob };
}
function revertSaplingRisk(_effect, _ctx, world, snap) {
  if (!snap || !world?.pendingRisks) return;
  world.pendingRisks.saplingDeathPerDay = Math.max(
    0,
    (world.pendingRisks.saplingDeathPerDay ?? 0) - snap.added
  );
}

// ─── spread-to-neighbors ─────────────────────────────────────────
// Arms a per-day spread probability; the plant-manager (once present)
// reads it from world.pendingRisks.aphidSpreadPerDay.
function applySpread(effect, _ctx, world, severity = 1) {
  const prob = (effect.params.chance_per_day ?? 0.2) * severity;
  world.pendingRisks = world.pendingRisks ?? {};
  const prev = world.pendingRisks.aphidSpreadPerDay ?? 0;
  world.pendingRisks.aphidSpreadPerDay = prev + prob;
  return { kind: "spread-to-neighbors", added: prob };
}
function revertSpread(_effect, _ctx, world, snap) {
  if (!snap || !world?.pendingRisks) return;
  world.pendingRisks.aphidSpreadPerDay = Math.max(
    0,
    (world.pendingRisks.aphidSpreadPerDay ?? 0) - snap.added
  );
}

// ─── pile-state-change ───────────────────────────────────────────
// Force each affected pile into a new state (e.g. "anaerobic"). We
// remember each pile's original state for revert.
function applyPileStateChange(effect, ctx, world) {
  const piles = world?.compostPiles;
  const idxs = ctx?.pileIndices ?? [];
  if (!Array.isArray(piles)) return { kind: "pile-state-change", restores: [] };
  const newState = effect.params.new_state ?? "anaerobic";
  const restores = [];
  for (const i of idxs) {
    const p = piles[i];
    if (!p) continue;
    restores.push({ i, state: p.state });
    p.state = newState;
  }
  return { kind: "pile-state-change", restores };
}
function revertPileStateChange(_effect, _ctx, world, snap) {
  if (!snap || !Array.isArray(world?.compostPiles)) return;
  for (const r of snap.restores ?? []) {
    const p = world.compostPiles[r.i];
    if (p) p.state = r.state;
  }
}

// ─── quality-cap ─────────────────────────────────────────────────
// Sets a per-pile quality cap for the duration. Written to
// pile.__qualityCap; quality.js already clamps at harvest if present.
// For MVP we only stash it; the pile module may or may not honor it,
// but revert cleans it up regardless.
function applyQualityCap(effect, ctx, world) {
  const piles = world?.compostPiles;
  const idxs = ctx?.pileIndices ?? [];
  if (!Array.isArray(piles)) return { kind: "quality-cap", restores: [] };
  const max = effect.params.max_quality ?? 1;
  const restores = [];
  for (const i of idxs) {
    const p = piles[i];
    if (!p) continue;
    restores.push({ i, prev: p.__qualityCap });
    p.__qualityCap = max;
  }
  return { kind: "quality-cap", restores };
}
function revertQualityCap(_effect, _ctx, world, snap) {
  if (!snap || !Array.isArray(world?.compostPiles)) return;
  for (const r of snap.restores ?? []) {
    const p = world.compostPiles[r.i];
    if (!p) continue;
    if (r.prev === undefined) delete p.__qualityCap;
    else p.__qualityCap = r.prev;
  }
}

// ─── lose-animals ────────────────────────────────────────────────
// Removes animals from the affected flock at fire-time (not every day
// — hawk strike events have 1-day duration, so this runs once on apply).
// For MVP, if animalManager exposes `removeFromFlock(id, n)` we use it.
function applyLoseAnimals(effect, ctx, world, severity = 1) {
  const am = world?.animalManager;
  if (!am || typeof am.removeFromFlock !== "function") {
    return { kind: "lose-animals", removed: 0 };
  }
  const min = effect.params.min ?? 1;
  const max = effect.params.max ?? 3;
  // Scale by severity so mitigations can attenuate losses. `world.rng`
  // is optional; fall back to 50% mid-range for determinism in tests.
  const rng = typeof world.rng === "function" ? world.rng : () => 0.5;
  const rawLoss = Math.round(min + (max - min) * rng());
  const n = Math.max(0, Math.round(rawLoss * severity));
  if (ctx?.flockId && n > 0) am.removeFromFlock(ctx.flockId, n);
  return { kind: "lose-animals", removed: n, flockId: ctx?.flockId };
}
function revertLoseAnimals(_effect, _ctx, _world, _snap) {
  // Casualty events don't revert by design — losses are permanent.
  // No-op.
}

// ─── Registry ────────────────────────────────────────────────────

export const EFFECT_APPLIERS = Object.freeze({
  "moisture-loss": applyMoistureLoss,
  "unwatered-yield-penalty": applyYieldPenalty,
  "yield-penalty": applyFlatYieldPenalty,
  "sapling-death-risk": applySaplingRisk,
  "spread-to-neighbors": applySpread,
  "pile-state-change": applyPileStateChange,
  "quality-cap": applyQualityCap,
  "lose-animals": applyLoseAnimals,
});

export const EFFECT_REVERTERS = Object.freeze({
  "moisture-loss": revertMoistureLoss,
  "unwatered-yield-penalty": revertUnwateredYield,
  "yield-penalty": revertFlatYield,
  "sapling-death-risk": revertSaplingRisk,
  "spread-to-neighbors": revertSpread,
  "pile-state-change": revertPileStateChange,
  "quality-cap": revertQualityCap,
  "lose-animals": revertLoseAnimals,
});

export function applyEffect(effect, context, world, severity) {
  const fn = EFFECT_APPLIERS[effect.type];
  if (!fn) return null;
  return fn(effect, context, world, severity);
}

export function revertEffect(effect, context, world, snapshot) {
  const fn = EFFECT_REVERTERS[effect.type];
  if (!fn || !snapshot) return;
  fn(effect, context, world, snapshot);
}
