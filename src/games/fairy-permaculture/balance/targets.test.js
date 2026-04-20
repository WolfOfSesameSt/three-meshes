/**
 * Fairy Permaculture — targets.js tests.
 */
import { describe, it, expect } from "vitest";
import { compareToTargets } from "./targets.js";

/** Build a synthetic Run record where the curve stays flat at 5 fairies. */
function flatRun(days, fairyCount = 5) {
  const rec = {
    day: new Uint16Array(days),
    fairyCount: new Uint16Array(days),
    biomassStock: new Float32Array(days),
    compostStock: new Float32Array(days),
    honeyStock: new Float32Array(days),
    milkStock: new Float32Array(days),
    fruitStock: new Float32Array(days),
    soilOm: new Float32Array(days),
    yieldUnits: new Float32Array(days),
    unlockedCount: new Uint16Array(days),
    stallFlag: new Uint8Array(days),
  };
  for (let d = 0; d < days; d++) {
    rec.day[d] = d;
    rec.fairyCount[d] = fairyCount;
    rec.biomassStock[d] = 60; // inside day_30 band
    rec.unlockedCount[d] = 2; // minimal
  }
  return {
    meta: { seed: 0, profile: "fake", biome: "bc-coastal", years: 1 },
    days,
    rec,
    fairyCountFinal: fairyCount,
    unlockedFinal: 2,
    branchInvestment: { root: 5, "branch-a": 0, "branch-b": 0, "branch-c": 0 },
    yearlyYield: [20, 0, 0, 0],
    stallEvents: [{ startDay: 10, endDay: days - 1, len: days - 10 }],
    runawayEvents: [],
    actionLog: [],
    stocksFinal: {},
    index: { nodeIds: [], branchIds: [], unlocked: [] },
  };
}

describe("targets.compareToTargets", () => {
  it("flags a flat-at-5 run as stalled and failing later bands", () => {
    const run = flatRun(365, 5);
    const res = compareToTargets(run);
    // Day 30 band [3, 7] — 5 is inside, should be ok.
    const d30 = res.deviations.find(d => d.metric === "fairy_count" && d.at === "day_30");
    expect(d30.status).toBe("ok");
    // Day 90 band [10, 20] — 5 is below, should be fail.
    const d90 = res.deviations.find(d => d.metric === "fairy_count" && d.at === "day_90");
    expect(d90.status).toBe("fail");
    // Day 180 [30, 50] — definitely fail.
    const d180 = res.deviations.find(d => d.metric === "fairy_count" && d.at === "day_180");
    expect(d180.status).toBe("fail");
    // Overall pass = false, and stall events reported.
    expect(res.pass).toBe(false);
    expect(res.flags.stall.length).toBeGreaterThan(0);
    // Dead branches detected: a, b, c.
    expect(res.flags.deadBranch).toContain("branch-a");
    expect(res.flags.deadBranch).toContain("branch-b");
    expect(res.flags.deadBranch).toContain("branch-c");
  });

  it("reports deviation magnitude > 0 when outside band", () => {
    const run = flatRun(365, 5);
    const res = compareToTargets(run);
    const d180 = res.deviations.find(d => d.metric === "fairy_count" && d.at === "day_180");
    // 5 vs [30, 50] — far below.
    expect(d180.delta).toBeGreaterThan(0.5);
  });
});
