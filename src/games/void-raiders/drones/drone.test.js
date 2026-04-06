import { describe, it, expect } from "vitest";
import { createDrone, isDroneAlive, damageDrone } from "./drone.js";

describe("drone", () => {
  it("creates mining drone with correct defaults", () => {
    const d = createDrone({ type: "worker-mining" });
    expect(d.type).toBe("worker-mining");
    expect(d.stats.hull).toBe(40);
    expect(d.stats.miningRate).toBe(5);
    expect(d.state).toBe("idle");
    expect(d.upgradeSlots).toBe(2);
  });

  it("creates offensive drone with combat stats", () => {
    const d = createDrone({ type: "offensive" });
    expect(d.stats.damage).toBe(10);
    expect(d.stats.range).toBe(200);
    expect(d.stats.hull).toBe(60);
  });

  it("generates unique IDs", () => {
    const a = createDrone();
    const b = createDrone();
    expect(a.id).not.toBe(b.id);
  });

  it("isDroneAlive returns true for healthy drone", () => {
    const d = createDrone();
    expect(isDroneAlive(d)).toBe(true);
  });

  it("isDroneAlive returns false for destroyed drone", () => {
    const d = createDrone();
    d.state = "destroyed";
    expect(isDroneAlive(d)).toBe(false);
  });

  it("damageDrone absorbs with shields first", () => {
    const d = createDrone({ type: "offensive" }); // hull 60, shields 20
    damageDrone(d, 25);
    expect(d.stats.shields).toBe(0); // 20 shields absorbed
    expect(d.stats.hull).toBe(55);   // 5 remaining damage to hull
    expect(isDroneAlive(d)).toBe(true);
  });

  it("damageDrone goes straight to hull with no shields", () => {
    const d = createDrone({ type: "worker-mining" }); // hull 40, shields 0
    damageDrone(d, 15);
    expect(d.stats.hull).toBe(25);
  });

  it("damageDrone destroys drone at zero hull", () => {
    const d = createDrone({ type: "worker-mining" }); // hull 40, shields 0
    damageDrone(d, 50);
    expect(d.stats.hull).toBe(0);
    expect(d.state).toBe("destroyed");
    expect(isDroneAlive(d)).toBe(false);
  });
});
