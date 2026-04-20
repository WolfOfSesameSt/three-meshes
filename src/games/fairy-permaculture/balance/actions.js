/**
 * Fairy Permaculture — abstract action catalog for the headless sim.
 *
 * These are NOT the full-fidelity game actions. Each action is a
 * pure-data entry with:
 *   - id          — action name
 *   - duration    — days consumed before the next action is picked
 *   - requires    — state predicate (or null for always-available)
 *   - apply(state, rng) — in-place state mutation when the action fires
 *
 * The simulator samples one action per day from the selected profile;
 * most actions take 1 day, a few (dig-swale, unlock-node) take several.
 * The goal is a plausible progression curve at ~5 s per 3-year run.
 */

import { isUnlocked, unlockNode, getNode, prereqsSatisfied, seasonNameForDay } from "./sim-state.js";

// Productive nodes → fairy-food unit yield per day once unlocked.
// These numbers land the `typical` curve roughly inside the target
// bands; the balance-coordinator tunes them.
const DAILY_YIELD_BY_PRODUCT = {
  HONEY: 1.2,
  MILK:  1.5,
  FRUIT: 1.0,
};

// Seasonal multiplier on production. Winter produces nothing.
const SEASONAL_YIELD = { spring: 1.0, summer: 1.2, autumn: 0.8, winter: 0.0 };

/**
 * Registry — keyed by id so a profile can ask for it directly.
 */
export const ACTIONS = {
  /** Place a compost pile. Prereq: r1 unlocked. */
  "place-pile": {
    id: "place-pile",
    duration: 1,
    apply(state) {
      state.biomass += 5;          // seeds the pile with initial browns
      touchBranch(state, "root", 0.5);
      state.compostSites = (state.compostSites ?? 0) + 1;
    },
  },

  /** Harvest wild biomass to fuel piles. */
  "harvest-biomass": {
    id: "harvest-biomass",
    duration: 1,
    apply(state, rng) {
      // yield depends on season + current soil fertility
      const season = seasonNameForDay(state.day);
      const mult = season === "winter" ? 0.3 : 1.0;
      const gain = (8 + rng() * 6) * mult * fairyEffectiveness(state);
      state.biomass += gain;
      state.standingBiomass += gain * 0.5;
    },
  },

  /** Turn a pile — converts biomass → compost over time. */
  "turn-pile": {
    id: "turn-pile",
    duration: 1,
    apply(state) {
      if (state.biomass <= 0) return;
      const converted = Math.min(state.biomass, 3 + (state.compostSites ?? 0));
      state.biomass -= converted;
      // compost "matures" but is represented as a direct stock increase
      state.compost += converted * 0.4;
    },
  },

  /** Harvest finished compost — spreads it conceptually. */
  "harvest-compost": {
    id: "harvest-compost",
    duration: 1,
    apply(state) {
      // Just accrues; apply-compost will actually raise soil OM.
    },
  },

  /** Apply compost to soil, raising avg OM + moisture. */
  "apply-compost": {
    id: "apply-compost",
    duration: 1,
    apply(state) {
      if (state.compost <= 0) return;
      const m3 = Math.min(state.compost, 2.0);
      state.compost -= m3;
      // OM rises; stay under 12 % (soft cap for the scalar model)
      state.soilOm = Math.min(12, state.soilOm + m3 * 0.12);
      state.soilMoisture = Math.min(100, state.soilMoisture + m3 * 2);
      state.standingBiomass += m3 * 6; // plants lock in extra biomass
    },
  },

  /** Plant pioneer cover. Needs r2. */
  "plant-pioneer": {
    id: "plant-pioneer",
    duration: 1,
    apply(state) {
      state.standingBiomass += 12 * fairyEffectiveness(state);
      state.soilMoisture = Math.min(100, state.soilMoisture + 1.0);
    },
  },

  /** Plant a berry patch (branch-b product enabler). */
  "plant-berry": {
    id: "plant-berry",
    duration: 1,
    apply(state) {
      state.standingBiomass += 20 * fairyEffectiveness(state);
    },
  },

  "harvest-fruit": {
    id: "harvest-fruit",
    duration: 1,
    requires: (state) => isUnlocked(state, "b1"),
    apply(state) {
      const season = seasonNameForDay(state.day);
      const mult = SEASONAL_YIELD[season] ?? 1;
      const gain = DAILY_YIELD_BY_PRODUCT.FRUIT * mult * fairyEffectiveness(state) * 2;
      state.fruit += gain;
      state.dailyYieldUnits += gain;
    },
  },

  "place-hive": {
    id: "place-hive",
    duration: 1,
    apply(state) {
      state.standingBiomass += 2;
    },
  },

  "harvest-honey": {
    id: "harvest-honey",
    duration: 1,
    requires: (state) => isUnlocked(state, "a4"),
    apply(state) {
      const season = seasonNameForDay(state.day);
      const mult = SEASONAL_YIELD[season] ?? 1;
      const gain = DAILY_YIELD_BY_PRODUCT.HONEY * mult * fairyEffectiveness(state) * 2;
      state.honey += gain;
      state.dailyYieldUnits += gain;
    },
  },

  "place-chicken": {
    id: "place-chicken",
    duration: 1,
    apply(state) {
      state.chickens = (state.chickens ?? 0) + 3;
    },
  },

  "gather-eggs": {
    id: "gather-eggs",
    duration: 1,
    requires: (state) => isUnlocked(state, "c1"),
    apply(state) {
      const gain = 0.6 * fairyEffectiveness(state);
      state.fruit += gain * 0.5; // eggs → fruit bucket as stand-in protein
      state.dailyYieldUnits += gain * 0.5;
    },
  },

  "place-goat": {
    id: "place-goat",
    duration: 2,
    apply(state) {
      state.goats = (state.goats ?? 0) + 1;
    },
  },

  "milk-goat": {
    id: "milk-goat",
    duration: 1,
    requires: (state) => isUnlocked(state, "c3"),
    apply(state) {
      const season = seasonNameForDay(state.day);
      const mult = SEASONAL_YIELD[season] ?? 1;
      const gain = DAILY_YIELD_BY_PRODUCT.MILK * mult * fairyEffectiveness(state) * 1.5;
      state.milk += gain;
      state.dailyYieldUnits += gain;
    },
  },

  "dig-swale": {
    id: "dig-swale",
    duration: 3,
    requires: (state) => isUnlocked(state, "r4"),
    apply(state) {
      state.soilMoisture = Math.min(100, state.soilMoisture + 6);
      state.swales = (state.swales ?? 0) + 1;
    },
  },

  "rest": {
    id: "rest",
    duration: 1,
    apply() {
      // no-op; used when no valid action exists
    },
  },
};

