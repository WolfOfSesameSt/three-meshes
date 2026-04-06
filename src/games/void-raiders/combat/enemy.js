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
