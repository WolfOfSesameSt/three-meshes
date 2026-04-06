/**
 * Enemy entities — alien ships and ground turrets.
 *
 * Enemies have simple AI: patrol, detect player drones/mothership,
 * pursue and attack. Data-driven via type definitions.
 */

let nextEnemyId = 0;

export const ENEMY_TYPES = {
  "scout-fighter": {
    label: "Scout Fighter",
    category: "ship",
    stats: { hull: 40, hullMax: 40, speed: 18, damage: 5, range: 150, fireRate: 1.0 },
    color: 0xff4444,
    size: [1.8, 0.5, 2.2],
    loot: { type: "salvage-parts", amount: [5, 15] },
  },
  "patrol-cruiser": {
    label: "Patrol Cruiser",
    category: "ship",
    stats: { hull: 120, hullMax: 120, speed: 10, damage: 12, range: 200, fireRate: 0.5 },
    color: 0xcc2222,
    size: [3.0, 1.0, 4.0],
    loot: { type: "salvage-parts", amount: [20, 50] },
  },
  turret: {
    label: "Defense Turret",
    category: "ground",
    stats: { hull: 80, hullMax: 80, speed: 0, damage: 8, range: 250, fireRate: 0.8 },
    color: 0xdd6633,
    size: [2.0, 3.0, 2.0],
    loot: { type: "salvage-parts", amount: [10, 30] },
  },
  interceptor: {
    label: "Interceptor",
    category: "ship",
    stats: { hull: 25, hullMax: 25, speed: 30, damage: 8, range: 120, fireRate: 2.0 },
    color: 0xff8844,
    size: [1.4, 0.4, 2.0],
    loot: { type: "salvage-parts", amount: [3, 10] },
  },
  bomber: {
    label: "Bomber",
    category: "ship",
    stats: { hull: 80, hullMax: 80, speed: 8, damage: 20, range: 180, fireRate: 0.3 },
    color: 0x882222,
    size: [3.5, 1.2, 4.5],
    loot: { type: "salvage-parts", amount: [25, 60] },
  },
  "shielded-cruiser": {
    label: "Shielded Cruiser",
    category: "ship",
    stats: { hull: 150, hullMax: 150, shields: 80, shieldsMax: 80, speed: 7, damage: 10, range: 220, fireRate: 0.6 },
    color: 0xcc3366,
    size: [3.5, 1.2, 5.0],
    loot: { type: "salvage-parts", amount: [30, 70] },
  },
  minelayer: {
    label: "Minelayer",
    category: "ship",
    stats: { hull: 50, hullMax: 50, speed: 12, damage: 15, range: 100, fireRate: 0.4 },
    color: 0x888822,
    size: [2.5, 0.8, 3.0],
    loot: { type: "salvage-parts", amount: [15, 35] },
  },
};

/**
 * Create an enemy entity.
 * @param {string} type — key from ENEMY_TYPES
 * @param {object} position — { x, y, z }
 */
export function createEnemy(type, position) {
  const def = ENEMY_TYPES[type];
  if (!def) throw new Error(`Unknown enemy type: ${type}`);

  return {
    id: nextEnemyId++,
    type,
    category: def.category,
    stats: { ...def.stats },
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    target: null,       // current attack target (drone or mothership)
    state: "patrol",    // patrol | pursuing | attacking | dead
    fireCooldown: 0,
    color: def.color,
    size: def.size,
  };
}

/**
 * Check if enemy is alive.
 */
export function isEnemyAlive(enemy) {
  return enemy.stats.hull > 0 && enemy.state !== "dead";
}
