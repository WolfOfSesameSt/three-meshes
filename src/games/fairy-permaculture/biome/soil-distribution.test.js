import { describe, it, expect } from "vitest";
import { generateHeightfield } from "./heightfield.js";
import { placePois, findPoi } from "./pois.js";
import { generateSoilOmField } from "./soil-distribution.js";
import { MAP_TILES } from "../config.js";

function meanOm(tiles, om) {
  let s = 0;
  let n = 0;
  for (const i of tiles) {
    s += om[i];
    n++;
  }
  return n === 0 ? 0 : s / n;
}

describe("soil-distribution", () => {
  it("produces the right size array", () => {
    const hf = generateHeightfield(42);
    const pois = placePois(hf, 42);
    const om = generateSoilOmField(hf, pois, 42);
    expect(om.length).toBe(MAP_TILES * MAP_TILES);
  });

  it("forest-edge tiles average >= 4.0% OM", () => {
    for (const seed of [1, 42, 99, 2024]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const om = generateSoilOmField(hf, pois, seed);
      const fe = findPoi(pois, "old-growth-forest-edge");
      const avg = meanOm(fe.tiles, om);
      expect(avg).toBeGreaterThanOrEqual(4.0);
    }
  });

  it("homestead tiles average <= 1.5% OM", () => {
    for (const seed of [1, 42, 99, 2024]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const om = generateSoilOmField(hf, pois, seed);
      const hp = findPoi(pois, "starting-homestead");
      const avg = meanOm(hp.tiles, om);
      expect(avg).toBeLessThanOrEqual(1.5);
    }
  });

  it("ruin tiles stay in 2.0–3.0% OM", () => {
    for (const seed of [1, 42, 99]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const om = generateSoilOmField(hf, pois, seed);
      const ru = findPoi(pois, "abandoned-farmstead-ruin");
      for (const i of ru.tiles) {
        expect(om[i]).toBeGreaterThanOrEqual(2.0);
        expect(om[i]).toBeLessThanOrEqual(3.0);
      }
    }
  });

  it("baseline tiles stay in 1.5–3.5% OM", () => {
    const hf = generateHeightfield(42);
    const pois = placePois(hf, 42);
    const om = generateSoilOmField(hf, pois, 42);
    const fe = findPoi(pois, "old-growth-forest-edge");
    const hp = findPoi(pois, "starting-homestead");
    const ru = findPoi(pois, "abandoned-farmstead-ruin");
    let checked = 0;
    for (let i = 0; i < om.length && checked < 2000; i++) {
      if (fe.tiles.has(i) || hp.tiles.has(i) || ru.tiles.has(i)) continue;
      expect(om[i]).toBeGreaterThanOrEqual(1.5);
      expect(om[i]).toBeLessThanOrEqual(3.5);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});
