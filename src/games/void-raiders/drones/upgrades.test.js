import { describe, it, expect } from "vitest";
import { createDrone } from "./drone.js";
import {
  DRONE_UPGRADES,
  canEquip,
  equipUpgrade,
  removeUpgrade,
  getAvailableUpgrades,
  applyStoredUpgrades,
} from "./upgrades.js";

describe("drone upgrades", () => {
  // ── canEquip ────────────────────────────────────────────────

  it("canEquip returns true when slots are available", () => {
    const drone = createDrone({ type: "worker-mining" }); // 2 slots, 0 used
    expect(canEquip(drone, "mining-laser-mk2")).toBe(true);
  });

  it("canEquip returns false when all slots are full", () => {
    const drone = createDrone({ type: "worker-mining", upgradeSlots: 2 });
    equipUpgrade(drone, "mining-laser-mk2");
    equipUpgrade(drone, "cargo-expander");
    expect(canEquip(drone, "hull-plating")).toBe(false);
  });

  it("canEquip returns false for invalid upgrade ID", () => {
    const drone = createDrone();
    expect(canEquip(drone, "nonexistent-upgrade")).toBe(false);
  });

  // ── equipUpgrade ────────────────────────────────────────────

  it("equipUpgrade adds upgrade and modifies stats correctly", () => {
    const drone = createDrone({ type: "worker-mining" });
    const baseMiningRate = drone.stats.miningRate;

    const result = equipUpgrade(drone, "mining-laser-mk2");

    expect(result).toBe(true);
    expect(drone.upgrades).toContain("mining-laser-mk2");
    expect(drone.stats.miningRate).toBe(baseMiningRate + 3);
  });

  it("equipUpgrade applies shield module stats", () => {
    const drone = createDrone({ type: "offensive" });
    const baseShieldsMax = drone.stats.shieldsMax;

    equipUpgrade(drone, "shield-module");

    expect(drone.stats.shieldsMax).toBe(baseShieldsMax + 15);
    expect(drone.stats.shields).toBeGreaterThanOrEqual(15);
  });

  it("equipUpgrade applies hull plating stats", () => {
    const drone = createDrone({ type: "worker-mining" });
    const baseHullMax = drone.stats.hullMax;

    equipUpgrade(drone, "hull-plating");

    expect(drone.stats.hullMax).toBe(baseHullMax + 20);
    expect(drone.stats.hull).toBeGreaterThanOrEqual(20);
  });

  it("equipUpgrade applies thruster boost speed", () => {
    const drone = createDrone({ type: "offensive" });
    const baseSpeed = drone.stats.speed;

    equipUpgrade(drone, "thruster-boost");

    expect(drone.stats.speed).toBe(baseSpeed + 5);
  });

  it("equipUpgrade returns false when slots are full", () => {
    const drone = createDrone({ type: "worker-mining", upgradeSlots: 1 });
    equipUpgrade(drone, "mining-laser-mk2");

    const result = equipUpgrade(drone, "cargo-expander");
    expect(result).toBe(false);
    expect(drone.upgrades.length).toBe(1);
  });

  // ── removeUpgrade ───────────────────────────────────────────

  it("removeUpgrade reverts stat bonuses", () => {
    const drone = createDrone({ type: "worker-mining" });
    const baseMiningRate = drone.stats.miningRate;

    equipUpgrade(drone, "mining-laser-mk2");
    expect(drone.stats.miningRate).toBe(baseMiningRate + 3);

    const removed = removeUpgrade(drone, 0);

    expect(removed).toBe("mining-laser-mk2");
    expect(drone.stats.miningRate).toBe(baseMiningRate);
    expect(drone.upgrades.length).toBe(0);
  });

  it("removeUpgrade returns null for invalid index", () => {
    const drone = createDrone();
    expect(removeUpgrade(drone, 0)).toBeNull();
    expect(removeUpgrade(drone, -1)).toBeNull();
    expect(removeUpgrade(drone, 99)).toBeNull();
  });

  it("removeUpgrade handles multiple upgrades correctly", () => {
    const drone = createDrone({ type: "offensive", upgradeSlots: 3 });
    equipUpgrade(drone, "shield-module");
    equipUpgrade(drone, "thruster-boost");
    equipUpgrade(drone, "weapon-uplink");

    // Remove middle upgrade (thruster-boost at index 1)
    const removed = removeUpgrade(drone, 1);
    expect(removed).toBe("thruster-boost");
    expect(drone.upgrades).toEqual(["shield-module", "weapon-uplink"]);
  });

  // ── getAvailableUpgrades ────────────────────────────────────

  it("getAvailableUpgrades returns all upgrades when slots are free", () => {
    const drone = createDrone({ type: "worker-mining" });
    const available = getAvailableUpgrades(drone);
    expect(available.length).toBe(Object.keys(DRONE_UPGRADES).length);
  });

  it("getAvailableUpgrades returns empty when no slots free", () => {
    const drone = createDrone({ type: "worker-mining", upgradeSlots: 1 });
    equipUpgrade(drone, "mining-laser-mk2");

    const available = getAvailableUpgrades(drone);
    expect(available.length).toBe(0);
  });

  // ── applyStoredUpgrades ─────────────────────────────────────

  it("applyStoredUpgrades restores stats on fresh drone", () => {
    const drone = createDrone({ type: "worker-mining" });
    const baseMiningRate = drone.stats.miningRate;
    const baseHullMax = drone.stats.hullMax;

    applyStoredUpgrades(drone, ["mining-laser-mk2", "hull-plating"]);

    expect(drone.upgrades).toEqual(["mining-laser-mk2", "hull-plating"]);
    expect(drone.stats.miningRate).toBe(baseMiningRate + 3);
    expect(drone.stats.hullMax).toBe(baseHullMax + 20);
  });

  it("applyStoredUpgrades skips unknown upgrade IDs", () => {
    const drone = createDrone({ type: "worker-mining" });
    applyStoredUpgrades(drone, ["fake-upgrade", "mining-laser-mk2"]);
    expect(drone.upgrades).toEqual(["mining-laser-mk2"]);
  });

  // ── Upgrade data integrity ──────────────────────────────────

  it("all upgrade costs reference valid resource types", () => {
    const validResources = [
      "iron-ore", "copper-ore", "titanium-ore",
      "crystal-shard", "quartz-crystal",
      "plasma-core", "exotic-matter",
      "organic-matter", "bio-compound",
      "silicon-dust", "rare-earth",
      "salvage-parts",
    ];

    for (const [id, upgrade] of Object.entries(DRONE_UPGRADES)) {
      for (const resourceType of Object.keys(upgrade.cost)) {
        expect(
          validResources,
          `Upgrade "${id}" references unknown resource "${resourceType}"`
        ).toContain(resourceType);
      }
    }
  });

  it("all upgrades have required fields", () => {
    for (const [id, upgrade] of Object.entries(DRONE_UPGRADES)) {
      expect(upgrade.id, `${id} missing id`).toBe(id);
      expect(upgrade.label, `${id} missing label`).toBeTruthy();
      expect(upgrade.slotType, `${id} missing slotType`).toBeTruthy();
      expect(upgrade.statBonus, `${id} missing statBonus`).toBeTruthy();
      expect(upgrade.cost, `${id} missing cost`).toBeTruthy();
      expect(Object.keys(upgrade.cost).length, `${id} has empty cost`).toBeGreaterThan(0);
    }
  });
});
