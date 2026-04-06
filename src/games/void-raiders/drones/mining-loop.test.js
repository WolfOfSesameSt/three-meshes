import { describe, it, expect } from "vitest";
import { FleetManager } from "./fleet-manager.js";
import { Mothership } from "../ship/mothership.js";

describe("mining loop integration", () => {
  it("miners extract resources from deposits and offload to mothership", () => {
    const fm = new FleetManager();
    const mothership = new Mothership();
    mothership.mesh.position.set(0, 50, 0);
    fm.mothership = mothership;

    // Create a single miner
    fm.createStarterFleet(1, 0);
    const shipPos = { x: 0, y: 50, z: 0 };

    // Deploy the miner
    for (let i = 0; i < 10; i++) {
      fm.update(0.2, i * 0.2, shipPos);
    }

    // Place a deposit right next to where the drone is
    const drone = fm.drones[0];
    const deposit = {
      position: { x: drone.position.x + 5, y: drone.position.y, z: drone.position.z + 5 },
      amount: 500,
      maxAmount: 500,
      resourceType: "iron-ore",
      depleted: false,
    };
    fm.context.deposits = [deposit];

    // Run simulation — miner should approach deposit and extract
    for (let i = 0; i < 200; i++) {
      fm.update(0.1, 5 + i * 0.1, shipPos);
    }

    // Drone should have mined something
    // Either cargo > 0 OR it already offloaded to mothership
    const droneHasCargo = drone.cargo > 0;
    const mothershipHasCargo = Object.values(mothership.tesseract.contents).reduce((a, b) => a + b, 0) > 0;
    const depositPartiallyMined = deposit.amount < 500;

    expect(depositPartiallyMined || droneHasCargo || mothershipHasCargo).toBe(true);
  });

  it("miners return to mothership when cargo full", () => {
    const fm = new FleetManager();
    const mothership = new Mothership();
    mothership.mesh.position.set(0, 50, 0);
    fm.mothership = mothership;

    fm.createStarterFleet(1, 0);
    const shipPos = { x: 0, y: 50, z: 0 };

    // Deploy
    for (let i = 0; i < 10; i++) {
      fm.update(0.2, i * 0.2, shipPos);
    }

    // Manually fill drone cargo to trigger retreat
    const drone = fm.drones[0];
    drone.cargo = drone.stats.cargoCapacity;
    drone._lastMinedType = "iron-ore";

    // Run — should return to mothership and offload
    for (let i = 0; i < 100; i++) {
      fm.update(0.1, 5 + i * 0.1, shipPos);
    }

    // After offloading, cargo should be 0 and mothership should have resources
    const shipCargo = mothership.tesseract.contents["iron-ore"] ?? 0;
    expect(shipCargo).toBeGreaterThan(0);
    expect(drone.cargo).toBe(0);
  });

  it("mothership storeResource caps at tesseract capacity", () => {
    const mothership = new Mothership();
    // Default capacity is 10000
    const stored1 = mothership.storeResource("iron-ore", 8000);
    expect(stored1).toBe(8000);

    const stored2 = mothership.storeResource("crystal-shard", 5000);
    expect(stored2).toBe(2000); // only 2000 space left

    const total = Object.values(mothership.tesseract.contents).reduce((a, b) => a + b, 0);
    expect(total).toBe(10000);
  });
});
