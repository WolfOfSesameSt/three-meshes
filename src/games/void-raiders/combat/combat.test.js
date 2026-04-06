import { describe, it, expect } from "vitest";
import { createEnemy, isEnemyAlive, ENEMY_TYPES } from "./enemy.js";
import { updateEnemyAI } from "./enemy-ai.js";
import { EnemySpawner } from "./spawner.js";
import { WeaponSystem } from "../ship/weapon.js";

describe("enemy", () => {
  it("creates enemy with correct stats", () => {
    const e = createEnemy("scout-fighter", { x: 0, y: 50, z: 0 });
    expect(e.type).toBe("scout-fighter");
    expect(e.stats.hull).toBe(40);
    expect(e.stats.damage).toBe(5);
    expect(e.state).toBe("patrol");
  });

  it("isEnemyAlive returns false when dead", () => {
    const e = createEnemy("scout-fighter", { x: 0, y: 0, z: 0 });
    expect(isEnemyAlive(e)).toBe(true);
    e.stats.hull = 0;
    e.state = "dead";
    expect(isEnemyAlive(e)).toBe(false);
  });

  it("generates unique IDs", () => {
    const a = createEnemy("scout-fighter", { x: 0, y: 0, z: 0 });
    const b = createEnemy("scout-fighter", { x: 0, y: 0, z: 0 });
    expect(a.id).not.toBe(b.id);
  });
});

describe("new enemy types", () => {
  it("creates interceptor with correct stats", () => {
    const e = createEnemy("interceptor", { x: 0, y: 50, z: 0 });
    expect(e.type).toBe("interceptor");
    expect(e.stats.hull).toBe(25);
    expect(e.stats.speed).toBe(30);
    expect(e.stats.damage).toBe(8);
  });

  it("creates bomber with correct stats", () => {
    const e = createEnemy("bomber", { x: 0, y: 50, z: 0 });
    expect(e.type).toBe("bomber");
    expect(e.stats.hull).toBe(80);
    expect(e.stats.speed).toBe(8);
    expect(e.stats.damage).toBe(20);
  });

  it("shielded cruiser has shield stats", () => {
    const e = createEnemy("shielded-cruiser", { x: 0, y: 50, z: 0 });
    expect(e.stats.shields).toBe(80);
    expect(e.stats.shieldsMax).toBe(80);
    expect(e.stats.hull).toBe(150);
  });

  it("creates minelayer with correct stats", () => {
    const e = createEnemy("minelayer", { x: 0, y: 50, z: 0 });
    expect(e.type).toBe("minelayer");
    expect(e.stats.hull).toBe(50);
    expect(e.stats.speed).toBe(12);
  });

  it("all new enemy types have valid loot tables", () => {
    const newTypes = ["interceptor", "bomber", "shielded-cruiser", "minelayer"];
    for (const type of newTypes) {
      const def = ENEMY_TYPES[type];
      expect(def.loot).toBeDefined();
      expect(def.loot.type).toBe("salvage-parts");
      expect(def.loot.amount).toHaveLength(2);
      expect(def.loot.amount[0]).toBeLessThan(def.loot.amount[1]);
    }
  });
});

describe("enemy AI", () => {
  it("attacks nearby drones", () => {
    const enemy = createEnemy("scout-fighter", { x: 0, y: 50, z: 0 });
    const drone = {
      position: { x: 50, y: 50, z: 0 },
      stats: { hull: 40, hullMax: 40 },
      state: "active",
    };
    const targets = { mothership: null, drones: [drone] };

    // Run several ticks to get in range and fire
    for (let i = 0; i < 100; i++) {
      updateEnemyAI(enemy, targets, 0.1, i * 0.1);
    }

    // Enemy should have dealt damage
    expect(drone.stats.hull).toBeLessThan(40);
  });

  it("turrets don't move", () => {
    const turret = createEnemy("turret", { x: 100, y: 10, z: 100 });
    const startPos = { ...turret.position };
    const targets = { mothership: null, drones: [] };

    for (let i = 0; i < 10; i++) {
      updateEnemyAI(turret, targets, 0.1, i * 0.1);
    }

    expect(turret.position.x).toBe(startPos.x);
    expect(turret.position.z).toBe(startPos.z);
  });
});

