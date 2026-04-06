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
    "copper-ore": 3000,
    "titanium-ore": 500,
    "crystal-shard": 2000,
    "quartz-crystal": 800,
    "plasma-core": 1000,
    "exotic-matter": 100,
    "organic-matter": 1500,
    "bio-compound": 400,
    "silicon-dust": 1200,
    "rare-earth": 300,
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
    // Starter fleet — upgrades array persists equipped upgrade IDs
    { type: "worker-mining", count: 5, upgrades: [] },
    { type: "offensive", count: 3, upgrades: [] },
  ],
  research: {},
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
