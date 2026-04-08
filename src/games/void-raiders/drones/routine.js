/**
 * AI Routine Engine — the 5 core rules that drive drone swarm behavior.
 *
 * Rules:
 *   1. ANCHOR   — spatial center point the swarm operates around
 *   2. RANGE    — operating radius from the anchor
 *   3. PRIORITY — how to rank potential targets
 *   4. ACTION   — what to do when engaging a target
 *   5. RETREAT  — conditions to disengage
 *
 * The engine evaluates rules per-drone each tick:
 *   1. Check RETREAT → if triggered, return to mothership
 *   2. Resolve ANCHOR position
 *   3. Find targets within RANGE of anchor
 *   4. Sort targets by PRIORITY
 *   5. Execute ACTION on best target
 *   6. If no target, idle-orbit around anchor
 */

import { isDroneAlive } from "./drone.js";

// ─── Rule Definitions ──────────────────────────────────────────

/**
 * All available anchor types. New ones unlocked via research.
 */
export const ANCHOR_TYPES = {
  "follow-mothership": {
    id: "follow-mothership",
    label: "Follow Mothership",
    resolve: (ctx) => ({ ...ctx.mothershipPos }),
    unlocked: true,
  },
  fixed: {
    id: "fixed",
    label: "Fixed Point",
    resolve: (ctx, swarm) => ({ ...swarm.anchorPosition }),
    unlocked: true,
  },
  "track-resource": {
    id: "track-resource",
    label: "Track Nearest Resource",
    resolve: (ctx) => {
      const nearest = findNearest(ctx.mothershipPos, ctx.deposits);
      return nearest ? { ...nearest.position } : { ...ctx.mothershipPos };
    },
    unlocked: true,
  },
  "track-enemy": {
    id: "track-enemy",
    label: "Track Nearest Enemy",
    resolve: (ctx) => {
      const nearest = findNearest(ctx.mothershipPos, ctx.enemies);
      return nearest ? { ...nearest.position } : { ...ctx.mothershipPos };
    },
    unlocked: true,
  },
};

/**
 * Priority functions — how to sort potential targets.
 */
export const PRIORITY_TYPES = {
  nearest: {
    id: "nearest",
    label: "Nearest",
    sort: (targets, dronePos) =>
      targets.sort((a, b) => dist3(a.position, dronePos) - dist3(b.position, dronePos)),
    unlocked: true,
  },
  richest: {
    id: "richest",
    label: "Richest Deposit",
    sort: (targets) =>
      targets.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    unlocked: true,
  },
  weakest: {
    id: "weakest",
    label: "Weakest Enemy",
    sort: (targets) =>
      targets.sort((a, b) => (a.stats?.hull ?? Infinity) - (b.stats?.hull ?? Infinity)),
    unlocked: true,
  },
  strongest: {
    id: "strongest",
    label: "Strongest Threat",
    sort: (targets) =>
      targets.sort((a, b) => (b.stats?.hull ?? 0) - (a.stats?.hull ?? 0)),
    unlocked: false,
  },
  "most-damaged": {
    id: "most-damaged",
    label: "Most Damaged Friendly",
    sort: (targets) =>
      targets.sort((a, b) => {
        const aHull = a.stats?.hull ?? a.systems?.hull ?? 1;
        const aMax = a.stats?.hullMax ?? a.systems?.hullMax ?? 1;
        const bHull = b.stats?.hull ?? b.systems?.hull ?? 1;
        const bMax = b.stats?.hullMax ?? b.systems?.hullMax ?? 1;
        return (aHull / aMax) - (bHull / bMax);
      }),
    unlocked: true,
  },
};

/**
 * Action types — what the drone does at its target.
 */
