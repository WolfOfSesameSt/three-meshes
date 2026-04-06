import { describe, it, expect } from "vitest";
import { ATTACKS, getAttack, ENEMY_ATTACK_MAP, DRONE_ATTACK_MAP } from "./attack-defs.js";

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

  it("getAttack returns correct def", () => {
    expect(getAttack("pulse-laser").damage).toBe(15);
    expect(getAttack("nonexistent")).toBeNull();
  });

  it("every enemy type has an attack mapping", () => {
    for (const [type, attackId] of Object.entries(ENEMY_ATTACK_MAP)) {
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
  });

  it("mining beam does zero damage (handled by routine)", () => {
    const atk = getAttack("mining-beam");
    expect(atk.damage).toBe(0);
    expect(atk.projectileColor).toBe(0x44ff88);
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
});
