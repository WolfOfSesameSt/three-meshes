import { describe, it, expect } from "vitest";
import { PowerAllocator } from "./power.js";

describe("PowerAllocator", () => {
  it("starts with default allocation (40/40/20)", () => {
    const pa = new PowerAllocator();
    expect(pa.allocation.shields).toBe(40);
    expect(pa.allocation.weapons).toBe(40);
    expect(pa.allocation.replication).toBe(20);
  });

  it("allocations always sum to 100", () => {
    const pa = new PowerAllocator();
    pa.setAllocation("shields", 80);
    const total = pa.allocation.shields + pa.allocation.weapons + pa.allocation.replication;
    expect(total).toBe(100);
    expect(pa.allocation.shields).toBe(80);
  });

  it("setting one system scales others proportionally", () => {
    const pa = new PowerAllocator();
    pa.setAllocation("shields", 60);
    // weapons was 40, replication was 20 (2:1 ratio)
    // remaining = 40, should split ~27/13
    expect(pa.allocation.weapons).toBeGreaterThan(pa.allocation.replication);
    expect(pa.allocation.shields + pa.allocation.weapons + pa.allocation.replication).toBe(100);
  });

  it("getFraction returns 0-1", () => {
    const pa = new PowerAllocator();
    expect(pa.getFraction("shields")).toBeCloseTo(0.4);
    pa.setAllocation("shields", 100);
    expect(pa.getFraction("shields")).toBe(1.0);
  });

  it("shield regen rate scales with allocation", () => {
    const pa = new PowerAllocator();
    const rateDefault = pa.getShieldRegenRate(10);
    pa.setAllocation("shields", 80);
    const rateHigh = pa.getShieldRegenRate(10);
    expect(rateHigh).toBeGreaterThan(rateDefault);
  });

  it("shield regen is zero with zero allocation", () => {
    const pa = new PowerAllocator();
    pa.setAllocation("shields", 0);
    expect(pa.getShieldRegenRate(10)).toBe(0);
  });

  it("drone shield regen distributes across drones", () => {
    const pa = new PowerAllocator();
    const rate1 = pa.getDroneShieldRegenRate(10, 1);
    const rate5 = pa.getDroneShieldRegenRate(10, 5);
    expect(rate1).toBeGreaterThan(rate5);
    // More drones = less regen each
  });

  it("drone shield regen is zero with no shielded drones", () => {
    const pa = new PowerAllocator();
    expect(pa.getDroneShieldRegenRate(10, 0)).toBe(0);
  });
});
