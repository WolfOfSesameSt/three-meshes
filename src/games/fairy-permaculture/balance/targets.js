/**
 * Fairy Permaculture — target-curve comparison.
 *
 * Given a Run record, compare its fairy_count / biomass / yearly-yield
 * samples against `balance.json → target_curves`. Report deviations and
 * flags (stall / runaway / dead-branch).
 *
 * Return shape:
 *   {
 *     pass: boolean,
 *     tolerance: number,      // from balance.json
 *     deviations: [
 *       { metric, at, value, band: [lo, hi], delta, status }
 *     ],
 *     flags: {
 *       stall:      [{ startDay, endDay, len }...],
 *       runaway:    [{ startDay, endDay, from, to }...],
 *       deadBranch: ['branch-d', ...],
 *     },
 *   }
 */

import balanceJson from "../data/balance.json" with { type: "json" };

/** Parse keys like "day_30" → integer day index. */
function parseDayKey(k) {
  const m = /^day_(\d+)$/.exec(k);
  return m ? Number(m[1]) - 1 : null;
}

/** Parse "year_N" → integer year index (0-based). */
function parseYearKey(k) {
  const m = /^year_(\d+)$/.exec(k);
  return m ? Number(m[1]) - 1 : null;
}

export function compareToTargets(run, { balance = balanceJson, tolerance = null } = {}) {
  const tol = tolerance ?? balance.simulator_tolerance ?? 0.15;
  const tc = balance.target_curves ?? {};
  const deviations = [];
  const dayCount = run.days;

  // fairy_count bands
  if (tc.fairy_count) {
    for (const [key, band] of Object.entries(tc.fairy_count)) {
      const d = parseDayKey(key);
      if (d === null || d >= dayCount) continue;
      const value = run.rec.fairyCount[d];
      const devi = checkBand(value, band, tol);
      deviations.push({
        metric: "fairy_count",
        at: key,
        day: d,
        value,
        band,
        ...devi,
      });
    }
  }

  // biomass_stock_kg
  if (tc.biomass_stock_kg) {
    for (const [key, band] of Object.entries(tc.biomass_stock_kg)) {
      const d = parseDayKey(key);
      if (d === null || d >= dayCount) continue;
      const value = run.rec.biomassStock[d];
      const devi = checkBand(value, band, tol);
      deviations.push({
        metric: "biomass_stock_kg",
        at: key,
        day: d,
        value,
        band,
        ...devi,
      });
    }
  }

  // yearly_output_fairy_food_units
  if (tc.yearly_output_fairy_food_units) {
    for (const [key, band] of Object.entries(tc.yearly_output_fairy_food_units)) {
      const y = parseYearKey(key);
      if (y === null || y >= run.yearlyYield.length) continue;
      const value = run.yearlyYield[y];
      const devi = checkBand(value, band, tol);
      deviations.push({
        metric: "yearly_output_fairy_food_units",
        at: key,
        year: y,
        value,
        band,
        ...devi,
      });
    }
  }

  // Dead-branch flag — non-root/non-climax branches that got 0 investment.
  const deadBranch = [];
  for (const branchId of Object.keys(run.branchInvestment)) {
    if (branchId === "root" || branchId === "climax") continue;
    if (!run.branchInvestment[branchId] || run.branchInvestment[branchId] < 1) {
      deadBranch.push(branchId);
    }
  }

  const flags = {
    stall: run.stallEvents.filter(s => s.len >= 7),
    runaway: run.runawayEvents,
    deadBranch,
  };

  const pass = deviations.every(d => d.status === "ok") && flags.stall.length === 0;
  return { pass, tolerance: tol, deviations, flags };
}

/**
 * Check a value against a [lo, hi] band with slack `tolerance`.
 * delta is "how far out of band, in band-width units" (0 if inside).
 */
function checkBand(value, band, tolerance) {
  const [lo, hi] = band;
  const width = Math.max(1, hi - lo);
  const slack = width * tolerance;
  const loSlack = lo - slack;
  const hiSlack = hi + slack;

  if (value >= lo && value <= hi) {
    return { delta: 0, status: "ok" };
  }
  if (value >= loSlack && value <= hiSlack) {
    const delta = value < lo ? (lo - value) / width : (value - hi) / width;
    return { delta, status: "warn" };
  }
  const delta = value < lo ? (lo - value) / width : (value - hi) / width;
  return { delta, status: "fail" };
}

/**
 * Short human-readable summary string.
 */
export function summarize(result) {
  const lines = [];
  lines.push(`pass=${result.pass} tolerance=${result.tolerance}`);
  for (const d of result.deviations) {
    const v = typeof d.value === "number" ? d.value.toFixed(1) : d.value;
    const status = d.status === "ok" ? "ok  " : d.status === "warn" ? "warn" : "FAIL";
    lines.push(`  ${status} ${d.metric}@${d.at}: ${v} vs [${d.band.join(", ")}] Δ=${d.delta.toFixed(2)}`);
  }
  lines.push(`  stall events: ${result.flags.stall.length}`);
  lines.push(`  runaway events: ${result.flags.runaway.length}`);
  lines.push(`  dead branches: ${result.flags.deadBranch.join(", ") || "none"}`);
  return lines.join("\n");
}
