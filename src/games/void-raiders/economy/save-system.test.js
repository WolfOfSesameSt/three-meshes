import { describe, it, expect, beforeEach } from "vitest";
import { serializeState, deserializeState } from "./save-system.js";
import { gameState } from "./game-state.js";

describe("save system", () => {
  beforeEach(() => {
    // Reset to known state
    gameState.resources = { "iron-ore": 1000, "crystal-shard": 500 };
    gameState.mothership = { hull: 1000, hullMax: 1000, shields: 500, shieldsMax: 500, energy: 100, energyMax: 100, tesseractCapacity: 10000 };
    gameState.drones = [{ type: "worker-mining", count: 5 }, { type: "offensive", count: 3 }];
    gameState.research = { "track-enemy": true };
    gameState.missionsCompleted = 7;
  });

  it("serializes game state", () => {
    const save = serializeState();
    expect(save.version).toBe(1);
    expect(save.resources["iron-ore"]).toBe(1000);
    expect(save.mothership.hullMax).toBe(1000);
    expect(save.drones).toHaveLength(2);
    expect(save.missionsCompleted).toBe(7);
    expect(save.savedAt).toBeDefined();
  });

  it("deserializes back to game state", () => {
    const save = serializeState();

    // Mutate game state
    gameState.resources = {};
    gameState.missionsCompleted = 0;

    // Restore
    const success = deserializeState(save);
    expect(success).toBe(true);
    expect(gameState.resources["iron-ore"]).toBe(1000);
    expect(gameState.missionsCompleted).toBe(7);
  });

  it("rejects invalid save version", () => {
    const save = serializeState();
    save.version = 999;
    const success = deserializeState(save);
    expect(success).toBe(false);
  });

  it("rejects null save", () => {
    expect(deserializeState(null)).toBe(false);
  });

  it("serialized data is a deep copy (no references)", () => {
    const save = serializeState();
    save.resources["iron-ore"] = 9999;
    expect(gameState.resources["iron-ore"]).toBe(1000); // unchanged
  });

  it("preserves drone fleet structure", () => {
    const save = serializeState();
    gameState.drones = [];
    deserializeState(save);
    expect(gameState.drones).toHaveLength(2);
    expect(gameState.drones[0].type).toBe("worker-mining");
    expect(gameState.drones[0].count).toBe(5);
  });

  it("preserves research unlocks", () => {
    const save = serializeState();
    gameState.research = {};
    deserializeState(save);
    expect(gameState.research["track-enemy"]).toBe(true);
  });
});
