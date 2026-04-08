import { describe, it, expect } from "vitest";
import { resolveDamage, applyDamage, shieldWouldFullyAbsorb } from "./damage-resolver.js";
import { getAttack } from "./attack-defs.js";

describe("damage resolver", () => {
  function makeTarget(shields, hull) {
    return { stats: { shields, hull }, state: "active" };
  }

  it("standard damage with no modifiers spends shields then hull", () => {
    const t = makeTarget(20, 100);
    const def = { damage: 30 };
    const r = resolveDamage(t, def);
    expect(r.shieldDamage).toBe(20);
    expect(r.hullDamage).toBe(10);
    expect(t.stats.shields).toBe(0);
    expect(t.stats.hull).toBe(90);
    expect(r.killed).toBe(false);
  });

  it("anti-shield modifier doubles shield damage", () => {
    const t = makeTarget(40, 100);
    // damage 30, vsShields 2.0, vsHull 0.5
    // shield capacity in base = 40 / 2.0 = 20 → can spend 20 base on shield
    // baseSpentOnShield = min(30, 20) = 20 → shieldDamage = 20 * 2.0 = 40
    // → all 40 shields gone, 10 base remains, spills to hull at 0.5 = 5
    const def = { damage: 30, damageVsShields: 2.0, damageVsHull: 0.5 };
    const r = resolveDamage(t, def);
    expect(r.shieldDamage).toBe(40);
    expect(t.stats.shields).toBe(0);
    expect(r.hullDamage).toBeCloseTo(5);
    expect(t.stats.hull).toBeCloseTo(95);
  });

  it("anti-shield modifier spills correctly when shields run out", () => {
    const t = makeTarget(10, 100);
    // damageVsShields 2.0 → first 5 base damage burns the 10 shield, then
    // 25 base remains and spills to hull at vsHull 0.5 = 12.5 hull damage
    const def = { damage: 30, damageVsShields: 2.0, damageVsHull: 0.5 };
    const r = resolveDamage(t, def);
    expect(r.shieldDamage).toBe(10);
    expect(t.stats.shields).toBe(0);
    expect(r.hullDamage).toBeCloseTo(12.5);
    expect(t.stats.hull).toBeCloseTo(87.5);
  });

  it("anti-hull modifier doesn't apply to shield slice", () => {
    const t = makeTarget(20, 100);
    // damage 50, vsShields 0.4, vsHull 1.8
    // shield slice: spends 20/0.4 = 50 base on shield, but base remaining is
    // only 50, so spends min(50, 50) = 50 base, deals 50*0.4 = 20 shield damage
    // hull slice: 0 base remaining → 0 hull damage
    const def = { damage: 50, damageVsShields: 0.4, damageVsHull: 1.8 };
    const r = resolveDamage(t, def);
    expect(r.shieldDamage).toBe(20);
    expect(r.hullDamage).toBe(0);
    expect(t.stats.shields).toBe(0);
    expect(t.stats.hull).toBe(100);
  });

  it("kills target when hull hits zero", () => {
    const t = makeTarget(0, 5);
    const def = { damage: 10 };
    const r = resolveDamage(t, def);
    expect(r.killed).toBe(true);
    expect(t.state).toBe("dead");
    expect(t.stats.hull).toBe(0);
  });

  it("zero damage attack is a no-op", () => {
    const t = makeTarget(20, 100);
    const r = resolveDamage(t, { damage: 0 });
    expect(r.shieldDamage).toBe(0);
    expect(r.hullDamage).toBe(0);
    expect(t.stats.shields).toBe(20);
    expect(t.stats.hull).toBe(100);
  });

  it("applyDamage routes through takeDamage method when present", () => {
    let received = null;
    const t = {
      stats: { shields: 20, hull: 100 },
      takeDamage(amount) { received = amount; this.stats.hull -= amount; },
    };
    const def = { damage: 30, damageVsShields: 2.0 };
    applyDamage(t, def, { x: 0, y: 0, z: 0 });
    // Effective damage = 30 base × 2 vs shield = 60 worth, capped at 20 shield
    // → 10 base spent on shield (delivering 20 shield damage), 20 base spills
    // to hull at default 1.0 = 20. Total effective = 40.
    expect(received).toBe(40);
  });

  it("applyDamage uses resolver path when target has no takeDamage", () => {
    const t = { stats: { shields: 10, hull: 50 }, state: "active" };
    const def = { damage: 25, damageVsHull: 1.5 };
    applyDamage(t, def);
    // shield slice: 10 shield damage (10 base spent), 15 base remaining
    // hull slice: 15 × 1.5 = 22.5 hull damage
    expect(t.stats.shields).toBe(0);
    expect(t.stats.hull).toBeCloseTo(27.5);
  });

  it("shieldWouldFullyAbsorb returns true when shields outpace damage", () => {
    const t = makeTarget(200, 100);
    const def = { damage: 50, damageVsShields: 0.4 }; // effective = 20 shield damage
    expect(shieldWouldFullyAbsorb(t, def)).toBe(true);
  });

  it("shieldWouldFullyAbsorb returns false when damage breaks through", () => {
    const t = makeTarget(10, 100);
    const def = { damage: 50, damageVsShields: 1.0 };
    expect(shieldWouldFullyAbsorb(t, def)).toBe(false);
  });

  it("shieldWouldFullyAbsorb returns false for unshielded targets", () => {
    const t = makeTarget(0, 100);
    expect(shieldWouldFullyAbsorb(t, { damage: 10 })).toBe(false);
  });
});

