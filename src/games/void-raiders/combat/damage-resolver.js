/**
 * Damage Resolver — single source of truth for shield/hull damage routing.
 *
 * Replaces the hand-rolled "shields first then hull" math that used to live
 * in turret-system.js, attack-system.js, and a couple of fallback paths in
 * weapon.js. Centralising it here means the new per-weapon damage modifiers
 * (`damageVsShields`, `damageVsHull`) are applied consistently regardless of
 * which firing path the shot took.
 *
 * Damage Model — Option B from the weapon catalog:
 *
 *   raw damage from the attack def is split into shield slice + hull slice
 *   in that order. Each slice is multiplied by the corresponding modifier
 *   from the attack def (default 1.0 for both). Modifiers can also boost
 *   damage above the raw value, so a weapon with damageVsShields = 2.0 will
 *   chew through twice as much shield as its base damage suggests.
 *
 * Why split-then-multiply instead of multiply-then-spend?
 *   Because a 2.0× shield weapon hitting a target with only 5 shield should
 *   only burn through 5 shield, not 10 — the extra capacity isn't there to
 *   absorb. The remainder spills into hull at the HULL multiplier, not the
 *   shield multiplier. Each slice gets the right modifier.
 *
 * Usage:
 *   import { resolveDamage, applyDamage } from "./damage-resolver.js";
 *
 *   resolveDamage(target, attackDef);
 *     → mutates target.stats.shields and target.stats.hull,
 *       updates target.state to "dead" when hull hits 0,
 *       returns { shieldDamage, hullDamage, killed }.
 *
 *   applyDamage(target, attackDef, impactPos);
 *     → preferred entry point. If the target has a takeDamage(amount, pos)
 *       method, this falls through to that (preserving shield ripple
 *       impact-position behavior in the visual layer). Otherwise it does
 *       resolveDamage. damageVsShields/damageVsHull are pre-applied inside
 *       resolveDamage; for the takeDamage path we pass the EFFECTIVE damage
 *       (the higher of the two slices, weighted by where the target's pool
 *       absorbs it) so the rendered damage number still reflects the
 *       weapon's role.
 */

/**
 * Resolve a single attack against a target's shields + hull. Mutates the
 * target's stats in place. Returns the actual damage dealt to each pool.
 *
 * @param {object} target — { stats: { shields?, hull, hullMax? }, state? }
 * @param {object} attackDef — from attack-defs.js, may include damageVsShields and damageVsHull
 * @returns {{ shieldDamage: number, hullDamage: number, killed: boolean }}
 */
export function resolveDamage(target, attackDef) {
  if (!target?.stats || !attackDef) return { shieldDamage: 0, hullDamage: 0, killed: false };
  const baseDamage = attackDef.damage ?? 0;
  if (baseDamage <= 0) return { shieldDamage: 0, hullDamage: 0, killed: false };

  const vsShields = attackDef.damageVsShields ?? 1.0;
  const vsHull = attackDef.damageVsHull ?? 1.0;

  let shieldDamage = 0;
  let hullDamage = 0;
  let baseRemaining = baseDamage;

  // Shield slice — clamp to whatever shields can actually absorb in BASE
  // currency, then multiply that slice by the shield modifier.
  const shieldsBefore = target.stats.shields ?? 0;
  if (shieldsBefore > 0 && baseRemaining > 0) {
    // The shield can absorb min(shieldsBefore / vsShields, baseRemaining)
    // BASE damage worth before it's depleted. Equivalent to converting the
    // shield pool into "base damage units" through the modifier.
    const shieldCapacityInBase = vsShields > 0 ? shieldsBefore / vsShields : Infinity;
    const baseSpentOnShield = Math.min(baseRemaining, shieldCapacityInBase);
    shieldDamage = baseSpentOnShield * vsShields;
    target.stats.shields = Math.max(0, shieldsBefore - shieldDamage);
    baseRemaining -= baseSpentOnShield;
  }

  // Hull slice — whatever base damage didn't get spent on shields hits hull
  // through the hull modifier.
  if (baseRemaining > 0) {
    hullDamage = baseRemaining * vsHull;
    target.stats.hull = Math.max(0, target.stats.hull - hullDamage);
  }

  let killed = false;
  if (target.stats.hull <= 0) {
    killed = true;
    if (target.state !== undefined && target.state !== "dead" && target.state !== "destroyed") {
      target.state = "dead";
    }
  }

  return { shieldDamage, hullDamage, killed };
}

/**
 * Preferred high-level entry point. Routes damage through the target's own
 * takeDamage method when present (so shield ripple visuals + hit feedback
 * UI keep working), otherwise falls back to direct resolveDamage. Either
 * way, damageVsShields/damageVsHull are honored.
 *
 * For the takeDamage path we have to pre-resolve the damage (so the modifiers
 * are applied) and pass an EFFECTIVE total. We compute the effective damage
 * by adding the resolved shield + hull slices.
 *
 * @param {object} target
 * @param {object} attackDef
 * @param {{x,y,z}} [impactPos] — forwarded to takeDamage for shield ripple anchor
 * @returns {{ shieldDamage: number, hullDamage: number, killed: boolean }}
 */
export function applyDamage(target, attackDef, impactPos) {
  if (!target || !attackDef) return { shieldDamage: 0, hullDamage: 0, killed: false };
  const baseDamage = attackDef.damage ?? 0;
  if (baseDamage <= 0) return { shieldDamage: 0, hullDamage: 0, killed: false };

  // takeDamage is the public hit interface used by mothership/drones for
  // shield ripple anchor + damage indicator UI. We need to preserve it.
  // Strategy: simulate the resolve against a snapshot of the target's stats
  // to compute the effective total, then call takeDamage with that total.
  if (typeof target.takeDamage === "function" && target.stats) {
    const snapshot = {
      stats: {
        shields: target.stats.shields ?? 0,
        hull: target.stats.hull,
      },
      state: "active",
    };
    const result = resolveDamage(snapshot, attackDef);
    const effective = result.shieldDamage + result.hullDamage;
    target.takeDamage(effective, impactPos);
    // Return the resolved slices so callers can react (e.g. kill VFX)
    return result;
  }

  // No takeDamage method — apply directly
  return resolveDamage(target, attackDef);
}

/**
 * Returns true if the attack def's shield modifier means it would be wasted
 * on this target (e.g. an AP railgun firing into a fully-shielded ship). Used
 * by the targeting filter to skip targets a slow heavy weapon shouldn't
 * commit to.
 *
 * The threshold is "would the shields fully absorb the shot at the configured
 * shield multiplier" — if so, this attack is a poor choice.
 */
export function shieldWouldFullyAbsorb(target, attackDef) {
  const shields = target?.stats?.shields ?? 0;
  if (shields <= 0) return false;
  const vsShields = attackDef.damageVsShields ?? 1.0;
  if (vsShields <= 0) return true; // can't damage shields at all
  const baseDamage = attackDef.damage ?? 0;
  // Effective shield damage from one shot
  const effectiveShield = baseDamage * vsShields;
  return shields >= effectiveShield;
}
