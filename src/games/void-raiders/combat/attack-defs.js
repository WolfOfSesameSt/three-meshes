/**
 * Attack definitions — portable weapon data used by ANY unit in the game.
 *
 * Each attack defines its damage, projectile, visual, and timing properties.
 * Units (drones, enemies, mothership) reference an attack def by ID.
 * New attacks are added here — no code changes needed elsewhere.
 */

export const ATTACKS = {
  // ─── Player Drone Attacks ──────────────────────────────────
  "drone-laser": {
    id: "drone-laser",
    label: "Drone Laser",
    damage: 10,
    speed: 0,             // 0 = hitscan (instant beam)
    fireRate: 1.5,        // shots per second
    range: 150,
    energyCost: 0,

    // Visual
    projectileType: "beam",
    projectileColor: 0x44aaff,
    projectileSize: 0.3,
    trailLength: 0,
    beamDuration: 0.1,

    // Impact
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
    speed: 120,           // m/s projectile travel speed
    fireRate: 1.0,
    range: 150,
    energyCost: 0,

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

    projectileType: "beam",
    projectileColor: 0xffaa22,
    projectileSize: 0.4,
    trailLength: 0,
    beamDuration: 0.12,

    impactEffect: "small",
    impactColor: 0xffcc44,
    screenShake: 0.04,
  },

  // ─── Repair Beam (visual only, healing handled by routine) ──
  "repair-beam": {
    id: "repair-beam",
    label: "Repair Beam",
    damage: 0,
    speed: 0,
    fireRate: 3.0,
    range: 30,
    energyCost: 0,

    projectileType: "beam",
    projectileColor: 0x44ddff,
    projectileSize: 0.2,
    trailLength: 0,
    beamDuration: 0.1,

    impactEffect: "none",
    impactColor: 0x44ddff,
    screenShake: 0,
  },

  // ─── Mining "Attack" (visual only, damage handled by routine) ─
  "mining-beam": {
    id: "mining-beam",
    label: "Mining Beam",
    damage: 0,            // damage handled by the mine action, not this
    speed: 0,
    fireRate: 4.0,        // visual pulse rate
    range: 30,
    energyCost: 0,

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