export const ACTION_TYPES = {
  mine: {
    id: "mine",
    label: "Mine",
    targetFilter: "deposits",
    execute: (drone, target, dt) => {
      if (!target || target.amount <= 0) return;
      const rate = drone.stats.miningRate ?? 0;
      const mined = Math.min(rate * dt, target.amount);
      const space = (drone.stats.cargoCapacity ?? 0) - drone.cargo;
      const actual = Math.min(mined, space);
      drone.cargo += actual;
      target.amount -= actual;
      // Track what we're mining for offload
      if (target.resourceType) drone._lastMinedType = target.resourceType;
    },
    unlocked: true,
  },
  loot: {
    id: "loot",
    label: "Loot",
    targetFilter: "lootables",
    execute: (drone, target, dt) => {
      if (!target || target.amount <= 0) return;
      const rate = 3 * dt; // base loot rate
      const space = (drone.stats.cargoCapacity ?? 0) - drone.cargo;
      const actual = Math.min(rate, target.amount, space);
      drone.cargo += actual;
      target.amount -= actual;
    },
    unlocked: true,
  },
  attack: {
    id: "attack",
    label: "Attack",
    targetFilter: "enemies",
    execute: (drone, target, dt) => {
      if (!target) return;
      const dmg = (drone.stats.damage ?? 0) * dt;
      target.stats.hull = Math.max(0, target.stats.hull - dmg);
    },
    unlocked: true,
  },
  repair: {
    id: "repair",
    label: "Repair",
    targetFilter: "friendlies",
    execute: (drone, target, dt) => {
      if (!target) return;
      const rate = drone.stats.repairRate ?? 0;

      // Mothership uses .systems instead of .stats
      if (target.systems) {
        // Repair hull first, then shields
        if (target.systems.hull < target.systems.hullMax) {
          target.systems.hull = Math.min(target.systems.hullMax, target.systems.hull + rate * dt);
        } else if (target.systems.shields < target.systems.shieldsMax) {
          target.systems.shields = Math.min(target.systems.shieldsMax, target.systems.shields + rate * dt * 0.5);
        }
      } else if (target.stats) {
        // Drone — repair hull first, then shields
        if (target.stats.hull < target.stats.hullMax) {
          target.stats.hull = Math.min(target.stats.hullMax, target.stats.hull + rate * dt);
        } else if (target.stats.shields !== undefined && target.stats.shields < target.stats.shieldsMax) {
          target.stats.shields = Math.min(target.stats.shieldsMax, target.stats.shields + rate * dt * 0.5);
        }
      }
    },
    unlocked: true,
  },
  escort: {
    id: "escort",
    label: "Escort",
    targetFilter: "friendlies",
    execute: () => {}, // presence-based — just stay near the target
    unlocked: true,
  },
  patrol: {
    id: "patrol",
    label: "Patrol",
    targetFilter: null, // no target needed — patrol around anchor
    execute: () => {},
    unlocked: true,
  },
  intercept: {
    id: "intercept",
    label: "Intercept Projectile",
    targetFilter: "projectiles",
    execute: (drone, target) => {
      if (!target) return;
      // Sacrifice: destroy projectile and self
      target.destroyed = true;
      drone.stats.hull = 0;
      drone.state = "destroyed";
    },
    unlocked: false,
  },
};

/**
 * Retreat conditions — when the drone disengages.
 */
export const RETREAT_TYPES = {
  "cargo-full": {
    id: "cargo-full",
    label: "Cargo Full",
    check: (drone) => drone.cargo >= (drone.stats.cargoCapacity ?? Infinity),
    unlocked: true,
  },
  "health-low": {
    id: "health-low",
    label: "Health Below 30%",
    check: (drone) => drone.stats.hull / drone.stats.hullMax < 0.3,
    unlocked: true,
  },
  "health-critical": {
    id: "health-critical",
    label: "Health Below 15%",
    check: (drone) => drone.stats.hull / drone.stats.hullMax < 0.15,
    unlocked: false,
  },
  damaged: {
    id: "damaged",
    label: "Damaged — Return for Repair",
    // Triggers below 50% hull, or below 25% shields for shield-equipped drones.
    // Distinct from health-low because fleet-manager uses this reason to
    // route the drone into the mothership's RepairBay rather than just
    // offloading cargo and redeploying.
    check: (drone) => {
      const hullFrac = drone.stats.hull / drone.stats.hullMax;
      if (hullFrac < 0.5) return true;
      if (drone.stats.shieldsMax > 0) {
        const shieldFrac = drone.stats.shields / drone.stats.shieldsMax;
        if (shieldFrac < 0.25) return true;
      }
      return false;
    },
    unlocked: false, // gated by "repair-bay-unlock" research
  },
  never: {
    id: "never",
    label: "Never Retreat",
    check: () => false,
    unlocked: false,
  },
  "mothership-recall": {
    id: "mothership-recall",
    label: "On Recall Signal",
    check: (drone, ctx) => ctx.recallActive === true,
    unlocked: true,
  },
};

