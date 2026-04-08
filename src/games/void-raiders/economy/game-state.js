/**
 * Persistent game state — survives between missions.
 *
 * Resources accumulate from tesseract deliveries.
 * Upgrades, drones, and research persist across raids.
 */

// Test-mode resource floors. Both the in-memory default AND any loaded save
// get topped up to at least these values so the player can always afford
// every craftable / buyable in the game while we playtest the new weapons.
// Drop these to release-tuned numbers when shipping.
export const TEST_RESOURCE_FLOORS = {
  "iron-ore": 50000,
  "copper-ore": 50000,
  "titanium-ore": 25000,
  "crystal-shard": 25000,
  "quartz-crystal": 25000,
  "plasma-core": 25000,
  "exotic-matter": 10000,
  "organic-matter": 25000,
  "bio-compound": 25000,
  "silicon-dust": 25000,
  "rare-earth": 25000,
  "salvage-parts": 50000,
};

export const gameState = {
  // Starting resources for testing — remove or reduce for release
  resources: { ...TEST_RESOURCE_FLOORS },
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
    // Starter fleet — upgrades array persists equipped upgrade IDs
    { type: "worker-mining", count: 5, upgrades: [] },
    { type: "offensive", count: 3, upgrades: [] },
  ],
  research: {
    // Repair bay — default-unlocked while we playtest the feature.
    // Remove these five flags (or reset them to {}) when we want players
    // to earn the repair bay via the research tree again.
    "repair-bay-unlock": true,
    "repair-bay-speed": true,
    "repair-bay-efficiency": true,
    "repair-bay-replicator": true,
    "repair-bay-capacity": true,
  },
  missionsCompleted: 0,
  shipsLost: 0,
  selectedRealm: null,

  /**
   * Wreck data from the last ship death. Set on destruction, cleared after
   * salvage mission completes or player declines salvage.
   * Shape: { seed, position: {x,y,z}, lostCargo: {}, lostDrones: [] }
   */
  wreckData: null,
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

/**
 * Record a ship death — increments shipsLost, stores wreck data for salvage.
 *
 * Station resources, research, and drones at the station are preserved.
 * Everything on board the ship (cargo + deployed drones) is lost.
 *
 * @param {object} opts
 * @param {object} opts.position — { x, y, z } death location
 * @param {object} opts.lostCargo — { "iron-ore": 500, ... }
 * @param {Array}  opts.lostDrones — [{ type, count }]
 * @param {number} opts.seed — realm seed for salvage mission
 */
export function recordShipDeath({ position, lostCargo, lostDrones, seed }) {
  gameState.shipsLost++;
  gameState.wreckData = {
    seed: seed ?? Date.now(),
    position: { x: position.x, y: position.y, z: position.z },
    lostCargo: { ...lostCargo },
    lostDrones: lostDrones.map(d => ({ ...d })),
  };
}

/**
 * Calculate salvage recovery from a wreck.
 * Recovers 30-50% of each lost item (random per item type).
 *
 * @param {object} wreckData — gameState.wreckData
 * @returns {{ cargo: object, drones: Array }}
 */
export function calculateSalvageRecovery(wreckData) {
  if (!wreckData) return { cargo: {}, drones: [] };

  const cargo = {};
  for (const [type, amount] of Object.entries(wreckData.lostCargo)) {
    const recoveryPct = 0.3 + Math.random() * 0.2; // 30-50%
    cargo[type] = Math.floor(amount * recoveryPct);
  }

  const drones = wreckData.lostDrones.map(d => ({
    type: d.type,
    count: Math.floor(d.count * (0.3 + Math.random() * 0.2)),
  }));

  return { cargo, drones };
}

/**
 * Clear wreck data after salvage mission or decline.
 */
export function clearWreckData() {
  gameState.wreckData = null;
}
