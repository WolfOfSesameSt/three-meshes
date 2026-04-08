import { describe, it, expect } from "vitest";
import {
  getRoutine,
  WEAPON_ROUTINES,
  POINT_DEFENSE_ROUTINE,
  ARC_EMITTER_ROUTINE,
  SHIELD_BREAKER_ROUTINE,
  FLAK_BURST_ROUTINE,
  GUIDED_MISSILE_ROUTINE,
  HEAVY_RAILGUN_ROUTINE,
} from "./weapon-routines.js";
import { ATTACKS } from "./attack-defs.js";

// ── Fixtures ───────────────────────────────────────────────────────

function makeTurret(pos = { x: 0, y: 0, z: 0 }) {
  return { position: pos };
}

function makeEnemy(overrides = {}) {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    stats: { hull: 40, hullMax: 40 },
    ...overrides,
  };
}

function atDistance(x) {
  return { x, y: 0, z: 0 };
}

function scoreIsEligible(score) {
  return score != null && !Number.isNaN(score) && score >= 0;
}

// ── Registry ───────────────────────────────────────────────────────

describe("weapon routines registry", () => {
  it("exports all 6 routines in the named registry", () => {
    expect(Object.keys(WEAPON_ROUTINES)).toHaveLength(6);
  });

  it("getRoutine returns null for missing IDs", () => {
    expect(getRoutine(null)).toBeNull();
    expect(getRoutine(undefined)).toBeNull();
    expect(getRoutine("does-not-exist")).toBeNull();
  });

  it("getRoutine returns the matching routine by id", () => {
    expect(getRoutine("point-defense-pd")).toBe(POINT_DEFENSE_ROUTINE);
    expect(getRoutine("arc-emitter-chain")).toBe(ARC_EMITTER_ROUTINE);
    expect(getRoutine("shield-breaker-anti-shield")).toBe(SHIELD_BREAKER_ROUTINE);
    expect(getRoutine("flak-burst-swarm")).toBe(FLAK_BURST_ROUTINE);
    expect(getRoutine("guided-missile-smart")).toBe(GUIDED_MISSILE_ROUTINE);
    expect(getRoutine("heavy-railgun-capital")).toBe(HEAVY_RAILGUN_ROUTINE);
  });

  it("every routine has a description and evaluate function", () => {
    for (const r of Object.values(WEAPON_ROUTINES)) {
      expect(typeof r.description).toBe("string");
      expect(typeof r.evaluate).toBe("function");
      expect(r.id).toBeTruthy();
    }
  });
});

// ── Attack def wiring ─────────────────────────────────────────────

describe("attack def routineId wiring", () => {
  it("each of the 6 weapons references a valid routine", () => {
    const weapons = [
      "point-defense-pulse",
      "arc-emitter",
      "shield-breaker",
      "flak-burst",
      "guided-missile",
      "heavy-railgun",
    ];
    for (const id of weapons) {
      const def = ATTACKS[id];
      expect(def).toBeTruthy();
      expect(def.routineId).toBeTruthy();
      expect(getRoutine(def.routineId)).toBeTruthy();
    }
  });
});

// ── point-defense-pulse ───────────────────────────────────────────