describe("spawner", () => {
  it("spawns no enemies before 10 seconds", () => {
    const spawner = new EnemySpawner();
    const shipPos = { x: 0, y: 50, z: 0 };

    for (let i = 0; i < 50; i++) {
      spawner.update(0.1, shipPos); // 5 seconds
    }

    expect(spawner.enemies).toHaveLength(0);
  });

  it("spawns enemies after 10 seconds", () => {
    const spawner = new EnemySpawner();
    const shipPos = { x: 0, y: 50, z: 0 };

    // Advance past 10s + spawn interval
    for (let i = 0; i < 200; i++) {
      spawner.update(0.1, shipPos); // 20 seconds
    }

    expect(spawner.enemies.length).toBeGreaterThan(0);
  });

  it("threat level increases over time", () => {
    const spawner = new EnemySpawner();
    expect(spawner.getThreatLevel()).toBe(0);

    spawner.missionTimer = 150;
    expect(spawner.getThreatLevel()).toBe(0.5);

    spawner.missionTimer = 300;
    expect(spawner.getThreatLevel()).toBe(1);
  });

  it("cleanup removes dead enemies", () => {
    const spawner = new EnemySpawner();
    const shipPos = { x: 0, y: 50, z: 0 };

    // Force-spawn then kill
    for (let i = 0; i < 200; i++) spawner.update(0.1, shipPos);
    const count = spawner.enemies.length;
    expect(count).toBeGreaterThan(0);

    spawner.enemies[0].stats.hull = 0;
    spawner.enemies[0].state = "dead";
    spawner.cleanup();

    expect(spawner.enemies.length).toBe(count - 1);
  });
});

describe("weapon system", () => {
  it("fires at nearest enemy in range", () => {
    const ws = new WeaponSystem();
    const shipPos = { x: 0, y: 50, z: 0 };
    const enemy = createEnemy("scout-fighter", { x: 100, y: 50, z: 0 });
    const systems = { energy: 100, energyMax: 100 };

    const hits = ws.update(shipPos, [enemy], systems, 1.0);
    expect(hits.length).toBe(1);
    expect(enemy.stats.hull).toBeLessThan(40);
    expect(systems.energy).toBeLessThan(100);
  });

  it("does not fire at enemies out of range", () => {
    const ws = new WeaponSystem();
    const shipPos = { x: 0, y: 50, z: 0 };
    const enemy = createEnemy("scout-fighter", { x: 999, y: 50, z: 0 });
    const systems = { energy: 100, energyMax: 100 };

    const hits = ws.update(shipPos, [enemy], systems, 1.0);
    expect(hits).toHaveLength(0);
    expect(enemy.stats.hull).toBe(40); // untouched
  });

  it("respects fire rate cooldown", () => {
    const ws = new WeaponSystem();
    const shipPos = { x: 0, y: 50, z: 0 };
    const enemy = createEnemy("patrol-cruiser", { x: 100, y: 50, z: 0 }); // hull 120
    const systems = { energy: 100, energyMax: 100 };

    // First shot
    ws.update(shipPos, [enemy], systems, 0.01);
    const hullAfterFirst = enemy.stats.hull;
    expect(hullAfterFirst).toBeLessThan(120);

    // Immediate second — should be on cooldown
    const hits2 = ws.update(shipPos, [enemy], systems, 0.01);
    expect(hits2).toHaveLength(0);
    expect(enemy.stats.hull).toBe(hullAfterFirst); // no additional damage
  });

  it("does not fire without energy", () => {
    const ws = new WeaponSystem();
    const shipPos = { x: 0, y: 50, z: 0 };
    const enemy = createEnemy("scout-fighter", { x: 100, y: 50, z: 0 });
    const systems = { energy: 0, energyMax: 100 };

    const hits = ws.update(shipPos, [enemy], systems, 1.0);
    expect(hits).toHaveLength(0);
  });
});
