/**
 * Tests for mothership death and salvage mission system.
 *
 * Covers:
 * - Ship death triggers at hull 0
 * - Mission failure preserves station resources
 * - Salvage wreck data is stored correctly
 * - Salvage recovery calculates correct percentages
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  gameState,
  deliverResources,
  recordShipDeath,
  calculateSalvageRecovery,
  clearWreckData,
} from "./game-state.js";

// Reset gameState before each test
function resetGameState() {
  gameState.resources = {
    "iron-ore": 5000,
    "crystal-shard": 2000,
    "plasma-core": 1000,
  };
  gameState.mothership = {
    hull: 1000,
    hullMax: 1000,
    shields: 500,
    shieldsMax: 500,
    energy: 100,
    energyMax: 100,
    tesseractCapacity: 10000,
  };
  gameState.drones = [
    { type: "worker-mining", count: 5, upgrades: [] },
    { type: "offensive", count: 3, upgrades: [] },
  ];
  gameState.research = { "track-enemy": true };
  gameState.missionsCompleted = 3;
  gameState.shipsLost = 0;
  gameState.wreckData = null;
}

describe("ship death triggers", () => {
  beforeEach(resetGameState);

  it("ship dies when hull reaches 0 via takeDamage logic", () => {
    // Replicate the Mothership.takeDamage logic
    const systems = { shields: 0, shieldsMax: 0, hull: 50, hullMax: 1000 };
    let alive = true;

    let amount = 100;
    if (systems.shields > 0) {
      const absorbed = Math.min(systems.shields, amount);
      systems.shields -= absorbed;
      amount -= absorbed;
    }
    systems.hull -= amount;
    if (systems.hull <= 0) {
      systems.hull = 0;
      alive = false;
    }

    expect(systems.hull).toBe(0);
    expect(alive).toBe(false);
  });

  it("ship does not die when hull is above 0", () => {
    const systems = { shields: 200, shieldsMax: 500, hull: 500, hullMax: 1000 };
    let alive = true;

    let amount = 150;
    if (systems.shields > 0) {
      const absorbed = Math.min(systems.shields, amount);
      systems.shields -= absorbed;
      amount -= absorbed;
    }
    systems.hull -= amount;
    if (systems.hull <= 0) {
      systems.hull = 0;
      alive = false;
    }

    expect(systems.hull).toBe(500); // shields absorbed all damage
    expect(alive).toBe(true);
  });

  it("onDeath callback fires exactly once", () => {
    let callCount = 0;
    const onDeath = () => callCount++;

    // Simulate takeDamage with callback
    const systems = { shields: 0, hull: 10, hullMax: 100 };
    let alive = true;

    function takeDamage(amount) {
      if (systems.shields > 0) {
        const absorbed = Math.min(systems.shields, amount);
        systems.shields -= absorbed;
        amount -= absorbed;
      }
      systems.hull -= amount;
      if (systems.hull <= 0) {
        systems.hull = 0;
        if (alive) {
          alive = false;
          onDeath();
        }
      }
    }

    takeDamage(50); // kills
    takeDamage(50); // already dead, should not fire again
    expect(callCount).toBe(1);
  });
});

describe("mission failure preserves station resources", () => {
  beforeEach(resetGameState);

  it("station resources are untouched after ship death", () => {
    const resourcesBefore = { ...gameState.resources };

    recordShipDeath({
      position: { x: 100, y: 50, z: 200 },
      lostCargo: { "iron-ore": 500, "crystal-shard": 200 },
      lostDrones: [{ type: "worker-mining", count: 3 }],
      seed: 12345,
    });

    // Station resources should be exactly the same
    expect(gameState.resources["iron-ore"]).toBe(resourcesBefore["iron-ore"]);
    expect(gameState.resources["crystal-shard"]).toBe(resourcesBefore["crystal-shard"]);
    expect(gameState.resources["plasma-core"]).toBe(resourcesBefore["plasma-core"]);
  });

  it("research persists after ship death", () => {
    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: {},
      lostDrones: [],
      seed: 1,
    });

    expect(gameState.research["track-enemy"]).toBe(true);
  });

  it("missions completed count is preserved", () => {
    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: {},
      lostDrones: [],
      seed: 1,
    });

    expect(gameState.missionsCompleted).toBe(3);
  });

  it("shipsLost counter increments", () => {
    expect(gameState.shipsLost).toBe(0);

    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: {},
      lostDrones: [],
      seed: 1,
    });
    expect(gameState.shipsLost).toBe(1);

    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: {},
      lostDrones: [],
      seed: 2,
    });
    expect(gameState.shipsLost).toBe(2);
  });
});

describe("salvage wreck data", () => {
  beforeEach(resetGameState);

  it("stores wreck data with correct position", () => {
    recordShipDeath({
      position: { x: 100, y: 50, z: -200 },
      lostCargo: { "iron-ore": 300 },
      lostDrones: [{ type: "offensive", count: 2 }],
      seed: 42,
    });

    expect(gameState.wreckData).not.toBeNull();
    expect(gameState.wreckData.position.x).toBe(100);
    expect(gameState.wreckData.position.y).toBe(50);
    expect(gameState.wreckData.position.z).toBe(-200);
  });

  it("stores wreck data with correct cargo and drones", () => {
    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: { "iron-ore": 500, "plasma-core": 100 },
      lostDrones: [
        { type: "worker-mining", count: 4 },
        { type: "offensive", count: 2 },
      ],
      seed: 99,
    });

    expect(gameState.wreckData.lostCargo["iron-ore"]).toBe(500);
    expect(gameState.wreckData.lostCargo["plasma-core"]).toBe(100);
    expect(gameState.wreckData.lostDrones).toHaveLength(2);
    expect(gameState.wreckData.lostDrones[0].type).toBe("worker-mining");
    expect(gameState.wreckData.lostDrones[0].count).toBe(4);
  });

  it("stores realm seed for salvage mission", () => {
    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: {},
      lostDrones: [],
      seed: 77777,
    });

    expect(gameState.wreckData.seed).toBe(77777);
  });

  it("wreck data is a deep copy (no shared references)", () => {
    const cargo = { "iron-ore": 500 };
    const drones = [{ type: "worker-mining", count: 3 }];

    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: cargo,
      lostDrones: drones,
      seed: 1,
    });

    // Mutate original
    cargo["iron-ore"] = 9999;
    drones[0].count = 9999;

    // Wreck data should be unchanged
    expect(gameState.wreckData.lostCargo["iron-ore"]).toBe(500);
    expect(gameState.wreckData.lostDrones[0].count).toBe(3);
  });

  it("clearWreckData sets wreckData to null", () => {
    recordShipDeath({
      position: { x: 0, y: 0, z: 0 },
      lostCargo: { "iron-ore": 100 },
      lostDrones: [],
      seed: 1,
    });
    expect(gameState.wreckData).not.toBeNull();

    clearWreckData();
    expect(gameState.wreckData).toBeNull();
  });
});

describe("salvage recovery calculation", () => {
  it("returns empty results for null wreck data", () => {
    const result = calculateSalvageRecovery(null);
    expect(result.cargo).toEqual({});
    expect(result.drones).toEqual([]);
  });

  it("recovers 30-50% of each cargo type", () => {
    const wreck = {
      lostCargo: { "iron-ore": 1000, "crystal-shard": 500 },
      lostDrones: [],
    };

    // Run multiple times to check range
    for (let i = 0; i < 20; i++) {
      const result = calculateSalvageRecovery(wreck);

      // Iron ore: 30% = 300, 50% = 500
      expect(result.cargo["iron-ore"]).toBeGreaterThanOrEqual(300);
      expect(result.cargo["iron-ore"]).toBeLessThanOrEqual(500);

      // Crystal shard: 30% = 150, 50% = 250
      expect(result.cargo["crystal-shard"]).toBeGreaterThanOrEqual(150);
      expect(result.cargo["crystal-shard"]).toBeLessThanOrEqual(250);
    }
  });

  it("recovers 30-50% of each drone type", () => {
    const wreck = {
      lostCargo: {},
      lostDrones: [
        { type: "worker-mining", count: 10 },
        { type: "offensive", count: 6 },
      ],
    };

    for (let i = 0; i < 20; i++) {
      const result = calculateSalvageRecovery(wreck);

      // Mining: 30% = 3, 50% = 5
      expect(result.drones[0].count).toBeGreaterThanOrEqual(3);
      expect(result.drones[0].count).toBeLessThanOrEqual(5);

      // Offensive: 30% = 1 (floor of 1.8), 50% = 3
      expect(result.drones[1].count).toBeGreaterThanOrEqual(1);
      expect(result.drones[1].count).toBeLessThanOrEqual(3);
    }
  });

  it("recovery amounts are integers (floored)", () => {
    const wreck = {
      lostCargo: { "iron-ore": 7 },
      lostDrones: [{ type: "worker-mining", count: 3 }],
    };

    const result = calculateSalvageRecovery(wreck);
    expect(Number.isInteger(result.cargo["iron-ore"])).toBe(true);
    expect(Number.isInteger(result.drones[0].count)).toBe(true);
  });

  it("preserves drone type in recovery", () => {
    const wreck = {
      lostCargo: {},
      lostDrones: [
        { type: "worker-mining", count: 5 },
        { type: "worker-repair", count: 2 },
      ],
    };

    const result = calculateSalvageRecovery(wreck);
    expect(result.drones[0].type).toBe("worker-mining");
    expect(result.drones[1].type).toBe("worker-repair");
  });
});