// ─── Routine Evaluation ────────────────────────────────────────

/**
 * Evaluate routine for a single drone and return the desired action.
 *
 * @param {object} drone
 * @param {object} routine — { anchor, range, priority, action, retreat }
 * @param {object} anchorPos — resolved anchor world position
 * @param {object} ctx — game context { deposits, enemies, friendlies, projectiles, mothershipPos, recallActive }
 * @returns {{ type: string, target: object|null, retreating: boolean }}
 */
export function evaluateRoutine(drone, routine, anchorPos, ctx) {
  if (!isDroneAlive(drone)) return { type: "none", target: null, retreating: false };

  // 1. Check RETREAT
  const retreatDef = RETREAT_TYPES[routine.retreat] ?? RETREAT_TYPES["health-low"];
  if (retreatDef.check(drone, ctx)) {
    return { type: "retreat", target: null, retreating: true, reason: retreatDef.id };
  }

  // 2. ANCHOR already resolved (passed as anchorPos)

  // 3. Find targets within RANGE
  const actionDef = ACTION_TYPES[routine.action] ?? ACTION_TYPES.patrol;
  const range = routine.range ?? 200;
  let targets = [];

  if (actionDef.targetFilter && ctx[actionDef.targetFilter]) {
    targets = ctx[actionDef.targetFilter].filter((t) => {
      // Dead check — handle both drone (.stats) and mothership (.systems)
      const hull = t.stats?.hull ?? t.systems?.hull;
      const hullMax = t.stats?.hullMax ?? t.systems?.hullMax;
      if (hull !== undefined && hull <= 0) return false;
      if (t.amount !== undefined && t.amount <= 0) return false;

      // For repair action: skip fully healed targets and skip self
      if (routine.action === "repair") {
        const shields = t.stats?.shields ?? t.systems?.shields ?? 0;
        const shieldsMax = t.stats?.shieldsMax ?? t.systems?.shieldsMax ?? 0;
        if (hull >= hullMax && shields >= shieldsMax) return false;
        if (t.id === drone.id) return false; // don't repair yourself
      }

      return dist3(t.position, anchorPos) <= range;
    });
  }

  // 4. Sort by PRIORITY
  if (targets.length > 0) {
    const priorityDef = PRIORITY_TYPES[routine.priority] ?? PRIORITY_TYPES.nearest;
    priorityDef.sort(targets, drone.position);
  }

  // 5. Return best target + action
  const bestTarget = targets.length > 0 ? targets[0] : null;
  return {
    type: routine.action,
    target: bestTarget,
    retreating: false,
  };
}

/**
 * Resolve anchor position for a swarm.
 * @param {object} routine
 * @param {object} swarm
 * @param {object} ctx
 * @returns {{ x, y, z }}
 */
export function resolveAnchor(routine, swarm, ctx) {
  const anchorDef = ANCHOR_TYPES[routine.anchor] ?? ANCHOR_TYPES["follow-mothership"];
  return anchorDef.resolve(ctx, swarm);
}

// ─── Helpers ───────────────────────────────────────────────────

function dist3(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function findNearest(pos, items) {
  if (!items || items.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const item of items) {
    const d = dist3(pos, item.position);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

/**
 * Get all unlocked rule values for a given rule category.
 */
export function getUnlockedValues(ruleType) {
  const maps = {
    anchor: ANCHOR_TYPES,
    priority: PRIORITY_TYPES,
    action: ACTION_TYPES,
    retreat: RETREAT_TYPES,
  };
  const map = maps[ruleType];
  if (!map) return [];
  return Object.values(map).filter((v) => v.unlocked);
}
