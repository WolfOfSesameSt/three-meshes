import { describe, it, expect } from "vitest";
import { ACTION_TYPES, evaluateRoutine } from "./routine.js";
import { createDrone } from "./drone.js";

function makeCtx(overrides = {}) {
  return {
    mothershipPos: { x: 0, y: 50, z: 0 },
    deposits: [],
    enemies: [],
    friendlies: [],
    lootables: [],
    projectiles: [],
    recallActive: false,
    ...overrides,
  };
}

describe("repair system", () => {
  describe("repair action execution", () => {
    it("repairs drone hull", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      const damagedDrone = createDrone({ type: "offensive" });
      damagedDrone.stats.hull = 30; // damaged from 60

      ACTION_TYPES.repair.execute(repairDrone, damagedDrone, 1.0);
      expect(damagedDrone.stats.hull).toBe(38); // repairRate 8 * 1.0s
    });

    it("does not over-heal hull", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      const target = createDrone({ type: "offensive" });
      target.stats.hull = 58; // almost full (max 60)

      ACTION_TYPES.repair.execute(repairDrone, target, 1.0);
      expect(target.stats.hull).toBe(60); // capped at max
    });

    it("repairs shields after hull is full", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      const target = createDrone({ type: "offensive" });
      target.stats.hull = 60; // full hull
      target.stats.shields = 10; // damaged shields (max 20)

      ACTION_TYPES.repair.execute(repairDrone, target, 1.0);
      // Shield repair at 0.5x rate: 8 * 1.0 * 0.5 = 4
      expect(target.stats.shields).toBe(14);
    });

    it("repairs mothership hull via .systems", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      const mothership = {
        systems: { hull: 800, hullMax: 1000, shields: 500, shieldsMax: 500 },
        position: { x: 0, y: 50, z: 0 },
      };

      ACTION_TYPES.repair.execute(repairDrone, mothership, 1.0);
      expect(mothership.systems.hull).toBe(808);
    });

    it("repairs mothership shields after hull is full", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      const mothership = {
        systems: { hull: 1000, hullMax: 1000, shields: 400, shieldsMax: 500 },
        position: { x: 0, y: 50, z: 0 },
      };

      ACTION_TYPES.repair.execute(repairDrone, mothership, 1.0);
      expect(mothership.systems.hull).toBe(1000); // unchanged
      expect(mothership.systems.shields).toBe(404); // 8 * 0.5 = 4
    });
  });

  describe("repair target selection", () => {
    it("finds damaged drones as targets", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      repairDrone.state = "active";

      const damagedDrone = createDrone({ type: "offensive" });
      damagedDrone.stats.hull = 30;
      damagedDrone.position = { x: 10, y: 50, z: 0 };
      damagedDrone.state = "active";

      const ctx = makeCtx({ friendlies: [repairDrone, damagedDrone] });
      const routine = { anchor: "follow-mothership", range: 200, priority: "most-damaged", action: "repair", retreat: "health-low" };
      const result = evaluateRoutine(repairDrone, routine, { x: 0, y: 50, z: 0 }, ctx);

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe(damagedDrone.id);
    });

    it("skips fully healed targets", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      repairDrone.state = "active";

      const healthyDrone = createDrone({ type: "offensive" });
      healthyDrone.position = { x: 10, y: 50, z: 0 };
      healthyDrone.state = "active";
      // hull and shields both full

      const ctx = makeCtx({ friendlies: [repairDrone, healthyDrone] });
      const routine = { anchor: "follow-mothership", range: 200, priority: "most-damaged", action: "repair", retreat: "health-low" };
      const result = evaluateRoutine(repairDrone, routine, { x: 0, y: 50, z: 0 }, ctx);

      expect(result.target).toBeNull(); // no one needs repair
    });

    it("does not target itself", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      repairDrone.state = "active";
      repairDrone.stats.hull = 15; // damaged itself
      repairDrone.position = { x: 0, y: 50, z: 0 };

      const ctx = makeCtx({ friendlies: [repairDrone] });
      const routine = { anchor: "follow-mothership", range: 200, priority: "most-damaged", action: "repair", retreat: "health-low" };
      const result = evaluateRoutine(repairDrone, routine, { x: 0, y: 50, z: 0 }, ctx);

      expect(result.target).toBeNull(); // can't self-repair
    });

    it("targets mothership when damaged", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      repairDrone.state = "active";

      const mothership = {
        id: "mothership",
        systems: { hull: 800, hullMax: 1000, shields: 500, shieldsMax: 500 },
        position: { x: 10, y: 50, z: 0 },
      };

      const ctx = makeCtx({ friendlies: [repairDrone, mothership] });
      const routine = { anchor: "follow-mothership", range: 200, priority: "most-damaged", action: "repair", retreat: "health-low" };
      const result = evaluateRoutine(repairDrone, routine, { x: 0, y: 50, z: 0 }, ctx);

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe("mothership");
    });

    it("prioritizes most damaged target", () => {
      const repairDrone = createDrone({ type: "worker-repair" });
      repairDrone.state = "active";

      const slightlyDamaged = createDrone({ type: "offensive" });
      slightlyDamaged.stats.hull = 50; // 83%
      slightlyDamaged.position = { x: 10, y: 50, z: 0 };
      slightlyDamaged.state = "active";

      const heavilyDamaged = createDrone({ type: "offensive" });
      heavilyDamaged.stats.hull = 10; // 17%
      heavilyDamaged.position = { x: 20, y: 50, z: 0 };
      heavilyDamaged.state = "active";

      const ctx = makeCtx({ friendlies: [repairDrone, slightlyDamaged, heavilyDamaged] });
      const routine = { anchor: "follow-mothership", range: 200, priority: "most-damaged", action: "repair", retreat: "health-low" };
      const result = evaluateRoutine(repairDrone, routine, { x: 0, y: 50, z: 0 }, ctx);

      expect(result.target.id).toBe(heavilyDamaged.id);
    });
  });
});
