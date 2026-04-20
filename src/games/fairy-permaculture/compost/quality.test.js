/**
 * quality.js tests — star math, bias reporting, caps.
 */

import { describe, it, expect } from "vitest";
import { computeQuality, createQualityTracker } from "./quality.js";

function perfectTracker() {
  return {
    hotDays: 30,
    cnInBandDays: 30,            // 100% in band
    moistureInBandDays: 30,      // 100% in band
    turnsTotal: 4,               // balanced
    inoculantIds: ["forest-duff-imo", "finished-compost-seed", "worm-castings"], // 3 = +1
    curingCompleted: true,
    earlyHarvested: false,
    ammoniaFlag: false,
    anaerobicFlag: false,
  };
}

describe("createQualityTracker", () => {
  it("returns zeroed counters", () => {
    const q = createQualityTracker();
    expect(q.hotDays).toBe(0);
    expect(q.cnInBandDays).toBe(0);
    expect(q.inoculantIds).toEqual([]);
    expect(q.curingCompleted).toBe(false);
    expect(q.anaerobicFlag).toBe(false);
  });
});

describe("computeQuality — perfect pile", () => {
  it("awards Q5 when all criteria met", () => {
    const r = computeQuality(perfectTracker());
    expect(r.stars).toBe(5);
    expect(r.bias).toBe("balanced");
    expect(r.flags).toEqual([]);
  });
});

describe("computeQuality — bias", () => {
  it("0 turns → fungal bias", () => {
    const t = perfectTracker();
    t.turnsTotal = 0;
    expect(computeQuality(t).bias).toBe("fungal");
  });

  it("1 turn → fungal bias", () => {
    const t = perfectTracker();
    t.turnsTotal = 1;
    expect(computeQuality(t).bias).toBe("fungal");
  });

  it("3-6 turns → balanced bias", () => {
    const t = perfectTracker();
    t.turnsTotal = 5;
    expect(computeQuality(t).bias).toBe("balanced");
  });

  it("7+ turns → bacterial bias", () => {
    const t = perfectTracker();
    t.turnsTotal = 9;
    expect(computeQuality(t).bias).toBe("bacterial");
  });

  it("skipped turns still reach Q5 via other dimensions (bias reports fungal)", () => {
    const t = perfectTracker();
    t.turnsTotal = 0;      // no turn bonus
    const r = computeQuality(t);
    expect(r.bias).toBe("fungal");
    // base 1 + CN + moisture + curing + inoculants = 5 (turn skipped).
    expect(r.stars).toBe(5);
  });
});

describe("computeQuality — caps", () => {
  it("anaerobic flag caps at Q1 even if everything else is perfect", () => {
    const t = perfectTracker();
    t.anaerobicFlag = true;
    const r = computeQuality(t);
    expect(r.stars).toBe(1);
    expect(r.flags).toContain("anaerobic-capped");
  });

  it("ammonia flag caps at Q3", () => {
    const t = perfectTracker();
    t.ammoniaFlag = true;
    const r = computeQuality(t);
    expect(r.stars).toBe(3);
    expect(r.flags).toContain("ammonia-capped");
  });

  it("early harvest caps at Q3", () => {
    const t = perfectTracker();
    t.earlyHarvested = true;
    const r = computeQuality(t);
    expect(r.stars).toBe(3);
    expect(r.flags).toContain("early-harvest-capped");
  });

  it("floor is always at least Q1", () => {
    const t = createQualityTracker(); // all zero
    expect(computeQuality(t).stars).toBe(1);
  });

  it("handles inoculantIds as a Set", () => {
    const t = perfectTracker();
    t.inoculantIds = new Set(t.inoculantIds);
    expect(computeQuality(t).stars).toBe(5);
  });
});

describe("computeQuality — anaerobic Q1 pile regression", () => {
  it("wet / anaerobic pile can only reach Q1", () => {
    const t = {
      hotDays: 10,
      cnInBandDays: 2,      // poor
      moistureInBandDays: 0, // was too wet
      turnsTotal: 0,
      inoculantIds: [],
      curingCompleted: false,
      earlyHarvested: false,
      ammoniaFlag: false,
      anaerobicFlag: true,
    };
    const r = computeQuality(t);
    expect(r.stars).toBe(1);
    expect(r.flags).toContain("anaerobic-capped");
  });
});

describe("computeQuality — partial credit", () => {
  it("good CN + good moisture but no turns and no curing → Q3", () => {
    const t = {
      hotDays: 20,
      cnInBandDays: 18,       // 90%
      moistureInBandDays: 16, // 80%
      turnsTotal: 0,
      inoculantIds: [],
      curingCompleted: false,
      earlyHarvested: false,
      ammoniaFlag: false,
      anaerobicFlag: false,
    };
    const r = computeQuality(t);
    // base 1 + CN + moisture = 3.
    expect(r.stars).toBe(3);
    expect(r.bias).toBe("fungal");
  });

  it("hotDays=0 protection: doesn't divide by zero", () => {
    const t = createQualityTracker();
    t.hotDays = 0;
    t.cnInBandDays = 0;
    const r = computeQuality(t);
    expect(Number.isFinite(r.stars)).toBe(true);
  });
});
