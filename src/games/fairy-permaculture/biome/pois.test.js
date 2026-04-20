import { describe, it, expect } from "vitest";
import { generateHeightfield } from "./heightfield.js";
import { placePois, findPoi } from "./pois.js";
import { MAP_TILES } from "../config.js";

const N = MAP_TILES;

function meanHeight(tiles, hf) {
  let s = 0;
  let n = 0;
  for (const i of tiles) {
    s += hf[i];
    n++;
  }
  return n === 0 ? 0 : s / n;
}

describe("pois", () => {
  it("always places all 4 core POIs (forest, homestead, outcrop, ruin)", () => {
    for (const seed of [1, 42, 99, 2024, 777]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      expect(findPoi(pois, "old-growth-forest-edge")).toBeTruthy();
      expect(findPoi(pois, "starting-homestead")).toBeTruthy();
      expect(findPoi(pois, "rocky-outcrop")).toBeTruthy();
      expect(findPoi(pois, "abandoned-farmstead-ruin")).toBeTruthy();
    }
  });

  it("forest edge touches N, E, or W — never S", () => {
    for (const seed of [1, 2, 3, 42, 99, 777, 2024]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const fe = findPoi(pois, "old-growth-forest-edge");
      expect(["N", "E", "W"]).toContain(fe.meta.edge);

      // Sanity: every tile on the corresponding outer boundary row
      // should actually be in the forest-edge tile set.
      if (fe.meta.edge === "N") {
        for (let x = 0; x < N; x++) {
          expect(fe.tiles.has(x)).toBe(true);
        }
        // And the S row should NOT be in forest-edge.
        const southRowStart = (N - 1) * N;
        let southInForest = 0;
        for (let x = 0; x < N; x++) {
          if (fe.tiles.has(southRowStart + x)) southInForest++;
        }
        expect(southInForest).toBe(0);
      } else if (fe.meta.edge === "W") {
        for (let y = 0; y < N; y++) {
          expect(fe.tiles.has(y * N)).toBe(true);
        }
      } else if (fe.meta.edge === "E") {
        for (let y = 0; y < N; y++) {
          expect(fe.tiles.has(y * N + (N - 1))).toBe(true);
        }
      }
    }
  });

  it("outcrop sits on higher ground than the homestead", () => {
    for (const seed of [1, 2, 3, 42, 99, 777, 2024]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const hp = findPoi(pois, "starting-homestead");
      const oc = findPoi(pois, "rocky-outcrop");
      expect(meanHeight(oc.tiles, hf)).toBeGreaterThan(meanHeight(hp.tiles, hf));
    }
  });

  it("forest-edge depth is in 60–100 tiles", () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const fe = findPoi(pois, "old-growth-forest-edge");
      expect(fe.meta.depth).toBeGreaterThanOrEqual(60);
      expect(fe.meta.depth).toBeLessThanOrEqual(100);
    }
  });

  it("outcrop footprint is 8–15 tiles", () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const oc = findPoi(pois, "rocky-outcrop");
      expect(oc.tiles.size).toBeGreaterThanOrEqual(8);
      expect(oc.tiles.size).toBeLessThanOrEqual(15);
    }
  });

  it("ruin is distinct from starting homestead tiles", () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const hf = generateHeightfield(seed);
      const pois = placePois(hf, seed);
      const hp = findPoi(pois, "starting-homestead");
      const ru = findPoi(pois, "abandoned-farmstead-ruin");
      for (const t of ru.tiles) {
        expect(hp.tiles.has(t)).toBe(false);
      }
    }
  });
});
