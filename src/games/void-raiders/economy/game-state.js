/**
 * Persistent game state — survives between missions.
 *
 * Resources accumulate from tesseract deliveries.
 * Upgrades, drones, and research persist across raids.
 */

export const gameState = {
  // Starting resources for testing — remove or reduce for release
  resources: {
    "iron-ore": 5000,
    "crystal-shard": 2000,
    "plasma-core": 1000,
    "organic-matter": 1500,
    "salvage-parts": 2000,
  },
  mothership: {
    hull: 1000,
    hullMax: 1000,
    shields: 500,
    shieldsMax: 500,
    energy: 100,
    energyMax: 100,
    tesseractCapacity: 10000,
  },
  drones: [
    // Starter fleet
    { type: "worker-mining", count: 5 },
    { type: "offensive", count: 3 },
  ],
  research: {},
  missionsCompleted: 0,
  selectedRealm: null,
};

/**
 * Add resources from a completed mission's tesseract contents.
 * @param {object} contents — { "iron-ore": 500, "crystal-shard": 120, ... }
 */
export function deliverResources(contents) {
  for (const [type, amount] of Object.entries(contents)) {
    if (amount <= 0) continue;
    gameState.resources[type] = (gameState.resources[type] || 0) + Math.floor(amount);
  }
}

/**
 * Spend resources. Returns true if successful, false if insufficient.
 * @param {object} costs — { "iron-ore": 500, "crystal-shard": 200 }
 * @returns {boolean}
 */
export function spendResources(costs) {
  // Check availability first
  for (const [type, amount] of Object.entries(costs)) {
    if ((gameState.resources[type] || 0) < amount) return false;
  }
  // Deduct
  for (const [type, amount] of Object.entries(costs)) {
    gameState.resources[type] -= amount;
  }
  return true;
}

/**
 * Check if player can afford a cost.
 * @param {object} costs — { "iron-ore": 500, ... }
 * @returns {boolean}
 */
export function canAfford(costs) {
  for (const [type, amount] of Object.entries(costs)) {
    if ((gameState.resources[type] || 0) < amount) return false;
  }
  return true;
}
