/**
 * Drone entity — data representation of a single drone.
 * No rendering logic here — that's handled by fleet-renderer.js.
 */

let nextId = 0;

/**
 * @param {object} opts
 * @param {string} opts.type - 'worker-mining' | 'worker-looting' | 'worker-repair' | 'offensive'
 * @param {object} [opts.stats]
 * @returns {object}
 */
export function createDrone(opts = {}) {
  const type = opts.type ?? "worker-mining";

  const baseStats = {
    "worker-mining": { hull: 40, hullMax: 40, shields: 0, shieldsMax: 0, speed: 12, cargoCapacity: 100, miningRate: 5 },
    "worker-looting": { hull: 35, hullMax: 35, shields: 0, shieldsMax: 0, speed: 14, cargoCapacity: 150, miningRate: 0 },
    "worker-repair": { hull: 30, hullMax: 30, shields: 0, shieldsMax: 0, speed: 16, cargoCapacity: 0, repairRate: 8 },
    offensive: { hull: 60, hullMax: 60, shields: 20, shieldsMax: 20, speed: 20, damage: 10, range: 200 },
  };

  return {
    id: nextId++,
    type,
    stats: { ...baseStats[type], ...opts.stats },
    cargo: 0,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    targetPosition: null,
    state: "idle", // idle | deploying | active | returning | destroyed
    swarmId: null,
    upgradeSlots: opts.upgradeSlots ?? 2,
    upgrades: [],
  };
}

/**
 * Check if drone is alive.
 */
export function isDroneAlive(drone) {
  return drone.stats.hull > 0 && drone.state !== "destroyed";
}

/**
 * Apply damage to a drone (shields absorb first, then hull).
 */
export function damageDrone(drone, amount) {
  // Shields absorb first
  if (drone.stats.shields > 0) {
    const absorbed = Math.min(drone.stats.shields, amount);
    drone.stats.shields -= absorbed;
    amount -= absorbed;
  }
  drone.stats.hull = Math.max(0, drone.stats.hull - amount);
  if (drone.stats.hull <= 0) {
    drone.state = "destroyed";
  }
}
