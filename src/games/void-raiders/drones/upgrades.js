/**
 * Drone Upgrade System — definitions, equip/remove, and queries.
 *
 * Each upgrade has a slot type, stat bonuses, and a resource cost.
 * Drones have a fixed number of upgrade slots (2 base, up to 8 advanced).
 * A drone's effective role = type + equipped upgrades + swarm routine.
 */

export const SLOT_TYPES = ["tool", "weapon", "shield", "engine", "hull"];

export const DRONE_UPGRADES = {
  "mining-laser-mk2": {
    id: "mining-laser-mk2",
    label: "Mining Laser Mk.II",
    slotType: "tool",
    statBonus: { miningRate: 3 },
    cost: { "iron-ore": 300, "crystal-shard": 100 },
  },
  "shield-module": {
    id: "shield-module",
    label: "Shield Module",
    slotType: "shield",
    statBonus: { shieldsMax: 15, shields: 15 },
    cost: { "crystal-shard": 200, "plasma-core": 50 },
  },
  "hull-plating": {
    id: "hull-plating",
    label: "Hull Plating",
    slotType: "hull",
    statBonus: { hullMax: 20, hull: 20 },
    cost: { "iron-ore": 200 },
  },
  "thruster-boost": {
    id: "thruster-boost",
    label: "Thruster Boost",
    slotType: "engine",
    statBonus: { speed: 5 },
    cost: { "iron-ore": 150, "plasma-core": 30 },
  },
  "cargo-expander": {
    id: "cargo-expander",
    label: "Cargo Expander",
    slotType: "tool",
    statBonus: { cargoCapacity: 50 },
    cost: { "iron-ore": 250 },
  },
  "weapon-uplink": {
    id: "weapon-uplink",
    label: "Weapon Uplink",
    slotType: "weapon",
    statBonus: { damage: 5 },
    cost: { "salvage-parts": 200, "crystal-shard": 100 },
  },
  "repair-kit": {
    id: "repair-kit",
    label: "Repair Kit",
    slotType: "tool",
    statBonus: { repairRate: 4 },
    cost: { "iron-ore": 200, "organic-matter": 100 },
  },
};

/**
 * Check if a drone can equip a given upgrade.
 * Returns true if the drone has a free slot and the upgrade ID is valid.
 *
 * @param {object} drone — drone entity (must have upgradeSlots and upgrades)
 * @param {string} upgradeId — key into DRONE_UPGRADES
 * @returns {boolean}
 */
export function canEquip(drone, upgradeId) {
  const def = DRONE_UPGRADES[upgradeId];
  if (!def) return false;
  if (drone.upgrades.length >= drone.upgradeSlots) return false;
  return true;
}

/**
 * Equip an upgrade on a drone — adds to upgrades array and applies stat bonuses.
 * Does NOT check affordability or deduct resources (caller handles that).
 * Returns true if equipped, false if no room or invalid upgrade.
 *
 * @param {object} drone
 * @param {string} upgradeId
 * @returns {boolean}
 */
export function equipUpgrade(drone, upgradeId) {
  if (!canEquip(drone, upgradeId)) return false;

  const def = DRONE_UPGRADES[upgradeId];
  drone.upgrades.push(upgradeId);

  // Apply stat bonuses
  for (const [stat, bonus] of Object.entries(def.statBonus)) {
    drone.stats[stat] = (drone.stats[stat] || 0) + bonus;
  }

  return true;
}

/**
 * Remove an upgrade from a drone by slot index and revert its stat bonuses.
 * Returns the removed upgrade ID, or null if index is invalid.
 *
 * @param {object} drone
 * @param {number} slotIndex — index into drone.upgrades
 * @returns {string|null} — the removed upgrade ID
 */
export function removeUpgrade(drone, slotIndex) {
  if (slotIndex < 0 || slotIndex >= drone.upgrades.length) return null;

  const upgradeId = drone.upgrades[slotIndex];
  const def = DRONE_UPGRADES[upgradeId];

  // Revert stat bonuses
  if (def) {
    for (const [stat, bonus] of Object.entries(def.statBonus)) {
      drone.stats[stat] = (drone.stats[stat] || 0) - bonus;
    }
  }

  drone.upgrades.splice(slotIndex, 1);
  return upgradeId;
}

/**
 * List upgrades that can fit in the drone's available slots.
 * Returns an array of upgrade definition objects.
 *
 * @param {object} drone
 * @returns {object[]}
 */
export function getAvailableUpgrades(drone) {
  if (drone.upgrades.length >= drone.upgradeSlots) return [];
  return Object.values(DRONE_UPGRADES);
}

/**
 * Apply stored upgrade IDs to a freshly-created drone's stats.
 * Used at mission start to restore persistent upgrades onto new drone instances.
 *
 * @param {object} drone — fresh drone entity
 * @param {string[]} upgradeIds — saved upgrade IDs from game state
 */
export function applyStoredUpgrades(drone, upgradeIds) {
  for (const id of upgradeIds) {
    const def = DRONE_UPGRADES[id];
    if (!def) continue;
    drone.upgrades.push(id);
    for (const [stat, bonus] of Object.entries(def.statBonus)) {
      drone.stats[stat] = (drone.stats[stat] || 0) + bonus;
    }
  }
}
