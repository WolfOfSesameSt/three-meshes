/**
 * Fairy Permaculture — per-animal runtime state (C4.3).
 *
 * One "instance" per concrete animal on the farm (one chicken, one
 * goat, one cow, etc.). Honeybee colonies are modelled at the
 * `hive.js` level — a single hive object stands in for a whole
 * colony; we only spawn individual bee *instances* as a visual swarm
 * around the hive. Mason bees are wild and colonize a tube-station
 * (also a hive building).
 *
 * The shape is intentionally small. Animal-manager owns the pool of
 * these and drives their per-day tick.
 */

let nextUid = 1;

/**
 * @typedef {Object} AnimalInstance
 * @property {number} uid              unique per-run id
 * @property {string} id               species id (matches animals.json)
 * @property {number} x                world x (meters)
 * @property {number} y                world y (meters)
 * @property {number} age              days alive
 * @property {number} health           0..1
 * @property {number} hunger           0..1 (0 full, 1 starving)
 * @property {Object<string,number>} productStock  per-product pending
 * @property {number|null} lastMilked  day index of last milk harvest
 * @property {number|null} lastEggCount number of eggs pending last collection
 * @property {?string} buildingRef     uid of coop / shed that houses it
 */

/**
 * Construct a new animal instance.
 *
 * @param {string} speciesId
 * @param {number} x
 * @param {number} y
 * @returns {AnimalInstance}
 */
export function createAnimal(speciesId, x, y) {
  return {
    uid: nextUid++,
    id: speciesId,
    x,
    y,
    age: 0,
    health: 1.0,
    hunger: 0.2,
    productStock: {},
    lastMilked: null,
    lastEggCount: 0,
    buildingRef: null,
  };
}

/**
 * Reset internal uid counter — tests only.
 */
export function __resetUids() {
  nextUid = 1;
}
