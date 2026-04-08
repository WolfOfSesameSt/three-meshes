import { describe, it, expect } from "vitest";
import {
  evaluateRoutine,
  resolveAnchor,
  getUnlockedValues,
  ANCHOR_TYPES,
  PRIORITY_TYPES,
  ACTION_TYPES,
  RETREAT_TYPES,
} from "./routine.js";
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

describe("routine engine", () => {
  // ── RETREAT ────────────────────────────────────────────────

  describe("retreat rules", () => {
    it("cargo-full triggers when cargo equals capacity", () => {
      const drone = createDrone({ type: "worker-mining" });
      drone.cargo = drone.stats.cargoCapacity;
      drone.state = "active";
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "mine", retreat: "cargo-full" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, makeCtx());
      expect(result.retreating).toBe(true);
      expect(result.type).toBe("retreat");
    });

    it("cargo-full does not trigger when cargo is partial", () => {
      const drone = createDrone({ type: "worker-mining" });
      drone.cargo = 10;
      drone.state = "active";
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "mine", retreat: "cargo-full" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, makeCtx());
      expect(result.retreating).toBe(false);
    });

    it("health-low triggers below 30%", () => {
      const drone = createDrone({ type: "offensive" }); // hull 60
      drone.stats.hull = 15; // 25% health
      drone.state = "active";
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "attack", retreat: "health-low" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, makeCtx());
      expect(result.retreating).toBe(true);
    });

    it("health-low does not trigger above 30%", () => {
      const drone = createDrone({ type: "offensive" }); // hull 60
      drone.stats.hull = 30; // 50%
      drone.state = "active";
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "attack", retreat: "health-low" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, makeCtx());
      expect(result.retreating).toBe(false);
    });

    it("mothership-recall triggers when recall active", () => {
      const drone = createDrone();
      drone.state = "active";
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "mine", retreat: "mothership-recall" };
      const ctx = makeCtx({ recallActive: true });
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, ctx);
      expect(result.retreating).toBe(true);
    });

    // ── Damaged retreat — hook for the RepairBay flow ─────────

    it("damaged triggers below 50% hull", () => {
      const drone = createDrone({ type: "worker-mining" }); // hull 40, no shields
      drone.stats.hull = 15; // 37.5%
      drone.state = "active";
      const routine = {
        anchor: "follow-mothership",
        range: 200,
        priority: "nearest",
        action: "mine",
        retreat: "damaged",
      };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, makeCtx());
      expect(result.retreating).toBe(true);
      expect(result.reason).toBe("damaged");
    });

    it("damaged triggers below 25% shields for shield-equipped drones", () => {
      const drone = createDrone({ type: "offensive" }); // hull 60, shields 20
      // Plenty of hull (above 50%) but shields below 25%
      drone.stats.hull = drone.stats.hullMax; // 100% hull
      drone.stats.shields = 4; // 20% of 20
      drone.state = "active";
      const routine = {
        anchor: "follow-mothership",
        range: 200,
        priority: "nearest",
        action: "attack",
        retreat: "damaged",
      };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, makeCtx());
      expect(result.retreating).toBe(true);
      expect(result.reason).toBe("damaged");
    });

    it("damaged does NOT trigger at 60% hull / 50% shields", () => {
      const drone = createDrone({ type: "offensive" }); // hull 60, shields 20
      drone.stats.hull = drone.stats.hullMax * 0.6;
      drone.stats.shields = drone.stats.shieldsMax * 0.5;
      drone.state = "active";
      const routine = {
        anchor: "follow-mothership",
        range: 200,
        priority: "nearest",
        action: "attack",
        retreat: "damaged",
      };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, makeCtx());
      expect(result.retreating).toBe(false);
    });

    it("evaluateRoutine result includes .reason for every retreat type", () => {
      // cargo-full case — the existing retreat path should also surface
      // a reason so the fleet-manager dock handler can switch on it.
      const miner = createDrone({ type: "worker-mining" });
      miner.state = "active";
      miner.cargo = miner.stats.cargoCapacity;
      const cargoRoutine = {
        anchor: "follow-mothership",
        range: 200,
        priority: "nearest",
        action: "mine",
        retreat: "cargo-full",
      };
      const cargoResult = evaluateRoutine(miner, cargoRoutine, { x: 0, y: 0, z: 0 }, makeCtx());
      expect(cargoResult.retreating).toBe(true);
      expect(cargoResult.reason).toBe("cargo-full");

      // damaged case — identical shape
      const fighter = createDrone({ type: "offensive" });
      fighter.state = "active";
      fighter.stats.hull = fighter.stats.hullMax * 0.3;
      const dmgRoutine = { ...cargoRoutine, action: "attack", retreat: "damaged" };
      const dmgResult = evaluateRoutine(fighter, dmgRoutine, { x: 0, y: 0, z: 0 }, makeCtx());
      expect(dmgResult.retreating).toBe(true);
      expect(dmgResult.reason).toBe("damaged");
    });
  });

  // ── TARGET SELECTION ───────────────────────────────────────

  describe("target selection", () => {
    it("mining drones find deposits within range", () => {
      const drone = createDrone({ type: "worker-mining" });
      drone.state = "active";
      const anchor = { x: 0, y: 50, z: 0 };
      const ctx = makeCtx({
        deposits: [
          { position: { x: 100, y: 0, z: 0 }, amount: 500 },
          { position: { x: 9999, y: 0, z: 0 }, amount: 1000 }, // out of range
        ],
      });
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "mine", retreat: "cargo-full" };
      const result = evaluateRoutine(drone, routine, anchor, ctx);
      expect(result.target).not.toBeNull();
      expect(result.target.amount).toBe(500);
    });

    it("filters out depleted deposits", () => {
      const drone = createDrone({ type: "worker-mining" });
      drone.state = "active";
      const ctx = makeCtx({
        deposits: [{ position: { x: 10, y: 0, z: 0 }, amount: 0 }],
      });
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "mine", retreat: "cargo-full" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, ctx);
      expect(result.target).toBeNull();
    });

    it("attack drones find enemies within range", () => {
      const drone = createDrone({ type: "offensive" });
      drone.state = "active";
      const ctx = makeCtx({
        enemies: [
          { position: { x: 50, y: 0, z: 0 }, stats: { hull: 30, hullMax: 30 } },
        ],
      });
      const routine = { anchor: "follow-mothership", range: 200, priority: "weakest", action: "attack", retreat: "health-low" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, ctx);
      expect(result.target).not.toBeNull();
      expect(result.type).toBe("attack");
    });

    it("filters out dead enemies", () => {
      const drone = createDrone({ type: "offensive" });
      drone.state = "active";
      const ctx = makeCtx({
        enemies: [{ position: { x: 50, y: 0, z: 0 }, stats: { hull: 0, hullMax: 30 } }],
      });
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "attack", retreat: "health-low" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 50, z: 0 }, ctx);
      expect(result.target).toBeNull();
    });
  });

  // ── PRIORITY SORTING ───────────────────────────────────────

  describe("priority sorting", () => {
    it("nearest picks closest target", () => {
      const drone = createDrone();
      drone.state = "active";
      drone.position = { x: 0, y: 0, z: 0 };
      const ctx = makeCtx({
        deposits: [
          { position: { x: 100, y: 0, z: 0 }, amount: 100 },
          { position: { x: 20, y: 0, z: 0 }, amount: 50 },
        ],
      });
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "mine", retreat: "cargo-full" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 0, z: 0 }, ctx);
      expect(result.target.amount).toBe(50); // closer one
    });

    it("richest picks highest amount", () => {
      const drone = createDrone();
      drone.state = "active";
      const ctx = makeCtx({
        deposits: [
          { position: { x: 10, y: 0, z: 0 }, amount: 100 },
          { position: { x: 20, y: 0, z: 0 }, amount: 500 },
        ],
      });
      const routine = { anchor: "follow-mothership", range: 200, priority: "richest", action: "mine", retreat: "cargo-full" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 0, z: 0 }, ctx);
      expect(result.target.amount).toBe(500);
    });

    it("weakest picks lowest hull enemy", () => {
      const drone = createDrone({ type: "offensive" });
      drone.state = "active";
      const ctx = makeCtx({
        enemies: [
          { position: { x: 10, y: 0, z: 0 }, stats: { hull: 100, hullMax: 100 } },
          { position: { x: 20, y: 0, z: 0 }, stats: { hull: 15, hullMax: 50 } },
        ],
      });
      const routine = { anchor: "follow-mothership", range: 200, priority: "weakest", action: "attack", retreat: "health-low" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 0, z: 0 }, ctx);
      expect(result.target.stats.hull).toBe(15);
    });
  });

  // ── ACTIONS ────────────────────────────────────────────────

  describe("action execution", () => {
    it("mine action extracts resources", () => {
      const drone = createDrone({ type: "worker-mining" });
      const target = { position: { x: 0, y: 0, z: 0 }, amount: 100 };
      ACTION_TYPES.mine.execute(drone, target, 1.0);
      expect(drone.cargo).toBe(5); // miningRate=5 * dt=1
      expect(target.amount).toBe(95);
    });

    it("mine stops when cargo full", () => {
      const drone = createDrone({ type: "worker-mining" });
      drone.cargo = 98;
      const target = { position: { x: 0, y: 0, z: 0 }, amount: 100 };
      ACTION_TYPES.mine.execute(drone, target, 1.0);
      expect(drone.cargo).toBe(100); // capped at capacity
      expect(target.amount).toBe(98);
    });

    it("attack action deals damage", () => {
      const drone = createDrone({ type: "offensive" }); // damage=10
      const enemy = { position: { x: 0, y: 0, z: 0 }, stats: { hull: 50, hullMax: 50 } };
      ACTION_TYPES.attack.execute(drone, enemy, 1.0);
      expect(enemy.stats.hull).toBe(40);
    });

    it("attack damage scales with dt", () => {
      const drone = createDrone({ type: "offensive" });
      const enemy = { position: { x: 0, y: 0, z: 0 }, stats: { hull: 50, hullMax: 50 } };
      ACTION_TYPES.attack.execute(drone, enemy, 0.5);
      expect(enemy.stats.hull).toBe(45); // 10 * 0.5 = 5 damage
    });
  });

  // ── ANCHOR RESOLUTION ──────────────────────────────────────

  describe("anchor resolution", () => {
    it("follow-mothership returns mothership position", () => {
      const routine = { anchor: "follow-mothership" };
      const ctx = makeCtx({ mothershipPos: { x: 100, y: 50, z: 200 } });
      const pos = resolveAnchor(routine, {}, ctx);
      expect(pos.x).toBe(100);
      expect(pos.z).toBe(200);
    });

    it("fixed returns swarm's stored position", () => {
      const routine = { anchor: "fixed" };
      const swarm = { anchorPosition: { x: 42, y: 10, z: 99 } };
      const pos = resolveAnchor(routine, swarm, makeCtx());
      expect(pos.x).toBe(42);
      expect(pos.z).toBe(99);
    });
  });

  // ── UNLOCKED VALUES ────────────────────────────────────────

  describe("getUnlockedValues", () => {
    it("returns only unlocked anchor types", () => {
      const unlocked = getUnlockedValues("anchor");
      expect(unlocked.length).toBeGreaterThanOrEqual(2); // follow-mothership + fixed
      expect(unlocked.every((v) => v.unlocked)).toBe(true);
    });

    it("returns only unlocked action types", () => {
      const unlocked = getUnlockedValues("action");
      expect(unlocked.some((v) => v.id === "mine")).toBe(true);
      expect(unlocked.some((v) => v.id === "attack")).toBe(true);
      // intercept is locked
      expect(unlocked.some((v) => v.id === "intercept")).toBe(false);
    });
  });

  // ── DEAD DRONES ────────────────────────────────────────────

  describe("edge cases", () => {
    it("dead drones return no action", () => {
      const drone = createDrone();
      drone.state = "destroyed";
      drone.stats.hull = 0;
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "mine", retreat: "cargo-full" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 0, z: 0 }, makeCtx());
      expect(result.type).toBe("none");
    });

    it("no targets returns null target without crashing", () => {
      const drone = createDrone({ type: "offensive" });
      drone.state = "active";
      const routine = { anchor: "follow-mothership", range: 200, priority: "nearest", action: "attack", retreat: "health-low" };
      const result = evaluateRoutine(drone, routine, { x: 0, y: 0, z: 0 }, makeCtx());
      expect(result.target).toBeNull();
      expect(result.retreating).toBe(false);
    });
  });
});
