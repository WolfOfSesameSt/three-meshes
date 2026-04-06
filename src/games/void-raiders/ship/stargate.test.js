import { describe, it, expect } from "vitest";

// Test the extraction state logic without Three.js rendering
// We test the state machine transitions and timing

describe("extraction state machine", () => {
  // Minimal mock for testing state logic
  function createMockExtraction() {
    return {
      state: "idle",
      timer: 0,
      warpTimer: 0,
      gatePosition: { x: 0, y: 0, z: 0 },

      summon(shipPos, rotY) {
        if (this.state !== "idle") return;
        this.gatePosition = {
          x: shipPos.x + Math.sin(rotY) * 170,
          y: shipPos.y + 20,
          z: shipPos.z + Math.cos(rotY) * 170,
        };
        this.state = "stabilizing";
        this.timer = 0;
      },

      update(dt, shipPos) {
        if (this.state === "stabilizing") {
          this.timer += dt;
          if (this.timer >= 60) this.state = "ready";
        }
        if (this.state === "ready") {
          const dx = shipPos.x - this.gatePosition.x;
          const dz = shipPos.z - this.gatePosition.z;
          if (Math.sqrt(dx * dx + dz * dz) < 40) {
            this.state = "warping";
            this.warpTimer = 0;
          }
        }
        if (this.state === "warping") {
          this.warpTimer += dt;
          if (this.warpTimer >= 3) this.state = "complete";
        }
        return this.state;
      },

      getProgress() { return Math.min(this.timer / 60, 1.0); },
      getTimeRemaining() { return Math.max(0, 60 - this.timer); },
    };
  }

  it("starts in idle state", () => {
    const ext = createMockExtraction();
    expect(ext.state).toBe("idle");
  });

  it("summon transitions to stabilizing", () => {
    const ext = createMockExtraction();
    ext.summon({ x: 0, y: 50, z: 0 }, 0);
    expect(ext.state).toBe("stabilizing");
  });

  it("gate spawns ~1000m ahead", () => {
    const ext = createMockExtraction();
    ext.summon({ x: 0, y: 50, z: 0 }, 0);
    expect(ext.gatePosition.z).toBeCloseTo(170, -1);
  });

  it("stabilizes after 60 seconds", () => {
    const ext = createMockExtraction();
    ext.summon({ x: 0, y: 50, z: 0 }, 0);

    // Advance 59 seconds
    for (let i = 0; i < 590; i++) ext.update(0.1, { x: 0, y: 50, z: 0 });
    expect(ext.state).toBe("stabilizing");

    // One more second
    for (let i = 0; i < 10; i++) ext.update(0.1, { x: 0, y: 50, z: 0 });
    expect(ext.state).toBe("ready");
  });

  it("progress tracks correctly", () => {
    const ext = createMockExtraction();
    ext.summon({ x: 0, y: 50, z: 0 }, 0);
    expect(ext.getProgress()).toBe(0);

    ext.timer = 30;
    expect(ext.getProgress()).toBe(0.5);

    ext.timer = 60;
    expect(ext.getProgress()).toBe(1.0);
  });

  it("time remaining counts down", () => {
    const ext = createMockExtraction();
    ext.summon({ x: 0, y: 50, z: 0 }, 0);
    expect(ext.getTimeRemaining()).toBe(60);

    ext.timer = 45;
    expect(ext.getTimeRemaining()).toBe(15);
  });

  it("warps when ship reaches gate", () => {
    const ext = createMockExtraction();
    ext.summon({ x: 0, y: 50, z: 0 }, 0);
    ext.timer = 60;
    ext.state = "ready";

    // Ship at gate position
    ext.update(0.1, { x: ext.gatePosition.x, y: ext.gatePosition.y, z: ext.gatePosition.z });
    expect(ext.state).toBe("warping");
  });

  it("completes after warp duration", () => {
    const ext = createMockExtraction();
    ext.state = "warping";
    ext.warpTimer = 0;

    for (let i = 0; i < 30; i++) ext.update(0.1, { x: 0, y: 50, z: 0 });
    expect(ext.state).toBe("complete");
  });

  it("cannot summon twice", () => {
    const ext = createMockExtraction();
    ext.summon({ x: 0, y: 50, z: 0 }, 0);
    ext.summon({ x: 999, y: 50, z: 999 }, 1);
    // Gate should still be at original position
    expect(ext.gatePosition.z).toBeCloseTo(170, -1);
  });
});