describe("point-defense routine", () => {
  it("scores a fast close scout as its ideal target", () => {
    const turret = makeTurret();
    const scout = makeEnemy({
      position: atDistance(40),
      velocity: { x: 0, y: 0, z: 20 },
      stats: { hull: 40, hullMax: 40 },
    });
    const score = POINT_DEFENSE_ROUTINE.evaluate(turret, scout, [scout]);
    expect(scoreIsEligible(score)).toBe(true);
  });

  it("scores heavy-hull cruisers MUCH lower than fighters at the same distance", () => {
    const turret = makeTurret();
    const cruiser = makeEnemy({
      position: atDistance(50),
      stats: { hull: 120, hullMax: 120 },
    });
    const fighter = makeEnemy({
      position: atDistance(50),
      stats: { hull: 40, hullMax: 40 },
    });
    const cruiserScore = POINT_DEFENSE_ROUTINE.evaluate(turret, cruiser, [cruiser]);
    const fighterScore = POINT_DEFENSE_ROUTINE.evaluate(turret, fighter, [fighter]);
    // PD still fires on cruisers as a fallback, but heavily prefers fighters
    expect(fighterScore).toBeGreaterThan(cruiserScore * 3);
  });

  it("skips targets beyond max engagement range (NaN)", () => {
    const turret = makeTurret();
    const far = makeEnemy({ position: atDistance(250) });
    const score = POINT_DEFENSE_ROUTINE.evaluate(turret, far, [far]);
    expect(Number.isNaN(score)).toBe(true);
  });

  it("prefers a fast interceptor over a slow bomber at the same distance", () => {
    const turret = makeTurret();
    const fast = makeEnemy({
      position: atDistance(50),
      velocity: { x: 30, y: 0, z: 0 },
      stats: { hull: 25, hullMax: 25 },
    });
    const slow = makeEnemy({
      position: atDistance(50),
      velocity: { x: 2, y: 0, z: 0 },
      stats: { hull: 80, hullMax: 80 },
    });
    const all = [fast, slow];
    const fastScore = POINT_DEFENSE_ROUTINE.evaluate(turret, fast, all);
    const slowScore = POINT_DEFENSE_ROUTINE.evaluate(turret, slow, all);
    expect(fastScore).toBeGreaterThan(slowScore);
  });

  it("returns NaN for dead targets", () => {
    const turret = makeTurret();
    const dead = makeEnemy({ stats: { hull: 0, hullMax: 40 } });
    expect(Number.isNaN(POINT_DEFENSE_ROUTINE.evaluate(turret, dead, [dead]))).toBe(true);
  });
});

// ── arc-emitter ───────────────────────────────────────────────────

