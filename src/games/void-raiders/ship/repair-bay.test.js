/**
 * Unit tests for RepairBay.
 *
 * These cover every public surface (admit, tick, ejectAll,
 * applyResearchModifiers, reset, getStatus) plus the corner cases
 * called out in the spec: material draw order, exhausting materials
 * mid-tick, energy exhaustion, mothership death, drones that die
 * mid-repair, and research-modifier idempotence.
 *
 * We build a stub mothership object (rather than the real Mothership
 * class) so the test stays focused on RepairBay logic and runs without
 * any THREE.js or glTF loading side-effects.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RepairBay, DEFAULT_REPAIR_CONFIG, makeRepairMetrics } from "./repair-bay.js";
import { createDrone } from "../drones/drone.js";

// ── Fakes ──────────────────────────────────────────────────────

function makeStubMothership(overrides = {}) {
  return {
    alive: true,
    systems: { energy: 100, energyMax: 100 },
    tesseract: { contents: { "iron-ore": 1000 } },
    position: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

function makeDamagedDrone(type = "offensive", { hullFrac = 0.3, shieldFrac = 0 } = {}) {
  const d = createDrone({ type });
  d.state = "active";
  d.stats.hull = d.stats.hullMax * hullFrac;
  if (d.stats.shieldsMax > 0) d.stats.shields = d.stats.shieldsMax * shieldFrac;
  d._retreatReason = "damaged";
  return d;
}

describe("RepairBay.admit", () => {
  it("places a drone in active[] when a slot is free", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    const drone = makeDamagedDrone();

    const ok = bay.admit(drone);

    expect(ok).toBe(true);
    expect(bay.active).toHaveLength(1);
    expect(bay.active[0]).toBe(drone);
    expect(bay.queue).toHaveLength(0);
    expect(drone.state).toBe("in-repair");
    expect(bay.metrics.admitted).toBe(1);
  });

  it("queues additional drones when all slots are full", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    // default slots: 1
    const a = makeDamagedDrone();
    const b = makeDamagedDrone();
    const c = makeDamagedDrone();

    expect(bay.admit(a)).toBe(true);
    expect(bay.admit(b)).toBe(true);
    expect(bay.admit(c)).toBe(true);

    expect(bay.active).toEqual([a]);
    expect(bay.queue).toEqual([b, c]);
    expect(bay.metrics.admitted).toBe(3);
    // All three drones should be flagged "in-repair" regardless of which
    // list they landed in — the bay owns their state.
    expect(a.state).toBe("in-repair");
    expect(b.state).toBe("in-repair");
    expect(c.state).toBe("in-repair");
  });

  it("rejects destroyed drones", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    const dead = createDrone({ type: "offensive" });
    dead.state = "destroyed";
    dead.stats.hull = 0;

    expect(bay.admit(dead)).toBe(false);
    expect(bay.active).toHaveLength(0);
    expect(bay.metrics.admitted).toBe(0);
  });

  it("rejects drones already in the bay (active or queue)", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    const drone = makeDamagedDrone();

    expect(bay.admit(drone)).toBe(true);
    // Second admit of the same reference must be a no-op.
    expect(bay.admit(drone)).toBe(false);
    expect(bay.active).toHaveLength(1);
    expect(bay.queue).toHaveLength(0);
    expect(bay.metrics.admitted).toBe(1);

    // Now fill the slot with another drone, then try to re-admit one
    // already in the queue.
    const second = makeDamagedDrone();
    expect(bay.admit(second)).toBe(true); // goes to queue
    expect(bay.admit(second)).toBe(false); // already queued
    expect(bay.queue).toHaveLength(1);
  });

  it("returns false when given null / undefined", () => {
    const bay = new RepairBay(makeStubMothership());
    expect(bay.admit(null)).toBe(false);
    expect(bay.admit(undefined)).toBe(false);
  });
});

describe("RepairBay.tick — hull restoration", () => {
  it("repairs hull by drawing iron-ore first from the tesseract", () => {
    const ship = makeStubMothership({
      tesseract: { contents: { "iron-ore": 1000, "titanium-ore": 1000 } },
    });
    const bay = new RepairBay(ship);
    const drone = makeDamagedDrone("offensive", { hullFrac: 0.3, shieldFrac: 1 });
    const startHull = drone.stats.hull;
    bay.admit(drone);

    bay.tick(1.0); // 1 second

    // At 8 HP/s with full access to materials, drone should gain 8 hull.
    const expectedHullGain = DEFAULT_REPAIR_CONFIG.hullRepairRate * 1.0;
    expect(drone.stats.hull).toBeCloseTo(startHull + expectedHullGain, 5);

    // Materials consumed = 8 hull * 0.08 material/hull = 0.64 iron-ore.
    const expectedMatSpend =
      expectedHullGain * DEFAULT_REPAIR_CONFIG.materialCostPerHullPoint;
    expect(ship.tesseract.contents["iron-ore"]).toBeCloseTo(1000 - expectedMatSpend, 5);
    // Titanium is second in priority — should still be full.
    expect(ship.tesseract.contents["titanium-ore"]).toBe(1000);

    expect(bay.metrics.totalHullRestored).toBeCloseTo(expectedHullGain, 5);
    expect(bay.metrics.totalMaterialsSpent).toBeCloseTo(expectedMatSpend, 5);
  });

  it("falls through the transmute priority list once iron is gone", () => {
    // Give just enough iron to be drained in the first sub-second, then
    // check the bay rolls over to titanium-ore on the same tick.
    const ship = makeStubMothership({
      tesseract: { contents: { "iron-ore": 0.2, "titanium-ore": 1000 } },
    });
    const bay = new RepairBay(ship);
    const drone = makeDamagedDrone("offensive", { hullFrac: 0.3, shieldFrac: 1 });
    bay.admit(drone);

    bay.tick(1.0);

    // Iron-ore must be fully drained
    expect(ship.tesseract.contents["iron-ore"]).toBeCloseTo(0, 5);
    // Total spend should equal 8 HP * 0.08 = 0.64 units across both stocks
    const expectedSpend =
      DEFAULT_REPAIR_CONFIG.hullRepairRate * DEFAULT_REPAIR_CONFIG.materialCostPerHullPoint;
    expect(bay.metrics.totalMaterialsSpent).toBeCloseTo(expectedSpend, 5);
    // Titanium absorbed the remainder (0.64 - 0.2 = 0.44)
    expect(ship.tesseract.contents["titanium-ore"]).toBeCloseTo(1000 - (expectedSpend - 0.2), 5);
  });

  it("stops hull repair when ALL transmute materials are exhausted", () => {
    const ship = makeStubMothership({
      // Empty tesseract — no hull repair is possible.
      tesseract: { contents: {} },
    });
    const bay = new RepairBay(ship);
    const drone = makeDamagedDrone("offensive", { hullFrac: 0.3, shieldFrac: 0 });
    const startHull = drone.stats.hull;
    bay.admit(drone);

    bay.tick(1.0);

    // Hull should NOT have increased
    expect(drone.stats.hull).toBe(startHull);
    expect(bay.metrics.totalHullRestored).toBe(0);
    expect(bay.metrics.totalMaterialsSpent).toBe(0);
    // No NaN / infinity leaked in
    expect(Number.isFinite(drone.stats.hull)).toBe(true);

    // But shield repair should still run independently — offensive drones
    // have 20 shield max and the ship still has 100 energy.
    expect(drone.stats.shields).toBeGreaterThan(0);
    expect(bay.metrics.totalShieldsRestored).toBeGreaterThan(0);
    expect(bay.metrics.totalEnergySpent).toBeGreaterThan(0);
  });
});

describe("RepairBay.tick — shield restoration", () => {
  it("restores shields using mothership energy", () => {
    const ship = makeStubMothership({
      systems: { energy: 100, energyMax: 100 },
      tesseract: { contents: { "iron-ore": 1000 } },
    });
    const bay = new RepairBay(ship);
    const drone = makeDamagedDrone("offensive", { hullFrac: 1, shieldFrac: 0 });
    bay.admit(drone);

    bay.tick(1.0);

    // Shield rate 14/s — drone only has 20 max shields so it caps at 14.
    const expectedShieldGain = Math.min(
      DEFAULT_REPAIR_CONFIG.shieldRepairRate * 1.0,
      drone.stats.shieldsMax - 0
    );
    expect(drone.stats.shields).toBeCloseTo(expectedShieldGain, 5);

    const expectedEnergy = expectedShieldGain * DEFAULT_REPAIR_CONFIG.energyCostPerShieldPoint;
    expect(100 - ship.systems.energy).toBeCloseTo(expectedEnergy, 5);
    expect(bay.metrics.totalShieldsRestored).toBeCloseTo(expectedShieldGain, 5);
    expect(bay.metrics.totalEnergySpent).toBeCloseTo(expectedEnergy, 5);
  });

  it("stops shield repair when mothership energy is 0", () => {
    const ship = makeStubMothership({
      systems: { energy: 0, energyMax: 100 },
      tesseract: { contents: { "iron-ore": 1000 } },
    });
    const bay = new RepairBay(ship);
    // Damaged hull so we can verify hull repair still runs.
    const drone = makeDamagedDrone("offensive", { hullFrac: 0.3, shieldFrac: 0 });
    const startHull = drone.stats.hull;
    bay.admit(drone);

    bay.tick(1.0);

    // Shields unchanged, no energy spent
    expect(drone.stats.shields).toBe(0);
    expect(bay.metrics.totalShieldsRestored).toBe(0);
    expect(bay.metrics.totalEnergySpent).toBe(0);
    // Hull STILL repaired — independent of energy
    expect(drone.stats.hull).toBeGreaterThan(startHull);
    expect(bay.metrics.totalHullRestored).toBeGreaterThan(0);
  });

  it("does not run shield repair on drones with zero shieldsMax", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    // Worker-mining drones have 0 shieldsMax
    const drone = makeDamagedDrone("worker-mining", { hullFrac: 0.3 });
    bay.admit(drone);

    const startEnergy = ship.systems.energy;
    bay.tick(1.0);

    expect(ship.systems.energy).toBe(startEnergy);
    expect(bay.metrics.totalShieldsRestored).toBe(0);
    expect(bay.metrics.totalEnergySpent).toBe(0);
  });
});

describe("RepairBay.tick — completion + queue promotion", () => {
  it("completes a fully-repaired drone and promotes the next queued drone", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    const a = makeDamagedDrone("offensive", { hullFrac: 0.9, shieldFrac: 0.5 });
    const b = makeDamagedDrone("offensive", { hullFrac: 0.5, shieldFrac: 0 });
    bay.admit(a);
    bay.admit(b); // queued

    // Run a big enough tick to fully heal `a`. With 8 hull/s and 14
    // shields/s the worst case is ~1 second, but we'll just use 5s
    // to be safe; completion clamps, it doesn't overshoot.
    bay.tick(5.0);

    // a should be complete
    expect(bay.active).not.toContain(a);
    expect(a.state).toBe("active");
    expect(a._retreatReason).toBeNull();
    expect(a.stats.hull).toBe(a.stats.hullMax);
    expect(a.stats.shields).toBe(a.stats.shieldsMax);

    // b should have been promoted into the vacated slot
    expect(bay.active).toContain(b);
    expect(bay.queue).toHaveLength(0);
    expect(b.state).toBe("in-repair");

    // Metrics
    expect(bay.metrics.completed).toBe(1);
    expect(bay.metrics.totalRepairTimeSec).toBeGreaterThan(0);
    expect(bay.metrics.longestRepairSec).toBeGreaterThan(0);
  });

  it("tracks longestRepairSec across multiple completions", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);

    // Completion #1 — quick drone (near full hull)
    const fast = makeDamagedDrone("offensive", { hullFrac: 0.98, shieldFrac: 0.98 });
    bay.admit(fast);
    bay.tick(0.5); // should finish in one short tick
    expect(bay.metrics.completed).toBe(1);
    const firstLongest = bay.metrics.longestRepairSec;

    // Completion #2 — damaged drone, several ticks
    const slow = makeDamagedDrone("offensive", { hullFrac: 0.1, shieldFrac: 0 });
    bay.admit(slow);
    for (let i = 0; i < 20; i++) bay.tick(0.5);
    expect(bay.metrics.completed).toBe(2);
    // longestRepairSec should only grow, never shrink
    expect(bay.metrics.longestRepairSec).toBeGreaterThanOrEqual(firstLongest);
  });
});

describe("RepairBay.tick — mothership death", () => {
  it("ejects all drones when mothership.alive becomes false", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    const a = makeDamagedDrone();
    const b = makeDamagedDrone();
    const c = makeDamagedDrone();
    bay.admit(a);
    bay.admit(b);
    bay.admit(c);

    // Kill the ship
    ship.alive = false;
    bay.tick(0.5);

    expect(bay.active).toHaveLength(0);
    expect(bay.queue).toHaveLength(0);
    expect(a.state).toBe("active");
    expect(b.state).toBe("active");
    expect(c.state).toBe("active");
    expect(bay.metrics.ejectedNoHost).toBe(3);
  });

  it("removes mid-repair drones whose hull hits 0 (stray projectile case)", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    const drone = makeDamagedDrone("offensive", { hullFrac: 0.3, shieldFrac: 0 });
    bay.admit(drone);

    // Simulate a stray projectile reaching the docked drone before the
    // bay's healing has a chance to run for this tick.
    drone.stats.hull = 0;
    drone.state = "destroyed";

    bay.tick(0.5);

    expect(bay.active).not.toContain(drone);
    expect(bay.metrics.dronesLostDuringRepair).toBe(1);
    // Should NOT have been counted as a successful completion
    expect(bay.metrics.completed).toBe(0);
  });
});

describe("RepairBay.applyResearchModifiers", () => {
  it("applies repair-bay-speed (+50% hull & shield rates)", () => {
    const bay = new RepairBay(makeStubMothership());
    bay.applyResearchModifiers({ "repair-bay-speed": true });
    expect(bay.config.hullRepairRate).toBeCloseTo(DEFAULT_REPAIR_CONFIG.hullRepairRate * 1.5);
    expect(bay.config.shieldRepairRate).toBeCloseTo(
      DEFAULT_REPAIR_CONFIG.shieldRepairRate * 1.5
    );
  });

  it("applies repair-bay-efficiency (x0.7 energy cost)", () => {
    const bay = new RepairBay(makeStubMothership());
    bay.applyResearchModifiers({ "repair-bay-efficiency": true });
    expect(bay.config.energyCostPerShieldPoint).toBeCloseTo(
      DEFAULT_REPAIR_CONFIG.energyCostPerShieldPoint * 0.7
    );
  });

  it("applies repair-bay-replicator (x0.7 material cost)", () => {
    const bay = new RepairBay(makeStubMothership());
    bay.applyResearchModifiers({ "repair-bay-replicator": true });
    expect(bay.config.materialCostPerHullPoint).toBeCloseTo(
      DEFAULT_REPAIR_CONFIG.materialCostPerHullPoint * 0.7
    );
  });

  it("applies repair-bay-capacity (+1 slot)", () => {
    const bay = new RepairBay(makeStubMothership());
    bay.applyResearchModifiers({ "repair-bay-capacity": true });
    expect(bay.config.slots).toBe(DEFAULT_REPAIR_CONFIG.slots + 1);
  });

  it("is idempotent — re-applying does not compound modifiers", () => {
    const bay = new RepairBay(makeStubMothership());
    const research = {
      "repair-bay-speed": true,
      "repair-bay-efficiency": true,
      "repair-bay-replicator": true,
      "repair-bay-capacity": true,
    };

    bay.applyResearchModifiers(research);
    const first = { ...bay.config };
    bay.applyResearchModifiers(research);
    const second = { ...bay.config };

    expect(second.hullRepairRate).toBeCloseTo(first.hullRepairRate);
    expect(second.shieldRepairRate).toBeCloseTo(first.shieldRepairRate);
    expect(second.energyCostPerShieldPoint).toBeCloseTo(first.energyCostPerShieldPoint);
    expect(second.materialCostPerHullPoint).toBeCloseTo(first.materialCostPerHullPoint);
    expect(second.slots).toBe(first.slots);
  });

  it("calling with no research resets to defaults", () => {
    const bay = new RepairBay(makeStubMothership());
    bay.applyResearchModifiers({ "repair-bay-speed": true });
    expect(bay.config.hullRepairRate).not.toBeCloseTo(DEFAULT_REPAIR_CONFIG.hullRepairRate);

    bay.applyResearchModifiers({});
    expect(bay.config.hullRepairRate).toBeCloseTo(DEFAULT_REPAIR_CONFIG.hullRepairRate);
    expect(bay.config.slots).toBe(DEFAULT_REPAIR_CONFIG.slots);
  });
});

describe("RepairBay.reset + getStatus", () => {
  it("reset() clears queue, active, and metrics", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    const a = makeDamagedDrone();
    const b = makeDamagedDrone();
    bay.admit(a);
    bay.admit(b);
    bay.tick(0.5); // accumulate some metrics

    bay.reset();

    expect(bay.active).toHaveLength(0);
    expect(bay.queue).toHaveLength(0);
    expect(bay.metrics).toEqual(makeRepairMetrics());
  });

  it("getStatus() returns a snapshot that does not mutate live state", () => {
    const ship = makeStubMothership();
    const bay = new RepairBay(ship);
    bay.admit(makeDamagedDrone());
    const snap = bay.getStatus();

    // Mutating the snapshot shouldn't leak back
    snap.metrics.admitted = 99;
    snap.config.slots = 99;
    expect(bay.metrics.admitted).toBe(1);
    expect(bay.config.slots).toBe(DEFAULT_REPAIR_CONFIG.slots);
    expect(snap.activeCount).toBe(1);
    expect(snap.queuedCount).toBe(0);
  });
});
