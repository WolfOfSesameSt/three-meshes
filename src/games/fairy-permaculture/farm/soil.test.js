import { describe, it, expect } from "vitest";
import {
  createSoilField,
  initializeFromOmField,
  getTile,
  applyCompost,
  tickSoil,
  totalOm,
  totalNutrients,
} from "./soil.js";

function makeField(mapTiles, omValue = 1.5) {
  const f = createSoilField(mapTiles);
  const om = new Float32Array(mapTiles * mapTiles);
  om.fill(omValue);
  initializeFromOmField(f, om);
  return f;
}

describe("SoilField basics", () => {
  it("creates typed arrays sized mapTiles²", () => {
    const f = createSoilField(10);
    expect(f.om.length).toBe(100);
    expect(f.nAvail.length).toBe(100);
  });

  it("initialize throws on mismatched omField length", () => {
    const f = createSoilField(4);
    expect(() => initializeFromOmField(f, new Float32Array(5))).toThrow(/does not match/);
  });

  it("initialize weights defaults by OM", () => {
    const f = createSoilField(2);
    const om = new Float32Array([1.0, 5.0, 5.0, 10.0]);
    initializeFromOmField(f, om);
    expect(getTile(f, 0, 0).nAvail).toBeLessThan(getTile(f, 1, 1).nAvail);
    expect(getTile(f, 0, 0).moisture).toBeLessThan(getTile(f, 1, 1).moisture);
  });
});

describe("applyCompost", () => {
  it("raises OM, N, P, K, biology", () => {
    const f = makeField(4, 1.5);
    const before = getTile(f, 1, 1);
    applyCompost(f, 1, 1, 5, 2.0);
    const after = getTile(f, 1, 1);
    expect(after.om).toBeGreaterThan(before.om);
    expect(after.nAvail).toBeGreaterThan(before.nAvail);
    expect(after.pAvail).toBeGreaterThan(before.pAvail);
    expect(after.kAvail).toBeGreaterThan(before.kAvail);
    expect(after.biology).toBeGreaterThan(before.biology);
  });

  it("quality scales the boost", () => {
    const a = makeField(4, 1.5);
    const b = makeField(4, 1.5);
    applyCompost(a, 1, 1, 1);
    applyCompost(b, 1, 1, 5);
    expect(getTile(b, 1, 1).om - 1.5).toBeGreaterThan(
      getTile(a, 1, 1).om - 1.5
    );
  });

  it("caps OM at 20 %", () => {
    const f = makeField(2, 19.5);
    for (let k = 0; k < 50; k++) applyCompost(f, 0, 0, 5, 10);
    expect(getTile(f, 0, 0).om).toBeLessThanOrEqual(20);
  });
});

describe("tickSoil", () => {
  it("rain raises moisture, sun lowers it", () => {
    const f = makeField(2, 2);
    const before = getTile(f, 0, 0).moisture;
    tickSoil(f, { rainMm: 10, tempC: 15, evapBase: 0 });
    const afterRain = getTile(f, 0, 0).moisture;
    expect(afterRain).toBeGreaterThan(before);

    tickSoil(f, { rainMm: 0, tempC: 30, evapBase: 6 });
    const afterSun = getTile(f, 0, 0).moisture;
    expect(afterSun).toBeLessThan(afterRain);
  });

  it("mineralization supplies N over many days", () => {
    const f = makeField(2, 5); // richer soil
    const startN = getTile(f, 0, 0).nAvail;
    for (let d = 0; d < 60; d++) {
      tickSoil(f, { rainMm: 2, tempC: 22, evapBase: 1 });
    }
    expect(getTile(f, 0, 0).nAvail).toBeGreaterThan(startN);
  });

  it("heavy rain causes N leaching", () => {
    const f = makeField(2, 3);
    const nBefore = getTile(f, 0, 0).nAvail;
    // Spike nAvail so leach effect is visible.
    f.nAvail.fill(100);
    const before = getTile(f, 0, 0).nAvail;
    tickSoil(f, { rainMm: 60, tempC: 15, evapBase: 2 });
    const after = getTile(f, 0, 0).nAvail;
    expect(after).toBeLessThan(before);
    // Not all-or-nothing — still some N left.
    expect(after).toBeGreaterThan(before * 0.5);
  });

  it("365-tick run does not explode", () => {
    const f = makeField(10, 2.5);
    for (let d = 0; d < 365; d++) {
      tickSoil(f, { rainMm: d % 3 ? 0 : 5, tempC: 10 + 15 * Math.sin(d / 30), evapBase: 2 });
    }
    const t = getTile(f, 5, 5);
    expect(t.om).toBeGreaterThan(0);
    expect(Number.isFinite(t.om)).toBe(true);
    expect(Number.isFinite(t.nAvail)).toBe(true);
    expect(Number.isFinite(t.moisture)).toBe(true);
  });
});

describe("aggregates", () => {
  it("totalOm reflects whole-field mass", () => {
    const f = makeField(3, 2.5);
    // 3×3=9 tiles × 2.5 = 22.5
    expect(totalOm(f)).toBeCloseTo(22.5, 3);
  });

  it("totalNutrients aggregates N/P/K", () => {
    const f = makeField(3, 2);
    const t = totalNutrients(f);
    expect(t.n).toBeGreaterThan(0);
    expect(t.p).toBeGreaterThan(0);
    expect(t.k).toBeGreaterThan(0);
  });
});
