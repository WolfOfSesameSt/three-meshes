/**
 * Fairy Permaculture — player-behavior profiles.
 *
 * Each profile is a function `(state, rng) -> actionDescriptor`. It
 * looks at current sim state and returns the next action to execute.
 *
 * A `actionDescriptor` is either:
 *   - a string key into `ACTIONS`
 *   - an object `{ id, duration, apply }` (e.g. unlockNodeAction(id))
 *
 * Philosophy:
 *   - ideal   — greedy optimal: always unlock next prereq-ready node,
 *               then feed the product line with the highest yield.
 *   - typical — prioritizes R1..R4, then rotates branches A→B→C; a
 *               realistic player with occasional sub-optimal picks.
 *   - naive   — only places piles + harvests biomass; ignores branches
 *               except R1, R2. Sometimes rests.
 *   - chaotic — random eligible action. Stress test.
 */

import { isUnlocked, prereqsSatisfied } from "./sim-state.js";
import { ACTIONS, unlockNodeAction } from "./actions.js";

/** Try to unlock nodes in the given priority list. Returns descriptor or null. */
function nextUnlock(state, priorities) {
  for (const id of priorities) {
    if (!isUnlocked(state, id) && prereqsSatisfied(state, id)) {
      return unlockNodeAction(id);
    }
  }
  return null;
}

/** True iff we've committed ≥ N invested-days on `nodeId` (partial progress). */
function partiallyInvested(state, nodeId, n = 1) {
  const idx = state.index.nodeIds.indexOf(nodeId);
  if (idx < 0) return false;
  return state.invested[idx] >= n;
}

// ─── IDEAL ──────────────────────────────────────────────────────────
// Greedy upper-bound player. Always:
// 1. Continues any in-progress unlock (push to completion)
// 2. Picks the next highest-impact unlock available
// 3. Harvests product if branch has a product
// 4. Otherwise fuels the composter + apply-compost loop
const IDEAL_PRIORITY = [
  "r1", "r2", "r4", "r3",
  "a1", "b1", "c1",
  "a2", "c2", "b2",
  "a3", "c3", "b3",
  "a4", "b4", "b5", "a5", "c4", "b6", "c5",
  "e1", "e2", "e3", "e4",
  "g1", "g3",
  "a6", "c6",
];

export function idealProfile(state, rng) {
  // Ideal interleaves unlocks and harvests at a ~2:1 ratio. Empirically
  // this dominates both a pure-unlock and a pure-harvest policy because
  // fairy-food grows the fairy count, which multiplies all subsequent
  // work, but unlocks grow the ceiling. Both matter.
  state._idealPhase = (state._idealPhase ?? 0) + 1;

  // Always finish an in-progress unlock — avoid wasted invested days.
  for (const id of IDEAL_PRIORITY) {
    if (!isUnlocked(state, id) && partiallyInvested(state, id, 1) && prereqsSatisfied(state, id)) {
      return unlockNodeAction(id);
    }
  }

  // Every third action goes to harvest if any product is online.
  const anyProduct = isUnlocked(state, "a4") || isUnlocked(state, "c3") ||
                     isUnlocked(state, "b1") || isUnlocked(state, "c1");
  if (anyProduct && state._idealPhase % 3 === 0) {
    if (isUnlocked(state, "a4")) return "harvest-honey";
    if (isUnlocked(state, "c3")) return "milk-goat";
    if (isUnlocked(state, "b1")) return "harvest-fruit";
    if (isUnlocked(state, "c1")) return "gather-eggs";
  }

  // Otherwise push the next unlock.
  const nu = nextUnlock(state, IDEAL_PRIORITY);
  if (nu) return nu;

  // Fully unlocked — keep harvesting + composting.
  if (isUnlocked(state, "a4")) return "harvest-honey";
  if (isUnlocked(state, "c3")) return "milk-goat";
  if (isUnlocked(state, "b1")) return "harvest-fruit";
  if (state.compost >= 1 && state.biomass < 20) return "apply-compost";
  if (state.biomass >= 6) return "turn-pile";
  return "harvest-biomass";
}

