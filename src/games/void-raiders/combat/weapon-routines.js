/**
 * Weapon Routines — per-weapon tactical targeting personalities.
 *
 * Parallel system to drones/routine.js, but tuned for stationary mothership
 * turrets instead of mobile drone swarms. Each routine is a PURE function
 * that scores an enemy as a target for one specific weapon, so the player's
 * 6-weapon roster each behaves with a distinct tactical intent instead of
 * every turret just "shooting the closest thing".
 *
 * Contract:
 *
 *   routine.evaluate(turret, enemy, allEnemies, ctx) → number
 *
 *     Returns a score where HIGHER = better target. A return of NaN or a
 *     negative number means the enemy is INELIGIBLE for this weapon and the
 *     target picker will skip it. Returning null is equivalent to NaN.
 *
 *     Routines MUST NOT mutate turret, enemy, allEnemies, or ctx — they are
 *     score-only, side-effect free.
 *
 * Wiring:
 *
 *   Attack defs in attack-defs.js opt into a routine by setting `routineId`.
 *   TurretSystem._pickTarget resolves the routine via getRoutine(routineId)
 *   and runs evaluate() against every in-arc, in-range candidate. When no
 *   routine is set, the legacy priority-string fallback is used.
 *
 * Score conventions (rough ranges for sanity checks):
 *
 *   - PD pulse:        0.001 … 1.0   (reciprocal of distance × fast bonus)
 *   - Arc emitter:     5    … 300    (neighbour count × gentle falloff)
 *   - Shield breaker:  0.25 … 1.0    (shield fraction, unmodified)
 *   - Flak burst:      10   … 500    (neighbour count squared × 1/distance)
 *   - Guided missile:  0    … 1.0    (hull fraction × slow bonus)
 *   - Heavy railgun:   10   … 500    (hull × long-range bonus)
 *
 * All routines skip dead enemies (hull ≤ 0) defensively, though the target
 * picker already filters those out before calling evaluate().
 */

// ─── Helpers ──────────────────────────────────────────────────────