describe("arc-emitter routine", () => {
  it("scores higher for a target with neighbours than a lone target", () => {
    const turret = makeTurret();
    const clustered = makeEnemy({ position: { x: 50, y: 0, z: 0 } });
    const n1 = makeEnemy({ position: { x: 55, y: 0, z: 0 } });
    const n2 = makeEnemy({ position: { x: 60, y: 0, z: 2 } });
    const n3 = makeEnemy({ position: { x: 48, y: 0, z: 10 } });
    const lone = makeEnemy({ position: { x: 50, y: 0, z: 100 } });

    const all = [clustered, n1, n2, n3, lone];
    const clusteredScore = ARC_EMITTER_ROUTINE.evaluate(turret, clustered, all);
    const loneScore = ARC_EMITTER_ROUTINE.evaluate(turret, lone, all);
    expect(clusteredScore).toBeGreaterThan(loneScore);
  });

  it("densely packed cluster scores more than a spread-out cluster", () => {
    const turret = makeTurret();
    // Dense: 4 enemies inside 20m radius
    const dense = makeEnemy({ position: { x: 50, y: 0, z: 0 } });
    const dense_n1 = makeEnemy({ position: { x: 52, y: 0, z: 2 } });
    const dense_n2 = makeEnemy({ position: { x: 48, y: 0, z: 4 } });
    const dense_n3 = makeEnemy({ position: { x: 55, y: 0, z: 3 } });
    const dense_n4 = makeEnemy({ position: { x: 49, y: 0, z: 6 } });

    // Sparse: only 1 neighbour within 25m
    const sparse = makeEnemy({ position: { x: 50, y: 0, z: 300 } });
    const sparse_n1 = makeEnemy({ position: { x: 60, y: 0, z: 305 } });

    const all = [dense, dense_n1, dense_n2, dense_n3, dense_n4, sparse, sparse_n1];
    const denseScore = ARC_EMITTER_ROUTINE.evaluate(turret, dense, all);
    const sparseScore = ARC_EMITTER_ROUTINE.evaluate(turret, sparse, all);
    expect(denseScore).toBeGreaterThan(sparseScore);
  });

  it("still returns a positive score for a lone target (no min cluster)", () => {
    const turret = makeTurret();
    const lone = makeEnemy({ position: atDistance(100) });
    const score = ARC_EMITTER_ROUTINE.evaluate(turret, lone, [lone]);
    expect(scoreIsEligible(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
  });

  it("returns NaN for dead targets", () => {
    const turret = makeTurret();
    const dead = makeEnemy({ stats: { hull: 0, hullMax: 40 } });
    expect(Number.isNaN(ARC_EMITTER_ROUTINE.evaluate(turret, dead, [dead]))).toBe(true);
  });
});

// ── shield-breaker ────────────────────────────────────────────────

describe("shield-breaker routine", () => {
  it("scores a full-shield target high", () => {
    const turret = makeTurret();
    const shielded = makeEnemy({
      stats: { hull: 150, hullMax: 150, shields: 80, shieldsMax: 80 },
    });
    const score = SHIELD_BREAKER_ROUTINE.evaluate(turret, shielded, [shielded]);
    expect(scoreIsEligible(score)).toBe(true);
    // 100 * (80/80) + 50/(0+1) = 150
    expect(score).toBeGreaterThan(50);
  });

  it("scores unshielded targets MUCH lower than shielded ones (fallback only)", () => {
    const turret = makeTurret();
    const noShield = makeEnemy({ stats: { hull: 40, hullMax: 40 } });
    const shielded = makeEnemy({ stats: { hull: 150, hullMax: 150, shields: 80, shieldsMax: 80 } });
    const noScore = SHIELD_BREAKER_ROUTINE.evaluate(turret, noShield, [noShield]);
    const sScore = SHIELD_BREAKER_ROUTINE.evaluate(turret, shielded, [shielded]);
    // Unshielded fall through to fallback path — much lower than the
    // strong shield-target preference
    expect(sScore).toBeGreaterThan(noScore * 10);
  });

  it("fires at a target with shields just above 25%", () => {
    const turret = makeTurret();
    const barelyEligible = makeEnemy({
      stats: { hull: 150, hullMax: 150, shields: 25, shieldsMax: 80 }, // ~31%
    });
    const score = SHIELD_BREAKER_ROUTINE.evaluate(turret, barelyEligible, [barelyEligible]);
    expect(scoreIsEligible(score)).toBe(true);
  });

  it("prefers the higher-shield target when both are eligible", () => {
    const turret = makeTurret();
    const full = makeEnemy({
      stats: { hull: 150, hullMax: 150, shields: 80, shieldsMax: 80 },
    });
    const half = makeEnemy({
      stats: { hull: 150, hullMax: 150, shields: 40, shieldsMax: 80 },
    });
    const all = [full, half];
    expect(SHIELD_BREAKER_ROUTINE.evaluate(turret, full, all)).toBeGreaterThan(
      SHIELD_BREAKER_ROUTINE.evaluate(turret, half, all),
    );
  });
});

// ── flak-burst ────────────────────────────────────────────────────

describe("flak-burst routine", () => {
  it("scores isolated targets much lower than clusters (still eligible as fallback)", () => {
    const turret = makeTurret();
    const alone = makeEnemy({ position: atDistance(100) });
    const cluster = makeEnemy({ position: { x: 100, y: 0, z: 0 } });
    const cn1 = makeEnemy({ position: { x: 102, y: 0, z: 1 } });
    const cn2 = makeEnemy({ position: { x: 98, y: 0, z: 2 } });
    const cn3 = makeEnemy({ position: { x: 100, y: 0, z: 4 } });
    const all = [cluster, cn1, cn2, cn3];
    const aloneScore = FLAK_BURST_ROUTINE.evaluate(turret, alone, [alone]);
    const clusterScore = FLAK_BURST_ROUTINE.evaluate(turret, cluster, all);
    expect(scoreIsEligible(aloneScore)).toBe(true); // fallback eligible
    expect(clusterScore).toBeGreaterThan(aloneScore * 5);
  });

  it("scores a 3-enemy cluster as eligible", () => {
    const turret = makeTurret();
    const a = makeEnemy({ position: { x: 50, y: 0, z: 0 } });
    const b = makeEnemy({ position: { x: 55, y: 0, z: 0 } });
    const c = makeEnemy({ position: { x: 48, y: 0, z: 5 } });
    const all = [a, b, c];
    const score = FLAK_BURST_ROUTINE.evaluate(turret, a, all);
    expect(scoreIsEligible(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
  });

  it("scores a 6-enemy dense cluster higher than a 3-enemy cluster", () => {
    const turret = makeTurret();
    // Dense 6-pack at x=50
    const dense = [];
    for (let i = 0; i < 6; i++) {
      dense.push(makeEnemy({ position: { x: 50 + i, y: 0, z: i % 2 } }));
    }
    // Smaller 3-pack at x=100 (same distance, smaller cluster)
    const small = [
      makeEnemy({ position: { x: 100, y: 0, z: 0 } }),
      makeEnemy({ position: { x: 102, y: 0, z: 0 } }),
      makeEnemy({ position: { x: 101, y: 0, z: 3 } }),
    ];
    // Move turret to same distance from both centres
    const turret2 = makeTurret({ x: 75, y: 0, z: 0 });
    const all = [...dense, ...small];
    const denseScore = FLAK_BURST_ROUTINE.evaluate(turret2, dense[0], all);
    const smallScore = FLAK_BURST_ROUTINE.evaluate(turret2, small[0], all);
    expect(denseScore).toBeGreaterThan(smallScore);
  });
});

// ── guided-missile ────────────────────────────────────────────────

describe("guided-missile routine", () => {
  it("scores a slow high-hull cruiser highly", () => {
    const turret = makeTurret();
    const cruiser = makeEnemy({
      position: atDistance(200),
      velocity: { x: 0, y: 0, z: 7 },
      stats: { hull: 120, hullMax: 120 },
    });
    const score = GUIDED_MISSILE_ROUTINE.evaluate(turret, cruiser, [cruiser]);
    expect(scoreIsEligible(score)).toBe(true);
    expect(score).toBeGreaterThan(0.5);
  });

  it("deprioritises fast interceptors (score ≈ 0)", () => {
    const turret = makeTurret();
    const fast = makeEnemy({
      position: atDistance(200),
      velocity: { x: 0, y: 0, z: 30 },
      stats: { hull: 25, hullMax: 25 },
    });
    const score = GUIDED_MISSILE_ROUTINE.evaluate(turret, fast, [fast]);
    // At speed 30, the slowBonus hits 0 → score = 0
    expect(scoreIsEligible(score)).toBe(true);
    expect(score).toBeCloseTo(0);
  });

  it("strictly prefers slow cruiser over fast interceptor when both are on-field", () => {
    const turret = makeTurret();
    const slow = makeEnemy({
      position: atDistance(200),
      velocity: { x: 0, y: 0, z: 7 },
      stats: { hull: 150, hullMax: 150 },
    });
    const fast = makeEnemy({
      position: atDistance(200),
      velocity: { x: 0, y: 0, z: 30 },
      stats: { hull: 25, hullMax: 25 },
    });
    const all = [slow, fast];
    const slowScore = GUIDED_MISSILE_ROUTINE.evaluate(turret, slow, all);
    const fastScore = GUIDED_MISSILE_ROUTINE.evaluate(turret, fast, all);
    expect(slowScore).toBeGreaterThan(fastScore);
  });

  it("returns NaN when hullMax is missing", () => {
    const turret = makeTurret();
    const weird = { position: atDistance(100), stats: { hull: 50 } };
    expect(Number.isNaN(GUIDED_MISSILE_ROUTINE.evaluate(turret, weird, [weird]))).toBe(true);
  });

  it("returns NaN for dead targets", () => {
    const turret = makeTurret();
    const dead = makeEnemy({ stats: { hull: 0, hullMax: 40 } });
    expect(Number.isNaN(GUIDED_MISSILE_ROUTINE.evaluate(turret, dead, [dead]))).toBe(true);
  });
});

// ── heavy-railgun ─────────────────────────────────────────────────

describe("heavy-railgun routine", () => {
  it("scores a distant high-hull cruiser highly", () => {
    const turret = makeTurret();
    const cruiser = makeEnemy({
      position: atDistance(500),
      velocity: { x: 0, y: 0, z: 7 },
      stats: { hull: 150, hullMax: 150 },
    });
    const score = HEAVY_RAILGUN_ROUTINE.evaluate(turret, cruiser, [cruiser]);
    expect(scoreIsEligible(score)).toBe(true);
    expect(score).toBeGreaterThan(150); // hull × range_bonus > hull
  });

  it("scores fighter-weight targets MUCH lower than capitals (still fallback eligible)", () => {
    const turret = makeTurret();
    const scout = makeEnemy({
      position: atDistance(300),
      velocity: { x: 0, y: 0, z: 5 },
      stats: { hull: 40, hullMax: 40 },
    });
    const cruiser = makeEnemy({
      position: atDistance(300),
      velocity: { x: 0, y: 0, z: 5 },
      stats: { hull: 150, hullMax: 150 },
    });
    const sScore = HEAVY_RAILGUN_ROUTINE.evaluate(turret, scout, [scout]);
    const cScore = HEAVY_RAILGUN_ROUTINE.evaluate(turret, cruiser, [cruiser]);
    expect(scoreIsEligible(sScore)).toBe(true);
    expect(cScore).toBeGreaterThan(sScore * 3);
  });

  it("scores fast targets MUCH lower than slow ones (still fallback eligible)", () => {
    const turret = makeTurret();
    const fastBruiser = makeEnemy({
      position: atDistance(300),
      velocity: { x: 0, y: 0, z: 30 },
      stats: { hull: 150, hullMax: 150 },
    });
    const slowBruiser = makeEnemy({
      position: atDistance(300),
      velocity: { x: 0, y: 0, z: 5 },
      stats: { hull: 150, hullMax: 150 },
    });
    const fScore = HEAVY_RAILGUN_ROUTINE.evaluate(turret, fastBruiser, [fastBruiser]);
    const slScore = HEAVY_RAILGUN_ROUTINE.evaluate(turret, slowBruiser, [slowBruiser]);
    expect(scoreIsEligible(fScore)).toBe(true);
    expect(slScore).toBeGreaterThan(fScore * 3);
  });

  it("rewards distance — farther high-hull targets score higher", () => {
    const turret = makeTurret();
    const near = makeEnemy({
      position: atDistance(100),
      velocity: { x: 0, y: 0, z: 5 },
      stats: { hull: 150, hullMax: 150 },
    });
    const far = makeEnemy({
      position: atDistance(500),
      velocity: { x: 0, y: 0, z: 5 },
      stats: { hull: 150, hullMax: 150 },
    });
    const all = [near, far];
    expect(HEAVY_RAILGUN_ROUTINE.evaluate(turret, far, all)).toBeGreaterThan(
      HEAVY_RAILGUN_ROUTINE.evaluate(turret, near, all),
    );
  });

  it("returns NaN for dead targets", () => {
    const turret = makeTurret();
    const dead = makeEnemy({ stats: { hull: 0, hullMax: 150 } });
    expect(Number.isNaN(HEAVY_RAILGUN_ROUTINE.evaluate(turret, dead, [dead]))).toBe(true);
  });
});