// ─── TYPICAL ─────────────────────────────────────────────────────────
// Realistic player: does R1..R4 first in roughly sane order, rotates A/B/C,
// harvests when products are unlocked, occasionally spends a turn on
// housekeeping (compost/biomass).
const TYPICAL_PRIORITY = [
  "r1", "r2", "r4",
  "b1",             // berries are the easy first branch
  "a1", "c1",
  "r3",
  "a2", "b2", "c2",
  "a3", "b3", "c3",
  "a4", "b4", "c4",
  "b5", "a5", "c5",
  "g1", "e1",
];

export function typicalProfile(state, rng) {
  // Finish in-progress unlock
  for (const id of TYPICAL_PRIORITY) {
    if (!isUnlocked(state, id) && partiallyInvested(state, id, 1) && prereqsSatisfied(state, id)) {
      return unlockNodeAction(id);
    }
  }

  // Housekeeping on ~25 % of turns — occasional compost/biomass burst
  const roll = rng();
  if (roll < 0.12 && state.biomass >= 8) return "turn-pile";
  if (roll < 0.20 && state.compost >= 1) return "apply-compost";
  if (roll < 0.32) return "harvest-biomass";

  // Harvest ripe products in rotation to diversify fairy-food
  if (roll < 0.55) {
    const candidates = [];
    if (isUnlocked(state, "a4")) candidates.push("harvest-honey");
    if (isUnlocked(state, "c3")) candidates.push("milk-goat");
    if (isUnlocked(state, "b1")) candidates.push("harvest-fruit");
    if (isUnlocked(state, "c1")) candidates.push("gather-eggs");
    if (candidates.length > 0) {
      return candidates[Math.floor(rng() * candidates.length)];
    }
  }

  const nu = nextUnlock(state, TYPICAL_PRIORITY);
  if (nu) return nu;

  // Default: keep the compost flywheel going.
  if (state.biomass >= 6) return "turn-pile";
  return "harvest-biomass";
}

// ─── NAIVE ───────────────────────────────────────────────────────────
// "Lost" player — only does visible actions, basically hoards biomass
// and never touches branch-a/b/c. Still progresses R1/R2.
export function naiveProfile(state, rng) {
  // Will eventually stumble onto r1/r2 unlocks.
  const nu = nextUnlock(state, ["r1", "r2"]);
  if (nu) return nu;

  const roll = rng();
  if (roll < 0.08) return "rest";
  if (roll < 0.3 && state.compost >= 1) return "apply-compost";
  if (roll < 0.5 && state.biomass >= 10) return "turn-pile";
  if (roll < 0.6 && isUnlocked(state, "b1")) return "harvest-fruit";
  return "harvest-biomass";
}

// ─── CHAOTIC ─────────────────────────────────────────────────────────
// Random valid action every day. Stress test for degenerate paths.
const CHAOTIC_POOL_BASE = [
  "place-pile",
  "harvest-biomass",
  "turn-pile",
  "harvest-compost",
  "apply-compost",
  "plant-pioneer",
  "rest",
];

export function chaoticProfile(state, rng) {
  // 30 % of the time, try to unlock a random prereq-ready node.
  if (rng() < 0.30) {
    const unlockable = [];
    for (const id of state.index.nodeIds) {
      if (!isUnlocked(state, id) && prereqsSatisfied(state, id)) {
        unlockable.push(id);
      }
    }
    if (unlockable.length > 0) {
      return unlockNodeAction(unlockable[Math.floor(rng() * unlockable.length)]);
    }
  }

  // Otherwise random mechanical action.
  const pool = [...CHAOTIC_POOL_BASE];
  if (isUnlocked(state, "b1")) pool.push("harvest-fruit", "plant-berry");
  if (isUnlocked(state, "a4")) pool.push("harvest-honey");
  if (isUnlocked(state, "c1")) pool.push("gather-eggs", "place-chicken");
  if (isUnlocked(state, "c3")) pool.push("milk-goat", "place-goat");
  if (isUnlocked(state, "r4")) pool.push("dig-swale");
  return pool[Math.floor(rng() * pool.length)];
}

/** Registry. */
export const PROFILES = {
  ideal: idealProfile,
  typical: typicalProfile,
  naive: naiveProfile,
  chaotic: chaoticProfile,
};

/** Resolve a descriptor to { id, duration, apply }. */
export function resolveAction(d) {
  if (!d) return ACTIONS.rest;
  if (typeof d === "string") {
    return ACTIONS[d] ?? ACTIONS.rest;
  }
  return d;
}
