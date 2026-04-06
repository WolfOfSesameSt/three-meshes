import { describe, it, expect } from "vitest";
import { createSwarm, addDroneToSwarm, removeDroneFromSwarm, getAliveDrones, updateSwarmAnchor } from "./swarm.js";
import { createDrone } from "./drone.js";

describe("swarm", () => {
  it("creates swarm with default routine", () => {
    const s = createSwarm();
    expect(s.routine.anchor).toBe("follow-mothership");
    expect(s.routine.range).toBe(200);
    expect(s.drones).toHaveLength(0);
  });

  it("creates swarm with custom routine", () => {
    const s = createSwarm({ routine: { action: "attack", range: 300 } });
    expect(s.routine.action).toBe("attack");
    expect(s.routine.range).toBe(300);
    expect(s.routine.anchor).toBe("follow-mothership"); // default preserved
  });

  it("adds and removes drones", () => {
    const s = createSwarm();
    const d1 = createDrone();
    const d2 = createDrone();

    addDroneToSwarm(s, d1);
    addDroneToSwarm(s, d2);
    expect(s.drones).toHaveLength(2);
    expect(d1.swarmId).toBe(s.id);

    removeDroneFromSwarm(s, d1);
    expect(s.drones).toHaveLength(1);
    expect(d1.swarmId).toBeNull();
  });

  it("getAliveDrones filters destroyed", () => {
    const s = createSwarm();
    const d1 = createDrone();
    const d2 = createDrone();
    d2.state = "destroyed";

    addDroneToSwarm(s, d1);
    addDroneToSwarm(s, d2);
    expect(getAliveDrones(s)).toHaveLength(1);
  });

  it("updateSwarmAnchor follows mothership", () => {
    const s = createSwarm({ routine: { anchor: "follow-mothership" } });
    updateSwarmAnchor(s, { x: 100, y: 50, z: 200 });
    expect(s.anchorPosition.x).toBe(100);
    expect(s.anchorPosition.y).toBe(50);
    expect(s.anchorPosition.z).toBe(200);
  });

  it("updateSwarmAnchor fixed stays put", () => {
    const s = createSwarm({ routine: { anchor: "fixed" } });
    s.anchorPosition = { x: 10, y: 20, z: 30 };
    updateSwarmAnchor(s, { x: 999, y: 999, z: 999 });
    expect(s.anchorPosition.x).toBe(10);
  });
});
