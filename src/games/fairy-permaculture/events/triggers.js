/**
 * Fairy Permaculture — event trigger predicates (C6.1).
 *
 * One pure-ish function per `trigger.type` in data/events.json. Each
 * returns `{ fires: boolean, context?: object }`. `context` carries
 * affected-entity ids so effects + mitigations can target them.
 *
 * These functions:
 *   - never mutate input
 *   - tolerate missing world subsystems (e.g. plantManager absent in the
 *     MVP build) by returning `{ fires: false }` silently
 *   - read streaks/state directly off the env/world, no hidden globals
 */

// ─── consecutive-rainless-days ────────────────────────────────────
// Fires when the weatherListener's rainlessDaysStreak crosses the
// configured threshold during the event's trigger-season.
export function consecutiveRainlessDays(event, env, _world) {
  const threshold = event.trigger.params.threshold_days ?? 10;
  const streak = env.rainlessDaysStreak ?? 0;
  if (streak < threshold) return { fires: false };
  return { fires: true, context: { streakDays: streak } };
}

// ─── monoculture-cluster ──────────────────────────────────────────
// Scans plant instances for ≥ N of the same family within `radius_tiles`.
// Reads `world.plantManager.listInstances()` → [{ id, family, x, y }, ...].
export function monocultureCluster(event, _env, world) {
  const pm = world?.plantManager;
  if (!pm || typeof pm.listInstances !== "function") {
    return { fires: false };
  }
  const plants = pm.listInstances();
  if (!Array.isArray(plants) || plants.length === 0) return { fires: false };

  const threshold = event.trigger.params.same_family_threshold ?? 4;
  const radius = event.trigger.params.radius_tiles ?? 3;
  const r2 = radius * radius;

  // O(n²) scan — fine at MVP plant counts.
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    if (!p?.family) continue;
    const cluster = [p];
    for (let j = 0; j < plants.length; j++) {
      if (j === i) continue;
      const q = plants[j];
      if (!q || q.family !== p.family) continue;
      const dx = (q.x ?? 0) - (p.x ?? 0);
      const dy = (q.y ?? 0) - (p.y ?? 0);
      if (dx * dx + dy * dy <= r2) cluster.push(q);
    }
    if (cluster.length >= threshold) {
      return {
        fires: true,
        context: {
          family: p.family,
          affectedIds: cluster.map((c) => c.id).filter(Boolean),
          center: { x: p.x ?? 0, y: p.y ?? 0 },
        },
      };
    }
  }
  return { fires: false };
}

// ─── rain-on-hot-pile ─────────────────────────────────────────────
// Fires when a HOT (or TURN_WINDOW) pile has weathered
// `consecutive_rain_days` in a row without a cover.
export function rainOnHotPile(event, env, world) {
  const piles = world?.compostPiles;
  if (!Array.isArray(piles) || piles.length === 0) return { fires: false };

  const rainDays = env.rainDaysStreak ?? 0;
  const needed = event.trigger.params.consecutive_rain_days ?? 3;
  if (rainDays < needed) return { fires: false };

  const vulnerable = piles.filter((p) => {
    if (!p) return false;
    const isHot = p.state === "hot" || p.state === "turn-window";
    return isHot && !p.covered;
  });
  if (vulnerable.length === 0) return { fires: false };

  return {
    fires: true,
    context: {
      pileIndices: vulnerable.map((_p, i) => piles.indexOf(_p)),
    },
  };
}

// ─── open-pasture-daylight ────────────────────────────────────────
// Reads `world.animalManager.listFlocks()` → [{ species, count, x, y,
// canopyCover }]. MVP check: any chicken-layer flock ≥ flock_size_min
// sitting under canopy below `canopy_cover_below`.
export function openPastureDaylight(event, _env, world) {
  const am = world?.animalManager;
  if (!am || typeof am.listFlocks !== "function") {
    return { fires: false };
  }
  const flocks = am.listFlocks();
  if (!Array.isArray(flocks) || flocks.length === 0) return { fires: false };

  const minSize = event.trigger.params.flock_size_min ?? 3;
  const canopyMax = event.trigger.params.canopy_cover_below ?? 0.3;

  for (const f of flocks) {
    if (!f) continue;
    if (f.species !== "chicken-layer") continue;
    if ((f.count ?? 0) < minSize) continue;
    if ((f.canopyCover ?? 0) >= canopyMax) continue;
    return {
      fires: true,
      context: {
        flockId: f.id,
        species: f.species,
        count: f.count,
      },
    };
  }
  return { fires: false };
}

// Trigger registry keyed by events.json `trigger.type`.
export const TRIGGERS = Object.freeze({
  "consecutive-rainless-days": consecutiveRainlessDays,
  "monoculture-cluster": monocultureCluster,
  "rain-on-hot-pile": rainOnHotPile,
  "open-pasture-daylight": openPastureDaylight,
});

/** Resolve a trigger predicate. Returns null if unknown. */
export function getTrigger(type) {
  return TRIGGERS[type] ?? null;
}
