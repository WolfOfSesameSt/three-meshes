import { describe, it, expect } from "vitest";
import { FleetManager } from "./fleet-manager.js";

describe("FleetManager", () => {
  it("creates starter fleet with correct counts", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(5, 3);
    expect(fm.drones).toHaveLength(8);
    expect(fm.swarms).toHaveLength(2);

    const miners = fm.drones.filter((d) => d.type === "worker-mining");
    const fighters = fm.drones.filter((d) => d.type === "offensive");
    expect(miners).toHaveLength(5);
    expect(fighters).toHaveLength(3);
  });

  it("drones start in deploying state", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(3, 2);
    expect(fm.drones.every((d) => d.state === "deploying")).toBe(true);
  });

  it("deploys drones over time", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(3, 0);
    const shipPos = { x: 0, y: 50, z: 0 };

    for (let i = 0; i < 20; i++) {
      fm.update(0.1, i * 0.1, shipPos);
    }

    const active = fm.drones.filter((d) => d.state !== "deploying");
    expect(active).toHaveLength(3);
  });

  it("deployed drones orbit near mothership", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(1, 0);
    const shipPos = { x: 100, y: 50, z: 200 };

    for (let i = 0; i < 30; i++) {
      fm.update(0.1, i * 0.1, shipPos);
    }

    const drone = fm.drones[0];
    const dist = Math.sqrt(
      (drone.position.x - shipPos.x) ** 2 +
      (drone.position.z - shipPos.z) ** 2
    );
    expect(dist).toBeLessThan(250);
  });

  it("miners retreat when cargo full", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(1, 0);
    const shipPos = { x: 0, y: 50, z: 0 };

    // Deploy the drone
    for (let i = 0; i < 10; i++) {
      fm.update(0.2, i * 0.2, shipPos);
    }

    // Move drone far from mothership so retreat is visible
    fm.drones[0].position = { x: 500, y: 50, z: 500 };
    fm.drones[0].cargo = fm.drones[0].stats.cargoCapacity;
    fm.update(0.1, 5, shipPos);

    expect(fm.drones[0].state).toBe("returning");
  });

  it("fighters attack nearby enemies", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(0, 1);
    const shipPos = { x: 0, y: 50, z: 0 };

    // Deploy
    for (let i = 0; i < 10; i++) {
      fm.update(0.2, i * 0.2, shipPos);
    }

    // Add an enemy in range
    const enemy = { position: { x: 30, y: 50, z: 0 }, stats: { hull: 100, hullMax: 100 } };
    fm.context.enemies = [enemy];

    // Run several ticks — fighter should engage and deal damage
    for (let i = 0; i < 50; i++) {
      fm.update(0.1, 5 + i * 0.1, shipPos);
    }

    expect(enemy.stats.hull).toBeLessThan(100);
  });

  it("getAliveCount returns correct number", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(3, 2);
    expect(fm.getAliveCount()).toBe(5);

    fm.drones[0].stats.hull = 0;
    fm.drones[0].state = "destroyed";
    expect(fm.getAliveCount()).toBe(4);
  });
});
