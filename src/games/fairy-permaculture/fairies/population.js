/**
 * Fairy Permaculture — population system.
 *
 * Spawns new fairies when accumulated fairy-food crosses the
 * per-fairy threshold. MVP caps at 25; full game at 100. The
 * accumulated total is spent evenly across the three foods so no
 * single food can monopolize pop growth.
 *
 * A spawn is a marquee moment — the caller's `onSpawn` callback is
 * where the juice system hooks in.
 */

import { add, spend, snapshot, total, onChange } from "./fairy-food.js";

const DEFAULT_NAMES = [
  "Willow", "Mossflower", "Sable", "Pippin", "Bramble", "Sorrel", "Hazel",
  "Tansy", "Larkspur", "Meadow", "Clover", "Thistle", "Yarrow", "Saffron",
  "Linden", "Rowan", "Heather", "Fennel", "Juniper", "Iris", "Sage",
  "Aster", "Poppy", "Alder", "Violet", "Lilac", "Vervain", "Primrose",
  "Cedar", "Amber", "Briar", "Ember", "Dew", "Whisper",
];

export function createPopulation({
  initial = 1,
  cap = 25,
  costPerFairy = 2,
  balance,
  rng = Math.random,
  onSpawn = () => {},
} = {}) {
  // Honor balance.json values if provided.
  if (balance?.fairy_pop_curve) {
    cap = balance.fairy_pop_curve.mvp_pop_cap ?? cap;
    costPerFairy = balance.fairy_pop_curve.food_unit_cost_per_fairy ?? costPerFairy;
  }

  const state = {
    count: initial,
    cap,
    costPerFairy,
    named: [],
    unusedNames: shuffle([...DEFAULT_NAMES], rng),
  };

  // Seed the first fairy's name.
  state.named.push(takeName(state));

  function takeName(s) {
    if (s.unusedNames.length === 0) {
      // Ran out — generate a fallback (shouldn't hit this before cap)
      return `Fairy${s.count + 1}`;
    }
    return s.unusedNames.pop();
  }

  function trySpawn() {
    if (state.count >= state.cap) return false;
    // MVP rule: any fairy-food can spawn a fairy, but the cost scales
    // inversely with diversity. 1 food flowing → 2× cost (grind).
    // 2 foods → 1.5×. All 3 foods → 1.0× (the snowball sweet spot).
    // This keeps early progress possible with just fruit while still
    // rewarding the GDD's "invest in all three branches" design.
    const s = snapshot();
    const diversity = (s.honey > 0 ? 1 : 0) + (s.milk > 0 ? 1 : 0) + (s.fruit > 0 ? 1 : 0);
    if (diversity === 0) return false;
    const mult = diversity === 3 ? 1.0 : diversity === 2 ? 1.5 : 2.0;
    const need = state.costPerFairy * mult;

    // Spend `need` units total, drawn proportionally from available stocks.
    const available = s.honey + s.milk + s.fruit;
    if (available < need) return false;

    const hShare = need * (s.honey / available);
    const mShare = need * (s.milk / available);
    const fShare = need * (s.fruit / available);
    spend("honey", hShare);
    spend("milk", mShare);
    spend("fruit", fShare);

    state.count += 1;
    const name = takeName(state);
    state.named.push(name);
    onSpawn({ count: state.count, name });
    return true;
  }

  // Re-check on every food addition.
  const unsub = onChange(() => {
    // Try a couple of times in case a single big harvest crosses two thresholds.
    for (let i = 0; i < 3; i++) {
      if (!trySpawn()) break;
    }
  });

  return {
    get count() { return state.count; },
    get cap() { return state.cap; },
    get named() { return [...state.named]; },
    trySpawn,
    dispose: unsub,
    serialize() {
      return {
        count: state.count,
        cap: state.cap,
        costPerFairy: state.costPerFairy,
        named: [...state.named],
        unusedNames: [...state.unusedNames],
      };
    },
    hydrate(saved) {
      state.count = saved.count;
      state.cap = saved.cap;
      state.costPerFairy = saved.costPerFairy;
      state.named = [...saved.named];
      state.unusedNames = [...saved.unusedNames];
    },
  };
}

function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Add to fairy-food (thin re-export so callers need only one module). */
export { add as addFairyFood };