describe("v2 mothership weapon catalog", () => {
  it("all catalog weapons resolve via getAttack", () => {
    const ids = [
      "point-defense-pulse",
      "arc-emitter",
      "flak-burst",
      "shield-breaker",
      "guided-missile",
      "flak-burst-missile",
      "heavy-railgun",
      "gatling-pulse",
    ];
    for (const id of ids) {
      const def = getAttack(id);
      expect(def, `attack ${id} should exist`).not.toBeNull();
      expect(def.id).toBe(id);
      expect(typeof def.damage).toBe("number");
      expect(typeof def.fireRate).toBe("number");
      expect(typeof def.range).toBe("number");
    }
  });

  it("anti-shield weapons have damageVsShields > 1 and damageVsHull < 1", () => {
    for (const id of ["arc-emitter", "shield-breaker"]) {
      const def = getAttack(id);
      expect(def.damageVsShields).toBeGreaterThan(1);
      expect(def.damageVsHull).toBeLessThan(1);
    }
  });

  it("anti-hull weapons have damageVsHull > 1 and damageVsShields < 1", () => {
    for (const id of ["heavy-railgun", "guided-missile"]) {
      const def = getAttack(id);
      expect(def.damageVsHull).toBeGreaterThan(1);
      expect(def.damageVsShields).toBeLessThan(1);
    }
  });

  it("flak weapons have detonation range and arming distance", () => {
    for (const id of ["flak-burst", "flak-burst-missile"]) {
      const def = getAttack(id);
      expect(def.flakDetonationRange).toBeGreaterThan(0);
      expect(def.flakArmingDistance).toBeGreaterThan(0);
      expect(def.aoeDamage).toBeGreaterThan(0);
      expect(def.aoeRadius).toBeGreaterThan(0);
    }
  });

  it("guided-missile has PID homing config with kp/kd/maxTurn", () => {
    const def = getAttack("guided-missile");
    expect(def.homing).toBeDefined();
    expect(def.homing.kp).toBeGreaterThan(0);
    expect(def.homing.kd).toBeGreaterThan(0);
    expect(def.homing.maxTurn).toBeGreaterThan(0);
  });

  it("guided-missile prefers large slow targets and ignores small fry", () => {
    const def = getAttack("guided-missile");
    expect(def.targetingRules.priority).toBe("preferLargeSlow");
    expect(def.targetingRules.minHull).toBeGreaterThan(0);
  });

  it("point-defense-pulse prefers fast targets and skips capitals", () => {
    const def = getAttack("point-defense-pulse");
    expect(def.targetingRules.priority).toBe("preferFast");
    expect(def.targetingRules.maxHull).toBeDefined();
  });

  it("flak weapons require a cluster to fire", () => {
    for (const id of ["flak-burst", "flak-burst-missile"]) {
      const def = getAttack(id);
      expect(def.targetingRules.priority).toBe("preferCluster");
      expect(def.targetingRules.minClusterSize).toBeGreaterThanOrEqual(2);
    }
  });

  it("anti-shield weapons require shielded targets", () => {
    for (const id of ["arc-emitter", "shield-breaker"]) {
      const def = getAttack(id);
      expect(def.targetingRules.requireShields).toBe(true);
    }
  });

  it("heavy-railgun skips fully-shielded targets", () => {
    const def = getAttack("heavy-railgun");
    expect(def.targetingRules.skipIfShieldsAbsorb).toBe(true);
  });

  it("shield-breaker fires in 3-shot bursts", () => {
    const def = getAttack("shield-breaker");
    expect(def.burstCount).toBe(3);
    expect(def.burstInterval).toBeGreaterThan(0);
  });

  it("guided-missile burst matches the revolver chamber count", () => {
    const def = getAttack("guided-missile");
    expect(def.burstCount).toBe(6);
  });
});
