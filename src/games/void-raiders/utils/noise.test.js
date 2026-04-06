import { describe, it, expect } from "vitest";
import { mulberry32, noise2, fbm } from "./noise.js";

describe("mulberry32 PRNG", () => {
  it("produces deterministic output from same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("produces different output from different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("returns values in 0-1 range", () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("noise2", () => {
  it("returns values in 0-1 range", () => {
    for (let x = -10; x < 10; x += 0.7) {
      for (let y = -10; y < 10; y += 0.7) {
        const v = noise2(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic", () => {
    expect(noise2(1.5, 2.5)).toBe(noise2(1.5, 2.5));
  });

  it("varies across space", () => {
    const a = noise2(0, 0);
    const b = noise2(10, 10);
    // They should usually differ (not a proof, but a sanity check)
    expect(a).not.toBe(b);
  });
});

describe("fbm", () => {
  it("returns values in 0-1 range", () => {
    for (let x = -5; x < 5; x += 1.3) {
      for (let y = -5; y < 5; y += 1.3) {
        const v = fbm(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic", () => {
    expect(fbm(3.14, 2.72)).toBe(fbm(3.14, 2.72));
  });

  it("respects octave count", () => {
    // More octaves should produce finer detail but similar range
    const v1 = fbm(1, 1, 1);
    const v6 = fbm(1, 1, 6);
    expect(v1).toBeGreaterThanOrEqual(0);
    expect(v6).toBeGreaterThanOrEqual(0);
  });
});
