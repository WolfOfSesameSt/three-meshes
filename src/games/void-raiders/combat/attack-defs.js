/**
 * Attack definitions — portable weapon data used by ANY unit in the game.
 *
 * Each attack defines its damage, projectile, visual, collision, and timing.
 * Units (drones, enemies, mothership) reference an attack def by ID.
 * New attacks are added here — no code changes needed elsewhere.
 *
 * Collision properties:
 *   accuracy  — 0-1, hitscan hit chance (reduced by target speed)
 *   hitRadius — meters, projectile proximity check distance
 *   spread    — 0-1, projectile aim spread (0 = perfect, 0.1 = sloppy)
 */

export const ATTACKS = {
  // ─── Player Drone Attacks ──────────────────────────────────
  "drone-laser": {
    id: "drone-laser",
    label: "Drone Laser",
    damage: 10,
    speed: 0,
    fireRate: 1.5,
    range: 150,
    energyCost: 0,
    accuracy: 0.85,         // hitscan: 85% base, reduced by target speed

    projectileType: "beam",
    projectileColor: 0x44aaff,
    projectileSize: 0.3,
    trailLength: 0,
    beamDuration: 0.1,

    impactEffect: "small",
    impactColor: 0x66bbff,
    screenShake: 0,
  },

  // ─── Mothership Attacks ────────────────────────────────────
  "pulse-laser": {
    id: "pulse-laser",
    label: "Pulse Laser",
    damage: 15,
    speed: 0,
    fireRate: 1.5,
    range: 300,
    energyCost: 2,
    accuracy: 0.95,         // mothership has good targeting

    projectileType: "beam",
    projectileColor: 0x88ccff,
    projectileSize: 0.6,
    trailLength: 0,
    beamDuration: 0.15,

    impactEffect: "medium",
    impactColor: 0xaaddff,
    screenShake: 0.05,
  },

  // ─── Enemy Attacks ─────────────────────────────────────────
  "alien-plasma-bolt": {
    id: "alien-plasma-bolt",
    label: "Plasma Bolt",
    damage: 5,
    speed: 120,
    fireRate: 1.0,
    range: 150,
    energyCost: 0,
    hitRadius: 6,           // proximity check radius in meters
    spread: 0.04,           // slight aim spread

    projectileType: "bolt",
    projectileColor: 0xff4444,
    projectileSize: 0.6,
    trailLength: 4,

    impactEffect: "small",
    impactColor: 0xff6644,
    screenShake: 0.03,
  },

  "alien-heavy-cannon": {
    id: "alien-heavy-cannon",
    label: "Heavy Cannon",
    damage: 12,
    speed: 80,
    fireRate: 0.5,
    range: 200,
    energyCost: 0,
    hitRadius: 8,           // bigger projectile = easier to hit
    spread: 0.02,           // more accurate

    projectileType: "bolt",
    projectileColor: 0xff2222,
    projectileSize: 1.0,
    trailLength: 6,

    impactEffect: "medium",
    impactColor: 0xff4422,
    screenShake: 0.08,
  },

  "turret-beam": {
    id: "turret-beam",
    label: "Defense Beam",
    damage: 8,
    speed: 0,
    fireRate: 0.8,
    range: 250,
    energyCost: 0,
    accuracy: 0.80,         // turrets are decent but not perfect

    projectileType: "beam",
    projectileColor: 0xffaa22,
    projectileSize: 0.4,
    trailLength: 0,
    beamDuration: 0.12,

    impactEffect: "small",
    impactColor: 0xffcc44,
    screenShake: 0.04,
  },

  // ─── Repair Beam (visual only, always hits) ────────────────
  "repair-beam": {
    id: "repair-beam",
    label: "Repair Beam",
    damage: 0,
    speed: 0,
    fireRate: 3.0,
    range: 30,
    energyCost: 0,
    accuracy: 1.0,          // repair always connects

    projectileType: "beam",
    projectileColor: 0x44ddff,
    projectileSize: 0.2,
    trailLength: 0,
    beamDuration: 0.1,

    impactEffect: "none",
    impactColor: 0x44ddff,
    screenShake: 0,
  },

  // ─── Mining Beam (visual only, always hits) ────────────────
  "mining-beam": {
    id: "mining-beam",
    label: "Mining Beam",
    damage: 0,
    speed: 0,
    fireRate: 4.0,
    range: 30,
    energyCost: 0,
    accuracy: 1.0,          // mining always connects

    projectileType: "beam",
    projectileColor: 0x44ff88,
    projectileSize: 0.2,
    trailLength: 0,
    beamDuration: 0.08,

    impactEffect: "none",
    impactColor: 0x44ff88,
    screenShake: 0,
  },
};

/**
 * Get attack def by ID.
 */
export function getAttack(id) {
  return ATTACKS[id] ?? null;
}

/**
 * Default attack for an enemy type.
 */
export const ENEMY_ATTACK_MAP = {
  "scout-fighter": "alien-plasma-bolt",
  "patrol-cruiser": "alien-heavy-cannon",
  turret: "turret-beam",
};

/**
 * Default attack for a drone type.
 */
export const DRONE_ATTACK_MAP = {
  offensive: "drone-laser",
  "worker-mining": "mining-beam",
  "worker-looting": null,
  "worker-repair": "repair-beam",
};
