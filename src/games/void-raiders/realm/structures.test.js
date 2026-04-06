/**
 * Tests for alien structure generation.
 */

import { describe, it, expect } from "vitest";
import { generateStructurePositions } from "./structures.js";

describe("generateStructurePositions", () => {
  it("generates between 2 and 4 structures", () => {
    for (let seed = 1; seed < 20; seed++) {
      const structs = generateStructurePositions(seed);
      expect(structs.length).toBeGreaterThanOrEqual(2);
      expect(structs.length).toBeLessThanOrEqual(4);
    }
  });

  it("is deterministic — same seed produces same result", () => {
    const a = generateStructurePositions(42);
    const b = generateStructurePositions(42);
    expect(a).toEqual(b);
  });

  it("structures maintain minimum spacing", () => {
    for (let seed = 1; seed < 10; seed++) {
      const structs = generateStructurePositions(seed);
      for (let i = 0; i < structs.length; i++) {
        for (let j = i + 1; j < structs.length; j++) {
          const dx = structs[i].x - structs[j].x;
          const dz = structs[i].z - structs[j].z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          expect(dist).toBeGreaterThanOrEqual(600);
        }
      }
    }
  });

  it("each structure has required fields", () => {
    const structs = generateStructurePositions(123);
    for (const s of structs) {
      expect(s).toHaveProperty("x");
      expect(s).toHaveProperty("z");
      expect(s).toHaveProperty("terrainH");
      expect(s).toHaveProperty("buildingCount");
      expect(s).toHaveProperty("seed");
      expect(s.buildingCount).toBeGreaterThanOrEqual(3);
      expect(s.buildingCount).toBeLessThanOrEqual(5);
    }
  });
});
