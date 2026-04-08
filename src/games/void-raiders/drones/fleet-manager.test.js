import { describe, it, expect } from "vitest";
import { FleetManager } from "./fleet-manager.js";
import { RETREAT_TYPES } from "./routine.js";
import { RepairBay } from "../ship/repair-bay.js";

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

// ── Repair bay integration ───────────────────────────────────
//
// These tests drive the damaged-retreat flow through the full update()
// loop against a stub mothership. We build a minimal mothership-like
// object (no Three.js, no glTF, no bays[] — which pushes drones down
// the "fallback: fly directly to ship center" branch in update()).

function makeStubMothership() {
  return {
    alive: true,
    bays: [], // empty triggers the no-bay fallback in _returnViaBay
    position: { x: 0, y: 50, z: 0 },
    systems: { energy: 100, energyMax: 100, hull: 1000, hullMax: 1000, shields: 500, shieldsMax: 500 },
    tesseract: { capacity: 10000, contents: { "iron-ore": 1000 } },
    storeResource(type, amount) {
      this.tesseract.contents[type] = (this.tesseract.contents[type] || 0) + amount;
      return amount; // accept all cargo
    },
    get repairBayRef() { return this.repairBay; },
  };
}

describe("FleetManager — repair bay routing", () => {
  it("damaged drones admitted into repairBay.active after reaching the ship", () => {
    // Keep the routine's "damaged" retreat unlocked for the duration of
    // this test suite — it defaults to locked.
    const prevDamagedUnlocked = RETREAT_TYPES.damaged.unlocked;
    RETREAT_TYPES.damaged.unlocked = true;

    try {
      const fm = new FleetManager();
      fm.createStarterFleet(0, 1); // one offensive drone
      const ship = makeStubMothership();
      ship.repairBay = new RepairBay(ship);
      fm.mothership = ship;
      // Flip the swarm to the damaged retreat
      // fighterSwarm is swarms[1] (minerSwarm is pushed first in
       // createStarterFleet, even when miner count is 0).
       fm.swarms[1].routine.retreat = "damaged";

      // Deploy the drone fully
      for (let i = 0; i < 15; i++) fm.update(0.2, i * 0.2, ship.position);

      // Damage the drone past the 50% hull threshold and teleport it
      // next to the ship so the dock handler fires this frame.
      const drone = fm.drones[0];
      drone.stats.hull = drone.stats.hullMax * 0.3;
      drone.position = { x: ship.position.x, y: ship.position.y, z: ship.position.z };

      // A few ticks — routine evaluates, retreat triggers, drone is
      // already in the offload range, _handleDocked runs.
      for (let i = 0; i < 3; i++) fm.update(0.1, 10 + i * 0.1, ship.position);

      expect(ship.repairBay.active).toContain(drone);
      expect(drone.state).toBe("in-repair");
      expect(drone._retreatReason).toBe("damaged");
      expect(fm.routineMetrics?.retreats?.damaged ?? 0).toBeGreaterThanOrEqual(1);
    } finally {
      RETREAT_TYPES.damaged.unlocked = prevDamagedUnlocked;
    }
  });

  it("repaired drones flip back to state=active and leave the bay", () => {
    const prevDamagedUnlocked = RETREAT_TYPES.damaged.unlocked;
    RETREAT_TYPES.damaged.unlocked = true;

    try {
      const fm = new FleetManager();
      fm.createStarterFleet(0, 1);
      const ship = makeStubMothership();
      ship.repairBay = new RepairBay(ship);
      fm.mothership = ship;
      // fighterSwarm is swarms[1] (minerSwarm is pushed first in
       // createStarterFleet, even when miner count is 0).
       fm.swarms[1].routine.retreat = "damaged";

      // Deploy + dock the drone (damaged + teleported)
      for (let i = 0; i < 15; i++) fm.update(0.2, i * 0.2, ship.position);
      const drone = fm.drones[0];
      drone.stats.hull = drone.stats.hullMax * 0.3;
      drone.stats.shields = 0;
      drone.position = { ...ship.position };
      for (let i = 0; i < 3; i++) fm.update(0.1, 10 + i * 0.1, ship.position);
      expect(ship.repairBay.active).toContain(drone);

      // Run enough update ticks for the repair to complete. RepairBay
      // tick is called once per FleetManager.update(), so we need enough
      // frames to cover ~hullMax/hullRepairRate seconds of game time.
      for (let i = 0; i < 200; i++) fm.update(0.1, 20 + i * 0.1, ship.position);

      expect(ship.repairBay.active).not.toContain(drone);
      expect(ship.repairBay.queue).not.toContain(drone);
      expect(drone.state).toBe("active");
      expect(drone.stats.hull).toBe(drone.stats.hullMax);
      expect(drone._retreatReason).toBeNull();
      expect(ship.repairBay.metrics.completed).toBe(1);
    } finally {
      RETREAT_TYPES.damaged.unlocked = prevDamagedUnlocked;
    }
  });

  it("cargo-full retreating miners are NOT admitted to the repair bay", () => {
    const fm = new FleetManager();
    fm.createStarterFleet(1, 0); // miner, default routine has retreat=cargo-full
    const ship = makeStubMothership();
    ship.repairBay = new RepairBay(ship);
    fm.mothership = ship;

    // Deploy
    for (let i = 0; i < 15; i++) fm.update(0.2, i * 0.2, ship.position);
    const drone = fm.drones[0];
    drone.cargo = drone.stats.cargoCapacity;
    drone.position = { ...ship.position };

    // Tick — drone hits dock range, offloads, but must NOT go into the bay
    for (let i = 0; i < 3; i++) fm.update(0.1, 10 + i * 0.1, ship.position);

    expect(ship.repairBay.active).not.toContain(drone);
    expect(ship.repairBay.queue).not.toContain(drone);
    expect(drone.state).toBe("active");
    // Cargo was offloaded
    expect(drone.cargo).toBe(0);
    // Telemetry counter fired for cargo-full, not damaged
    expect(fm.routineMetrics?.retreats?.["cargo-full"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(fm.routineMetrics?.retreats?.damaged ?? 0).toBe(0);
  });

  it("routineMetrics.retreats.damaged increments on first trigger", () => {
    const prevDamagedUnlocked = RETREAT_TYPES.damaged.unlocked;
    RETREAT_TYPES.damaged.unlocked = true;

    try {
      const fm = new FleetManager();
      fm.createStarterFleet(0, 1);
      const ship = makeStubMothership();
      ship.repairBay = new RepairBay(ship);
      fm.mothership = ship;
      // fighterSwarm is swarms[1] (minerSwarm is pushed first in
       // createStarterFleet, even when miner count is 0).
       fm.swarms[1].routine.retreat = "damaged";

      for (let i = 0; i < 15; i++) fm.update(0.2, i * 0.2, ship.position);

      // Move the drone FAR away so it doesn't instantly dock — we want to
      // check the routineMetrics counter bumps on trigger, not on dock.
      const drone = fm.drones[0];
      drone.position = { x: 500, y: 50, z: 500 };
      drone.stats.hull = drone.stats.hullMax * 0.3;
      drone.stats.shields = 0;

      fm.update(0.1, 10, ship.position);

      expect(fm.routineMetrics.retreats.damaged).toBeGreaterThanOrEqual(1);
      expect(drone._retreatReason).toBe("damaged");
      // Drone is returning, not yet admitted
      expect(drone.state).toBe("returning");
      expect(ship.repairBay.active).not.toContain(drone);
    } finally {
      RETREAT_TYPES.damaged.unlocked = prevDamagedUnlocked;
    }
  });
});
