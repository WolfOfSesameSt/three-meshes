/**
 * Fairy Permaculture — livestock housing (C4.3 Branch C).
 *
 * Two primitive building kinds:
 *   • Coop     — house for chickens + ducks
 *   • GoatShed — house for dairy goats (and Dexter cattle later)
 *
 * Buildings provide:
 *   • Hunger resistance — housed animals lose hunger slower (free
 *     scratch / supplemental feed).
 *   • Predator resistance — at night they're inside, so overnight
 *     predator events (hawk, coyote) lose their target unless the
 *     building itself is hit (covered-by-canopy check happens in
 *     animal-manager based on building's `coveredByCanopy` flag).
 *
 * Buildings take damage from predator events when they're NOT covered
 * by canopy. `durability` ticks down; below 0 the building breaks and
 * no longer protects its occupants. Repairing is a role-action on
 * builder fairies, scheduled by the UX layer — not this module.
 */

let nextBuildingUid = 1;

/**
 * Create a chicken/duck coop.
 *
 * @param {number} x
 * @param {number} y
 * @returns {object} coop
 */
export function createCoop(x, y) {
  return {
    uid: `coop-${nextBuildingUid++}`,
    kind: 'coop',
    x,
    y,
    capacity: 8,
    occupants: new Set(),         // Set<animal.uid>
    durability: 1.0,
    coveredByCanopy: false,       // set by environment / canopy layer
    hungerResistance: 0.5,        // multiplies daily hunger gain
  };
}

/**
 * Create a goat shed (also used for small livestock pens).
 *
 * @param {number} x
 * @param {number} y
 * @returns {object} shed
 */
export function createGoatShed(x, y) {
  return {
    uid: `shed-${nextBuildingUid++}`,
    kind: 'goat-shed',
    x,
    y,
    capacity: 4,
    occupants: new Set(),
    durability: 1.0,
    coveredByCanopy: false,
    hungerResistance: 0.4,
  };
}

/**
 * Attempt to assign an animal to a building. Returns true if it fit.
 */
export function house(building, animal) {
  if (building.occupants.size >= building.capacity) return false;
  building.occupants.add(animal.uid);
  animal.buildingRef = building.uid;
  return true;
}

/**
 * Remove an animal from a building.
 */
export function unhouse(building, animal) {
  building.occupants.delete(animal.uid);
  if (animal.buildingRef === building.uid) animal.buildingRef = null;
}

/**
 * Apply damage from a predator event. Canopy-covered buildings absorb
 * the hit without losing durability (the predator can't get a clear
 * strike). Returns true if the building is still protecting occupants.
 *
 * @param {object} building
 * @param {number} dmg       0..1
 * @returns {boolean} still-protecting
 */
export function applyPredatorDamage(building, dmg) {
  if (building.coveredByCanopy) return building.durability > 0;
  building.durability = Math.max(0, building.durability - dmg);
  return building.durability > 0;
}

/** Alias for tests. */
export function __resetBuildingUids() {
  nextBuildingUid = 1;
}
