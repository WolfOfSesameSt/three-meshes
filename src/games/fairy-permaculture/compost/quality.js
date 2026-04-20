/**
 * Fairy Permaculture — Final compost quality stars (1-5).
 *
 * Quality is earned on the way, not at the end — every tick of the
 * pile simulation feeds forward-accumulating counters on the pile:
 *
 *   cnInBandDays        — ticks where C:N ∈ [20, 40]
 *   moistureInBandDays  — ticks where moisture ∈ [50%, 65%]
 *   turnsTotal          — number of successful TURN_WINDOW → HOT turns
 *   inoculantIds        — Set of distinct inoculant ids added
 *   curingCompleted     — true if the pile spent the full curing period
 *   hotDays             — ticks actually spent in HOT state (denominator
 *                         for the "in band" ratios)
 *   ammoniaFlag         — ever entered the ammonia-loss state
 *   anaerobicFlag       — ever entered the anaerobic state
 *   earlyHarvested      — harvested before curing finished
 *
 * Stars are earned like this (cumulative, capped at 5):
 *   base: 1 star (always earned for finishing)
 *   + 1 if CN-in-band ratio ≥ 0.7
 *   + 1 if moisture-in-band ratio ≥ 0.7
 *   + 1 if 3 ≤ turnsTotal ≤ 6 (balanced)
 *   + 1 if curing completed
 *   + 1 if 3+ distinct inoculants present
 *
 * Caps:
 *   anaerobicFlag       → max 1 (per plan: "anaerobic caps Q1")
 *   ammoniaFlag         → max 3 (partial N loss)
 *   earlyHarvested      → max 3 (per plan: "early harvest caps at Q3")
 *
 * Bias (not a star, but reported):
 *   turnsTotal 0-1  → "fungal"
 *   turnsTotal 2-6  → "balanced"
 *   turnsTotal 7+   → "bacterial"
 */

/**
 * @param {object} pile  A pile record with tracked metrics (see above).
 * @returns {{ stars: number, bias: 'fungal'|'balanced'|'bacterial', flags: string[] }}
 */
export function computeQuality(pile) {
  const hotDays = Math.max(1, pile.hotDays || 0); // avoid div-by-zero
  const cnRatio = (pile.cnInBandDays || 0) / hotDays;
  const moistureRatio = (pile.moistureInBandDays || 0) / hotDays;

  let stars = 1; // "finished means at least Q1"

  if (cnRatio >= 0.7) stars += 1;
  if (moistureRatio >= 0.7) stars += 1;

  const turns = pile.turnsTotal || 0;
  if (turns >= 3 && turns <= 6) stars += 1;

  if (pile.curingCompleted) stars += 1;

  const inoculantCount = pile.inoculantIds
    ? (pile.inoculantIds instanceof Set
        ? pile.inoculantIds.size
        : pile.inoculantIds.length)
    : 0;
  if (inoculantCount >= 3) stars += 1;

  stars = Math.min(5, stars);

  const flags = [];
  if (pile.anaerobicFlag) {
    stars = Math.min(stars, 1);
    flags.push("anaerobic-capped");
  }
  if (pile.ammoniaFlag) {
    stars = Math.min(stars, 3);
    flags.push("ammonia-capped");
  }
  if (pile.earlyHarvested) {
    stars = Math.min(stars, 3);
    flags.push("early-harvest-capped");
  }

  // Floor at 1 (anything that reached "finished" earned at least one star).
  stars = Math.max(1, stars);

  let bias;
  if (turns <= 1) bias = "fungal";
  else if (turns <= 6) bias = "balanced";
  else bias = "bacterial";

  return { stars, bias, flags };
}

/**
 * Helper: initialise the quality-tracking counters on a new pile.
 * Called from pile.js on construction.
 */
export function createQualityTracker() {
  return {
    cnInBandDays: 0,
    moistureInBandDays: 0,
    hotDays: 0,
    turnsTotal: 0,
    inoculantIds: [],        // simple array; we de-dupe on add
    curingCompleted: false,
    earlyHarvested: false,
    ammoniaFlag: false,
    anaerobicFlag: false,
  };
}
