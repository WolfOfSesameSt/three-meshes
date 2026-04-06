/**
 * Test factory helpers for Void Raiders.
 *
 * Create game objects with sensible defaults for testing.
 * Override any property by passing partial config.
 * Nested objects are shallow-merged (overrides.stats merges into default stats).
 */

/**
 * Create a drone entity for testing.
 */
export function createDrone(overrides = {}) {
  return {
    id: overrides.id ?? `drone-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? 'worker-mining',
    stats: {
      hull: 50,
      hullMax: 50,
      speed: 15,
      cargoCapacity: 100,
      miningRate: 5,
      ...overrides.stats,
    },
    cargo: overrides.cargo ?? 0,
    position: { x: 0, y: 0, z: 0, ...overrides.position },
    upgradeSlots: overrides.upgradeSlots ?? 2,
    upgrades: overrides.upgrades ?? [],
    swarmId: overrides.swarmId ?? null,
    state: overrides.state ?? 'idle',
  };
}

/**
 * Create a swarm for testing.
 */
export function createSwarm(overrides = {}) {
  return {
    id: overrides.id ?? `swarm-${Math.random().toString(36).slice(2, 8)}`,
    drones: overrides.drones ?? [],
    routine: {
      anchor: 'follow-mothership',
      range: 'standard',
      priority: 'nearest',
      action: 'mine',
      retreat: 'cargo-full',
      ...overrides.routine,
    },
  };
}

/**
 * Create a mothership for testing.
 */
export function createMothership(overrides = {}) {
  return {
    systems: {
      hull: 1000,
      hullMax: 1000,
      shields: 500,
      shieldsMax: 500,
      energy: 100,
      energyMax: 100,
      energyProduction: 10,
      ...overrides.systems,
    },
    position: { x: 0, y: 0, z: 0, ...overrides.position },
    speed: overrides.speed ?? 10,
    weapons: overrides.weapons ?? [],
    tesseract: {
      capacity: 10000,
      contents: {},
      ...overrides.tesseract,
    },
  };
}

/**
 * Create a resource deposit for testing.
 */
export function createDeposit(overrides = {}) {
  return {
    id: overrides.id ?? `deposit-${Math.random().toString(36).slice(2, 8)}`,
    resourceType: overrides.resourceType ?? 'iron-ore',
    amount: overrides.amount ?? 1000,
    position: { x: 100, y: 0, z: 100, ...overrides.position },
    miningDifficulty: overrides.miningDifficulty ?? 1.0,
  };
}

/**
 * Create an enemy entity for testing.
 */
export function createEnemy(overrides = {}) {
  return {
    id: overrides.id ?? `enemy-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? 'scout-fighter',
    stats: {
      hull: 30,
      speed: 40,
      damage: 8,
      range: 300,
      ...overrides.stats,
    },
    position: { x: 500, y: 0, z: 500, ...overrides.position },
    state: overrides.state ?? 'patrol',
  };
}

/**
 * Create a simple realm config for testing.
 */
export function createRealmConfig(overrides = {}) {
  return {
    seed: overrides.seed ?? 12345,
    tier: overrides.tier ?? 1,
    size: overrides.size ?? 10000,
    biomes: overrides.biomes ?? ['desert', 'rocky'],
    resourceDensity: overrides.resourceDensity ?? 0.6,
    settlementCount: overrides.settlementCount ?? [2, 5],
    militaryStrength: overrides.militaryStrength ?? 0.3,
    alienAdvancement: overrides.alienAdvancement ?? 'low',
  };
}