/**
 * A parametric "unlock-node" action — returns a bound descriptor.
 * Callers that want to unlock a specific node pass its id.
 */
export function unlockNodeAction(nodeId) {
  return {
    id: `unlock-node(${nodeId})`,
    nodeId,
    duration: 2,
    apply(state) {
      if (!prereqsSatisfied(state, nodeId)) return;
      const idx = state.index.nodeIds.indexOf(nodeId);
      if (idx < 0) return;
      // charge invested-days; once threshold reached, unlock
      state.invested[idx] += 1;
      const node = getNode(state, nodeId);
      touchBranch(state, node.branchId, 1.0);
      const cost = costForNode(node, state);
      if (state.invested[idx] >= cost) {
        unlockNode(state, nodeId);
        // small one-time biomass bump from clearing the site
        state.standingBiomass += 4;
      }
    },
  };
}

/** Cost (in fairy-days) to unlock a node by its kind. */
function costForNode(node, state) {
  switch (node.kind) {
    case "root":
      return 2;
    case "branch":
      return 3;
    case "climax":
      return 8;
    default:
      return 3;
  }
}

/** Record branch investment for dead-branch detection. */
function touchBranch(state, branchId, amount) {
  state.branchInvestment[branchId] = (state.branchInvestment[branchId] ?? 0) + amount;
}

/**
 * Simplified "how much does one action do" multiplier based on how many
 * fairies are alive. Each action is nominally "one fairy-day" but a
 * bigger swarm does more per player-tick.
 */
function fairyEffectiveness(state) {
  return 1 + Math.log2(Math.max(1, state.fairyCount)) * 0.8;
}

export { DAILY_YIELD_BY_PRODUCT, SEASONAL_YIELD, fairyEffectiveness };
