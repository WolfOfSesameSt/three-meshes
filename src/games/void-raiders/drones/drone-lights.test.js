/**
 * Tests for drone light pool renderer — verifies light disc count
 * matches alive drone count and handles edge cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock terrain height before importing DroneLightRenderer
vi.mock("../realm/terrain.js", () => ({
  getTerrainHeight: vi.fn(() => 5),
}));

const { DroneLightRenderer } = await import("./drone-lights.js");

function makeDrone(overrides = {}) {
  return {
    type: "worker-mining",
    state: "active",
    position: { x: 0, y: 30, z: 0 },
    ...overrides,
  };
}

// Mock scene
function makeScene() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
  };
}

describe("DroneLightRenderer", () => {
  let scene;

  beforeEach(() => {
    scene = makeScene();
  });

  it("creates instanced mesh on construction", () => {
    const renderer = new DroneLightRenderer(scene);
    expect(scene.add).toHaveBeenCalled();
    expect(renderer.mesh).toBeDefined();
    expect(renderer.mesh.count).toBe(0);
    renderer.dispose();
  });

  it("light disc count matches alive drone count", () => {
    const renderer = new DroneLightRenderer(scene);
    const drones = [
      makeDrone({ position: { x: 0, y: 30, z: 0 } }),
      makeDrone({ position: { x: 10, y: 25, z: 10 } }),
      makeDrone({ position: { x: 20, y: 35, z: 20 } }),
    ];

    const count = renderer.update(drones);
    expect(count).toBe(3);
    expect(renderer.mesh.count).toBe(3);
    renderer.dispose();
  });

  it("excludes destroyed drones", () => {
    const renderer = new DroneLightRenderer(scene);
    const drones = [
      makeDrone({ state: "active" }),
      makeDrone({ state: "destroyed" }),
      makeDrone({ state: "active" }),
    ];

    const count = renderer.update(drones);
    expect(count).toBe(2);
    renderer.dispose();
  });

  it("returns zero for empty drone list", () => {
    const renderer = new DroneLightRenderer(scene);
    const count = renderer.update([]);
    expect(count).toBe(0);
    expect(renderer.mesh.count).toBe(0);
    renderer.dispose();
  });

  it("excludes drones above MAX_HEIGHT", () => {
    const renderer = new DroneLightRenderer(scene);
    // Terrain height is mocked to 5, so terrainY = 5 * 4 = 20
    // Drone at y=200 is 180m above terrain, which is > MAX_HEIGHT (120)
    const drones = [
      makeDrone({ position: { x: 0, y: 200, z: 0 } }),
    ];

    const count = renderer.update(drones);
    expect(count).toBe(0);
    renderer.dispose();
  });

  it("disposes cleanly", () => {
    const renderer = new DroneLightRenderer(scene);
    renderer.dispose();
    expect(scene.remove).toHaveBeenCalled();
  });
});
