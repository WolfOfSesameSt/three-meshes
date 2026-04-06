/**
 * Screen shake system tests — pure math, no Three.js dependency.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ScreenShake, damageToTrauma, weaponFireTrauma } from "../combat/screen-shake.js";

describe("ScreenShake", () => {
  let shake;

  beforeEach(() => {
    shake = new ScreenShake();
  });

  it("starts with zero trauma and zero offset", () => {
    expect(shake.trauma).toBe(0);
    expect(shake.offset.x).toBe(0);
    expect(shake.offset.y).toBe(0);
    expect(shake.offset.z).toBe(0);
  });

  it("returns zero offset when no trauma", () => {
    const offset = shake.update(0.016);
    expect(offset.x).toBe(0);
    expect(offset.y).toBe(0);
    expect(offset.z).toBe(0);
  });

  it("produces non-zero offset after adding trauma", () => {
    shake.addTrauma(0.5);
    const offset = shake.update(0.016);
    const magnitude = Math.sqrt(offset.x ** 2 + offset.y ** 2 + offset.z ** 2);
    expect(magnitude).toBeGreaterThan(0);
  });

  it("clamps trauma to 1.0", () => {
    shake.addTrauma(0.8);
    shake.addTrauma(0.5);
    expect(shake.trauma).toBe(1.0);
  });

  it("accumulates trauma from multiple hits", () => {
    shake.addTrauma(0.2);
    shake.addTrauma(0.3);
    expect(shake.trauma).toBeCloseTo(0.5, 5);
  });

  it("decays trauma over time", () => {
    shake.addTrauma(1.0);
    shake.update(0.1);
    expect(shake.trauma).toBeLessThan(1.0);
    expect(shake.trauma).toBeGreaterThan(0);
  });

  it("fully decays to zero after enough time", () => {
    shake.addTrauma(0.5);
    // Run many frames
    for (let i = 0; i < 100; i++) {
      shake.update(0.016);
    }
    expect(shake.trauma).toBe(0);
    expect(shake.offset.x).toBe(0);
    expect(shake.offset.y).toBe(0);
    expect(shake.offset.z).toBe(0);
  });

  it("higher trauma produces larger offsets", () => {
    // Low trauma
    shake.addTrauma(0.1);
    shake.update(0.001); // tiny dt so decay is negligible
    const lowMag = Math.sqrt(
      shake.offset.x ** 2 + shake.offset.y ** 2 + shake.offset.z ** 2
    );

    // High trauma
    shake.reset();
    shake.addTrauma(1.0);
    shake.update(0.001);
    const highMag = Math.sqrt(
      shake.offset.x ** 2 + shake.offset.y ** 2 + shake.offset.z ** 2
    );

    expect(highMag).toBeGreaterThan(lowMag);
  });

  it("offset magnitude stays within maxOffset", () => {
    shake.addTrauma(1.0);
    for (let i = 0; i < 50; i++) {
      shake.update(0.001); // small dt to keep trauma high
      const mag = Math.abs(shake.offset.x);
      expect(mag).toBeLessThanOrEqual(shake.maxOffset + 0.001);
      const magY = Math.abs(shake.offset.y);
      expect(magY).toBeLessThanOrEqual(shake.maxOffset + 0.001);
      const magZ = Math.abs(shake.offset.z);
      expect(magZ).toBeLessThanOrEqual(shake.maxOffset + 0.001);
    }
  });

  it("reset clears all state", () => {
    shake.addTrauma(1.0);
    shake.update(0.016);
    shake.reset();
    expect(shake.trauma).toBe(0);
    expect(shake.offset.x).toBe(0);
    expect(shake.offset.y).toBe(0);
    expect(shake.offset.z).toBe(0);
  });

  it("shake intensity is trauma squared (non-linear)", () => {
    // At trauma=0.5, effective shake = 0.25
    // At trauma=1.0, effective shake = 1.0
    // So offset at trauma=1.0 should be ~4x offset at trauma=0.5

    shake.addTrauma(0.5);
    shake.update(0.001);
    const halfOffset = { ...shake.offset };

    shake.reset();
    shake.addTrauma(1.0);
    // Use same elapsed time offset for comparable sin/cos values
    shake._elapsed = 0;
    shake.update(0.001);
    const fullOffset = { ...shake.offset };

    // The ratio should be approximately 4 (1.0^2 / 0.5^2 = 4)
    // But decay slightly affects it, so allow some tolerance
    if (Math.abs(halfOffset.x) > 0.001) {
      const ratio = Math.abs(fullOffset.x) / Math.abs(halfOffset.x);
      expect(ratio).toBeGreaterThan(2.5);
      expect(ratio).toBeLessThan(5.5);
    }
  });
});

describe("damageToTrauma", () => {
  it("returns 0 for 0 damage", () => {
    expect(damageToTrauma(0)).toBe(0);
  });

  it("returns 1 for damage >= maxDamage", () => {
    expect(damageToTrauma(50)).toBe(1);
    expect(damageToTrauma(100)).toBe(1);
  });

  it("scales linearly with damage", () => {
    expect(damageToTrauma(25)).toBeCloseTo(0.5, 5);
    expect(damageToTrauma(10)).toBeCloseTo(0.2, 5);
  });

  it("respects custom maxDamage parameter", () => {
    expect(damageToTrauma(50, 100)).toBeCloseTo(0.5, 5);
    expect(damageToTrauma(100, 100)).toBe(1);
  });
});

describe("weaponFireTrauma", () => {
  it("returns a small positive value", () => {
    const t = weaponFireTrauma();
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.2); // subtle nudge, not a big shake
  });
});
