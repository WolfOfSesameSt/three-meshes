import { describe, it, expect } from "vitest";
import { ATTACKS, getAttack, ENEMY_ATTACK_MAP, DRONE_ATTACK_MAP } from "./attack-defs.js";
import { ENEMY_TYPES } from "./enemy.js";

describe("attack definitions", () => {
  it("all attacks have required fields", () => {
    for (const [id, atk] of Object.entries(ATTACKS)) {
      expect(atk.id).toBe(id);
      expect(typeof atk.damage).toBe("number");
      expect(typeof atk.speed).toBe("number");
      expect(typeof atk.fireRate).toBe("number");
      expect(typeof atk.range).toBe("number");
      expect(typeof atk.projectileType).toBe("string");
      expect(typeof atk.projectileColor).toBe("number");
    }
  });

  it("hitscan attacks have accuracy", () => {
    for (const atk of Object.values(ATTACKS)) {
      if (atk.speed === 0) {
        expect(atk.accuracy).toBeDefined();
        expect(atk.accuracy).toBeGreaterThan(0);
        expect(atk.accuracy).toBeLessThanOrEqual(1);
      }
    }
  });

  it("projectile attacks have hitRadius and spread", () => {
    for (const atk of Object.values(ATTACKS)) {
      if (atk.speed > 0) {
        expect(atk.hitRadius).toBeDefined();
        expect(atk.hitRadius).toBeGreaterThan(0);
        expect(atk.spread).toBeDefined();
        expect(atk.spread).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("getAttack returns correct def", () => {
    expect(getAttack("pulse-laser").damage).toBe(15);
    expect(getAttack("nonexistent")).toBeNull();
  });

  it("every enemy type has an attack mapping", () => {
    for (const [, attackId] of Object.entries(ENEMY_ATTACK_MAP)) {
      const atk = getAttack(attackId);
      expect(atk).not.toBeNull();
      expect(atk.damage).toBeGreaterThan(0);
    }
  });

  it("offensive drones have an attack", () => {
    const atkId = DRONE_ATTACK_MAP.offensive;
    expect(atkId).toBe("drone-laser");
    const atk = getAttack(atkId);
    expect(atk.damage).toBeGreaterThan(0);
    expect(atk.accuracy).toBeDefined();
  });

  it("mining/repair beams have accuracy 1.0 (always connect)", () => {
    expect(getAttack("mining-beam").accuracy).toBe(1.0);
    expect(getAttack("repair-beam").accuracy).toBe(1.0);
  });

  it("bolt attacks have positive speed, beam attacks have zero", () => {
    for (const atk of Object.values(ATTACKS)) {
      if (atk.projectileType === "bolt") {
        expect(atk.speed).toBeGreaterThan(0);
      } else if (atk.projectileType === "beam") {
        expect(atk.speed).toBe(0);
      }
    }
  });

  it("all new attack defs have required fields", () => {
    const newAttacks = [
      "interceptor-burst", "bomber-torpedo", "cruiser-beam", "proximity-mine",
      "railgun", "scatter-cannon", "plasma-lance", "missile-pod",
    ];
    for (const id of newAttacks) {
      const atk = getAttack(id);
      expect(atk).not.toBeNull();
      expect(atk.id).toBe(id);
      expect(typeof atk.damage).toBe("number");
      expect(typeof atk.speed).toBe("number");
      expect(typeof atk.fireRate).toBe("number");
      expect(typeof atk.range).toBe("number");
      expect(typeof atk.projectileType).toBe("string");
      expect(typeof atk.projectileColor).toBe("number");
    }
  });

  it("all new enemy types have attack mappings", () => {
    const newEnemies = ["interceptor", "bomber", "shielded-cruiser", "minelayer"];
    for (const type of newEnemies) {
      const attackId = ENEMY_ATTACK_MAP[type];
      expect(attackId).toBeDefined();
      const atk = getAttack(attackId);
      expect(atk).not.toBeNull();
      expect(atk.damage).toBeGreaterThan(0);
    }
  });

  it("every enemy type in ENEMY_TYPES has an attack mapping", () => {
    for (const type of Object.keys(ENEMY_TYPES)) {
      expect(ENEMY_ATTACK_MAP[type]).toBeDefined();
      expect(getAttack(ENEMY_ATTACK_MAP[type])).not.toBeNull();
    }
  });
});
