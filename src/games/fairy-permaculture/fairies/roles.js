/**
 * Fairy Permaculture — per-role behavior.
 *
 * Each role defines:
 *   - serveUnassigned()  does light idle work
 *   - serveDay(fairy, world)  per-day productive work
 *   - gainXp(fairy, amount)   award XP (handled by fleet)
 *
 * For MVP only Composter has a real behavior; the other 7 roles are
 * stubs so the system is pluggable. Each chunk that enables a new
 * role (harvester at C3.1, beekeeper at C4.2, etc.) supplies its
 * implementation here.
 */

import fairiesConfig from "../data/fairies.json" with { type: "json" };

// Pre-index role configs by id for lookup.
const ROLE_CONFIG = new Map(fairiesConfig.roles.map((r) => [r.id, r]));

// ── Per-role tick implementations ─────────────────────────────────

/**
 * Composter — responsible for moving biomass into the nearest pile,
 * turning it on cadence, and emitting finished compost.
 *
 * world: { piles?: Pile[], harvest?: (pile) => { kg, quality } }
 */
export const composter = {
  serveDay(fairy, world) {
    const pile = nearestPile(fairy, world?.piles ?? []);
    if (!pile) {
      // Nothing to do → drift back to idle pos.
      fairy.targetPos = null;
      return;
    }

    // Visibly fly toward the pile when composting. Uses the pile
    // mesh's position if provided, otherwise the pile data.
    const px = pile.x ?? (pile.mesh?.position?.x ?? 0);
    const pz = pile.z ?? (pile.mesh?.position?.z ?? 0);
    const py = pile.y ?? (pile.mesh?.position?.y ?? 0);
    fairy.targetPos = { x: px, y: py + 3.5, z: pz + 1.5 };

    if (pile.state === "filling") {
      pile.addIngredient({ id: "fresh-grass", dryMassKg: 2 });
      fairy.xp += 1;
    } else if (pile.state === "turn-window") {
      const ok = pile.turn?.();
      if (ok) fairy.xp += 3;
    } else if (pile.state === "finished") {
      fairy.readyToHarvest = pile;
      fairy.xp += 5;
    }
  },
};

/** Harvester — picks ripe fruit/grain from nearby plants. Wired in C4.1+. */
export const harvester = {
  serveDay(fairy, world) {
    const ripe = world?.plantManager?.findRipe?.();
    if (!ripe || ripe.length === 0) return;
    const target = ripe[0];
    const result = world.plantManager.harvest?.(target.tileX, target.tileY);
    if (result && result.amount > 0) fairy.xp += 2;
  },
};

/** Forager — collects biomass + wild seeds from forest edge. */
export const forager = {
  serveDay(fairy, world) {
    const forage = world?.biome?.forageBiomass?.(fairy.x, fairy.z) ?? 0.6;
    if (forage > 0) {
      world?.addBiomass?.(forage);
      fairy.xp += 1;
    }
  },
};

/** Digger / Builder / Beekeeper / Shepherd / Healer — stubs until their chunks. */
export const digger    = { serveDay() {} };
export const builder   = { serveDay() {} };
export const beekeeper = {
  serveDay(fairy, world) {
    for (const hive of world?.hives ?? []) {
      hive.inspect?.(); // C4.2 implements this
      fairy.xp += 1;
    }
  },
};
export const shepherd = {
  serveDay(fairy, world) {
    for (const a of world?.animals ?? []) {
      a.tendedToday = true; // C4.3 reads this
    }
    fairy.xp += 1;
  },
};
export const healer = {
  serveDay(fairy, world) {
    const sick = world?.plantManager?.findUnhealthy?.() ?? [];
    for (const p of sick.slice(0, 3)) p.health = Math.min(1, p.health + 0.1);
    if (sick.length > 0) fairy.xp += sick.length;
  },
};

// ── Registry ──────────────────────────────────────────────────────

export const ROLES = {
  composter,
  harvester,
  forager,
  digger,
  builder,
  beekeeper,
  shepherd,
  healer,
};

// ── Level math ────────────────────────────────────────────────────

export function levelFromXp(xp, curve = [0, 20, 60, 140, 300]) {
  let level = 1;
  for (let i = 0; i < curve.length; i++) {
    if (xp >= curve[i]) level = i + 1;
    else break;
  }
  return Math.min(5, level);
}

export function bonusForLevel(roleId, level) {
  const role = ROLE_CONFIG.get(roleId);
  if (!role) return { multiplier: 1, ability: null };
  const entry = role.level_bonuses?.find((b) => b.level === level);
  return {
    multiplier: entry?.multiplier ?? 1,
    ability: entry?.unique_ability ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function nearestPile(fairy, piles) {
  if (!piles || piles.length === 0) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of piles) {
    const dx = (p.x ?? 0) - (fairy.x ?? 0);
    const dz = (p.z ?? 0) - (fairy.z ?? 0);
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
