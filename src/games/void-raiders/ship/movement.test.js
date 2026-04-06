import { describe, it, expect } from "vitest";
import { generateTestRoute } from "./movement.js";

describe("movement", () => {
  describe("generateTestRoute", () => {
    it("generates correct number of waypoints", () => {
      const route = generateTestRoute(0, 0, 5000, 20);
      expect(route).toHaveLength(20);
    });

    it("waypoints progress forward in Z", () => {
      const route = generateTestRoute(0, 0, 1000, 5);
      for (let i = 1; i < route.length; i++) {
        expect(route[i].z).toBeGreaterThan(route[i - 1].z);
      }
    });

    it("final waypoint is approximately at target distance", () => {
      const route = generateTestRoute(0, 0, 5000, 20);
      const last = route[route.length - 1];
      // Z should be approximately 5000 (the S-curve doesn't affect Z progression)
      expect(last.z).toBeCloseTo(5000, -2); // within 100m
    });

    it("starts from the given position", () => {
      const route = generateTestRoute(100, 200, 1000, 5);
      // First waypoint should be near start
      expect(route[0].z).toBeGreaterThan(200);
    });
  });
});