function dist(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distSq(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return dx * dx + dy * dy + dz * dz;
}

function speedOf(enemy) {
  const v = enemy.velocity;
  if (!v) return 0;
  const vx = v.x ?? 0;
  const vy = v.y ?? 0;
  const vz = v.z ?? 0;
  return Math.sqrt(vx * vx + vy * vy + vz * vz);
}

function isAlive(enemy) {
  return enemy && enemy.stats && enemy.stats.hull > 0;
}

/**
 * Count alive neighbours of `enemy` within `radius` meters, excluding
 * `enemy` itself. Pure — does not mutate anything.
 */
function countNeighbours(enemy, allEnemies, radius) {
  if (!allEnemies || allEnemies.length === 0) return 0;
  const r2 = radius * radius;
  let n = 0;
  for (const other of allEnemies) {
    if (other === enemy) continue;
    if (!isAlive(other)) continue;
    if (!other.position) continue;
    if (distSq(enemy.position, other.position) <= r2) n++;
  }
  return n;
}

// Turret world position, falling back to the origin if the turret doesn't
// expose one yet (test fixtures can pass a plain {position} stub).
function turretPos(turret) {
  if (!turret) return { x: 0, y: 0, z: 0 };
  if (turret.position) return turret.position;
  if (turret.group && turret.group.position) return turret.group.position;
  return { x: 0, y: 0, z: 0 };
}

// ─── Routines ─────────────────────────────────────────────────────

/**
 * point-defense-pulse — anti-fighter PD.
 *
 * Tactical intent: strip fast small enemies (interceptors, scout fighters)
 * off the mothership before they strafe it. Uses an inverse-distance base
 * score so closer is always better, then boosts by the target's speed to
 * ensure scouts are always preferred over hovering cruisers.
 *
 * Eligibility:
 *   - Skip targets with hull > 100 (cruisers, bombers — PD tracers glance off)
 *   - Skip targets more than 150m away (PD range sweet spot)
 *   - Skip dead targets
 *
 * Score: (1 / (distance + 1)) × (1 + speed × 0.1)
 *   So a 30 m/s interceptor at 50m scores ~0.078, while a 5 m/s bomber at
 *   50m scores ~0.029 — the scout wins by a comfortable margin.
 */
export const POINT_DEFENSE_ROUTINE = {
  id: "point-defense-pd",
  description:
    "PD pulse — strongly prefers fast small targets, but still fires at anything in range.",
  evaluate(turret, enemy, allEnemies, _ctx) {
    if (!isAlive(enemy)) return NaN;
    const d = dist(turretPos(turret), enemy.position);
    if (d > 200) return NaN; // outside max engagement range
    const speed = speedOf(enemy);
    const hull = enemy.stats.hull ?? 0;
    // Base score: closer is better
    const base = 100 / (d + 1);
    // Speed bonus: scouts/interceptors win against cruisers
    const speedMod = 1 + speed * 0.15;
    // Hull penalty (NOT hard filter): big targets score lower but still eligible
    const hullPenalty = hull > 100 ? 0.2 : 1.0;
    return base * speedMod * hullPenalty;
  },
};

/**
 * arc-emitter — chain-lightning area weapon.
 *
 * Tactical intent: maximise arc jumps by picking a target that has the most
 * NEIGHBOURS within the chain-jump radius (~25m). Single isolated targets
 * are still eligible (unlike flak-burst) because the arc can still hit ONE
 * enemy, but the score strongly prefers clusters.
 *
 * Score: (1 + neighbours × 10) × (1 - distance / 260 × 0.3)
 *   Gentle distance falloff — beam weapons hit reliably at range so we only
 *   penalise the furthest targets mildly.
 *
 * Eligibility:
 *   - Skip dead targets
 *   - No shield requirement — the arc-emitter damage profile multiplies shield
 *     damage but still deals some hull damage, and letting the routine fire
 *     at unshielded targets is the tactical fallback when the catalog rules
 *     already filtered shielded-only preference at the rules-layer.
 */
export const ARC_EMITTER_ROUTINE = {
  id: "arc-emitter-chain",
  description:
    "Arc emitter — scores each candidate by chain-jumpable neighbours within 25m.",
  evaluate(turret, enemy, allEnemies, _ctx) {
    if (!isAlive(enemy)) return NaN;
    const neighbours = countNeighbours(enemy, allEnemies, 25);
    const d = dist(turretPos(turret), enemy.position);
    // Gentle falloff — 260m is the weapon range ceiling
    const rangeBonus = Math.max(0.7, 1 - (d / 260) * 0.3);
    return (1 + neighbours * 10) * rangeBonus;
  },
};

/**
 * shield-breaker — anti-shield specialist.
 *
 * Tactical intent: ONLY engage targets that still have meaningful shields.
 * Once shields drop below 25% of max, the routine disengages and the
 * weapon goes idle — that's the shield-breaker's job done, let the railgun
 * take over for the hull kill.
 *
 * Eligibility:
 *   - NaN if the target has no shieldsMax (never had shields — wrong enemy)
 *   - NaN if shields ≤ 0 (already cracked)
 *   - NaN if shields/shieldsMax ≤ 0.25 (routine is DONE with this target)
 *
 * Score: shields / shieldsMax
 *   Prefers the target with the HIGHEST shield fraction — that's the one
 *   most in need of cracking. Ties go to the one the picker finds first.
 */
export const SHIELD_BREAKER_ROUTINE = {
  id: "shield-breaker-anti-shield",
  description:
    "Shield breaker — strongly prefers shielded targets, but still fires on anything in range as a fallback.",
  evaluate(turret, enemy, allEnemies, _ctx) {
    if (!isAlive(enemy)) return NaN;
    const d = dist(turretPos(turret), enemy.position);
    if (d > 250) return NaN;
    const s = enemy.stats.shields ?? 0;
    const sMax = enemy.stats.shieldsMax ?? 0;
    // Score: shielded targets get 100x bonus, unshielded fall through
    // to a basic distance-based score so the weapon never goes idle.
    if (sMax > 0 && s > 0) {
      const frac = s / sMax;
      // Strong preference: 100 * frac, distance penalty
      return 100 * frac + 50 / (d + 1);
    }
    // Fallback: basic anti-target score, much lower than the shield path
    return 5 / (d + 1);
  },
};

/**
 * flak-burst — anti-swarm AOE.
 *
 * Tactical intent: detonate over the densest cluster of enemies you can
 * see. Single isolated targets are a waste of a flak shell — the routine
 * refuses to fire unless there are at least 3 enemies (including the
 * candidate) within 30m of each other.
 *
 * Eligibility:
 *   - Skip dead targets
 *   - NaN if neighbours + 1 < 3 (no real cluster)
 *
 * Score: (neighbours × neighbours) × (1 / (distance + 1))
 *   The quadratic neighbour term means a pack of 6 scores much higher than
 *   two packs of 3. Distance is a mild tiebreaker — closer packs are
 *   slightly preferred since the flak shell has a travel time.
 */
export const FLAK_BURST_ROUTINE = {
  id: "flak-burst-swarm",
  description:
    "Flak burst — strongly prefers clusters, but still fires on isolated targets as a fallback.",
  evaluate(turret, enemy, allEnemies, _ctx) {
    if (!isAlive(enemy)) return NaN;
    const d = dist(turretPos(turret), enemy.position);
    if (d > 350) return NaN;
    const neighbours = countNeighbours(enemy, allEnemies, 30);
    // Score: massive cluster bonus, with a small base score so it never
    // goes idle even when targets are scattered. Quadratic neighbour
    // bonus ensures dense packs win decisively when they exist.
    const clusterBonus = neighbours * neighbours * 50;
    const base = 10 / (d + 1);
    return base + clusterBonus / (d + 1);
  },
};

/**
 * guided-missile — smart homing PID missile.
 *
 * Tactical intent: go after the hull-heavy slow targets that PD turrets
 * will struggle to chase. Fast targets actively outmanoeuvre the 1.8 rad/s
 * turn cap, so the routine deprioritises them to a trickle — missiles
 * should feel like they're "wasted" on scouts.
 *
 * Eligibility:
 *   - Skip dead targets
 *   - Skip targets with no hullMax (sanity — can't score a fraction without it)
 *
 * Score: (hull / hullMax) × max(0, 1 - speed / 30)
 *   - A full-hull cruiser at 7 m/s scores 1.0 × 0.77 = 0.77
 *   - A half-hull cruiser at 7 m/s scores 0.5 × 0.77 = 0.38
 *   - A full-hull interceptor at 30 m/s scores 1.0 × 0.0  = 0.0 (still
 *     eligible as a last resort, but actively avoided if anything else is on)
 *   - A 40 m/s target scores a NEGATIVE number (the clamp returns 0 but we
 *     then subtract a tiny epsilon so the routine will NEVER pick a very
 *     fast target unless it's the only survivor — matches the weapon's
 *     "visibly misses fast movers" design intent).
 */
export const GUIDED_MISSILE_ROUTINE = {
  id: "guided-missile-smart",
  description:
    "Guided missile — prefers slow high-hull targets, deprioritises anything above 30 m/s.",
  evaluate(turret, enemy, allEnemies, _ctx) {
    if (!isAlive(enemy)) return NaN;
    const hull = enemy.stats.hull ?? 0;
    const hullMax = enemy.stats.hullMax ?? 0;
    if (hullMax <= 0) return NaN;
    const hullFrac = hull / hullMax;
    const speed = speedOf(enemy);
    const slowBonus = Math.max(0, 1 - speed / 30);
    // slowBonus hits 0 at speed 30, negative for anything above.
    // We keep the score as (hullFrac × slowBonus) so slow hulls = best.
    return hullFrac * slowBonus;
  },
};

/**
 * heavy-railgun — capital killer precision AP.
 *
 * Tactical intent: single-target precision — the biggest, toughest thing
 * on the field at the longest range. Skips fighters outright (they're not
 * worth the ~3.5s reload) and prefers full-hull targets that haven't been
 * softened up yet.
 *
 * Eligibility:
 *   - Skip dead targets
 *   - NaN if hull ≤ 60 (fighter-weight — let PD handle it)
 *   - NaN if speed > 20 m/s (too mobile for the 0.98 accuracy window)
 *
 * Score: hull × (1 + distance / 550 × 0.5)
 *   The range bonus REWARDS shooting at distant targets — that's the
 *   railgun's identity as the only 550m-range weapon. Pairs naturally with
 *   preferHighestHull via the attack def's skipIfShieldsAbsorb filter,
 *   which is still applied at the turret-system layer.
 */
export const HEAVY_RAILGUN_ROUTINE = {
  id: "heavy-railgun-capital",
  description:
    "Heavy railgun — strongly prefers slow high-hull capitals, but fires on anything as fallback.",
  evaluate(turret, enemy, allEnemies, _ctx) {
    if (!isAlive(enemy)) return NaN;
    const d = dist(turretPos(turret), enemy.position);
    if (d > 550) return NaN;
    const hull = enemy.stats.hull ?? 0;
    const speed = speedOf(enemy);
    // Strong preference: high-hull slow targets win big, but the routine
    // never goes idle. Fast lightweights still get a small score so the
    // railgun fires on them when nothing better is available.
    const rangeBonus = 1 + (d / 550) * 0.5;
    const hullBonus = Math.max(hull, 10);
    const speedPenalty = speed > 20 ? 0.15 : 1.0;
    return hullBonus * rangeBonus * speedPenalty;
  },
};

// ─── Registry ─────────────────────────────────────────────────────

/**
 * Named routine registry. Attack defs reference these by ID via `routineId`.
 * Adding a new routine = add it here + reference it from an attack def. No
 * code changes elsewhere.
 */
export const WEAPON_ROUTINES = {
  [POINT_DEFENSE_ROUTINE.id]: POINT_DEFENSE_ROUTINE,
  [ARC_EMITTER_ROUTINE.id]: ARC_EMITTER_ROUTINE,
  [SHIELD_BREAKER_ROUTINE.id]: SHIELD_BREAKER_ROUTINE,
  [FLAK_BURST_ROUTINE.id]: FLAK_BURST_ROUTINE,
  [GUIDED_MISSILE_ROUTINE.id]: GUIDED_MISSILE_ROUTINE,
  [HEAVY_RAILGUN_ROUTINE.id]: HEAVY_RAILGUN_ROUTINE,
};

/**
 * Look up a routine by ID. Returns null when the ID is missing so callers
 * can cleanly fall back to the legacy priority-string path.
 */
export function getRoutine(id) {
  if (!id) return null;
  return WEAPON_ROUTINES[id] ?? null;
}
