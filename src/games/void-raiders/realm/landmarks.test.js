/**
 * Tests for landmark generation and terrain height modification.
 */

import { describe, it, expect } from "vitest";
import { generateLandmarks, getLandmarkModifier, LANDMARK_TYPES } from "./landmarks.js";

describe("generateLandmarks", () => {
  it("is deterministic — same seed produces same landmarks", () => {
    const a = generateLandmarks(12345);
    const b = generateLandmarks(12345);
    expect(a).toEqual(b);
  });

  it("generates between 3 and 5 landmarks", () => {
    for (let seed = 1; seed < 20; seed++) {
      const lms = generateLandmarks(seed);
      expect(lms.length).toBeGreaterThanOrEqual(3);
      expect(lms.length).toBeLessThanOrEqual(5);
    }
  });

  it("landmarks do not overlap (minimum 500m spacing)", () => {
    for (let seed = 1; seed < 10; seed++) {
      const lms = generateLandmarks(seed);
      for (let i = 0; i < lms.length; i++) {
        for (let j = i + 1; j < lms.length; j++) {
          const dx = lms[i].x - lms[j].x;
          const dz = lms[i].z - lms[j].z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          expect(dist).toBeGreaterThanOrEqual(500);
        }
      }
    }
  });

  it("each landmark has required fields", () => {
    const lms = generateLandmarks(42);
    for (const lm of lms) {
      expect(lm).toHaveProperty("type");
      expect(lm).toHaveProperty("x");
      expect(lm).toHaveProperty("z");
      expect(lm).toHaveProperty("angle");
      expect(lm).toHaveProperty("seed");
      expect(LANDMARK_TYPES).toHaveProperty(lm.type);
    }
  });

  it("different seeds produce different landmarks", () => {
    const a = generateLandmarks(1);
    const b = generateLandmarks(999);
    // At minimum the positions should differ
    const posA = a.map(l => `${l.x.toFixed(0)},${l.z.toFixed(0)}`).join("|");
    const posB = b.map(l => `${l.x.toFixed(0)},${l.z.toFixed(0)}`).join("|");
    expect(posA).not.toBe(posB);
  });
});

describe("getLandmarkModifier", () => {
  it("returns zero offset far from any landmark", () => {
    const lms = [{ type: "monolith", x: 0, z: 0, angle: 0, seed: 1 }];
    const result = getLandmarkModifier(9999, 9999, lms);
    expect(result.offset).toBe(0);
    expect(result.mesaClamped).toBe(false);
  });

  it("monolith creates positive height spike at center", () => {
    const lms = [{ type: "monolith", x: 100, z: 100, angle: 0, seed: 1 }];
    const result = getLandmarkModifier(100, 100, lms);
    expect(result.offset).toBe(LANDMARK_TYPES.monolith.heightOffset);
  });

  it("monolith offset falls off with distance", () => {
    const lms = [{ type: "monolith", x: 0, z: 0, angle: 0, seed: 1 }];
    const center = getLandmarkModifier(0, 0, lms);
    const edge = getLandmarkModifier(5, 0, lms);
    expect(center.offset).toBeGreaterThan(edge.offset);
    expect(edge.offset).toBeGreaterThan(0);
  });

  it("crater creates negative height at center", () => {
    const lms = [{ type: "crater", x: 0, z: 0, angle: 0, seed: 1 }];
    const result = getLandmarkModifier(0, 0, lms);
    expect(result.offset).toBe(LANDMARK_TYPES.crater.heightOffset);
    expect(result.offset).toBeLessThan(0);
  });

  it("ridge creates height boost along its axis", () => {
    const lms = [{ type: "ridge", x: 0, z: 0, angle: 0, seed: 1 }];
    // Along the ridge axis (angle=0 means cosA=1,sinA=0, so axis is X)
    const onRidge = getLandmarkModifier(50, 0, lms);
    // Off to the side
    const offRidge = getLandmarkModifier(0, 50, lms);
    expect(onRidge.offset).toBeGreaterThan(0);
    // 50m across is beyond the 10m half-width
    expect(offRidge.offset).toBe(0);
  });

  it("mesa sets mesaClamped flag", () => {
    const lms = [{ type: "mesa", x: 0, z: 0, angle: 0, seed: 1 }];
    const result = getLandmarkModifier(0, 0, lms);
    expect(result.mesaClamped).toBe(true);
    expect(result.mesaLevel).toBe(LANDMARK_TYPES.mesa.mesaLevel);
  });

  it("canyon creates negative offset along trench", () => {
    const lms = [{ type: "canyon", x: 0, z: 0, angle: 0, seed: 1 }];
    const inCanyon = getLandmarkModifier(50, 0, lms);
    expect(inCanyon.offset).toBeLessThan(0);
  });

  it("empty landmarks array returns zero offset", () => {
    const result = getLandmarkModifier(0, 0, []);
    expect(result.offset).toBe(0);
    expect(result.mesaClamped).toBe(false);
  });
});
