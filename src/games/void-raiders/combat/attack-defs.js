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
 *
 * Damage role properties (added with the v2 mothership weapon catalog):
 *   damageVsShields  — multiplier applied to the shield slice (default 1.0)
 *   damageVsHull     — multiplier applied to the hull slice (default 1.0)
 *   aoeDamage        — bonus AOE damage when set, applied to nearby enemies
 *                      inside aoeRadius via linear falloff
 *   aoeRadius        — meters, AOE blast radius
 *   targetingRules   — object describing target eligibility + priority,
 *                      consumed by TurretSystem._pickTarget. Supported keys:
 *     priority         — "nearest" | "preferFast" | "preferShielded" |
 *                        "preferUnshielded" | "preferCluster" |
 *                        "preferHighestHull" | "preferLargeSlow"
 *     minHull          — skip targets with stats.hull below this
 *     maxHull          — skip targets with stats.hull above this
 *     requireShields   — only fire at targets with shields > 0
 *     skipShielded     — only fire at targets with no shields
 *     skipIfShieldsAbsorb — skip if (shields >= damage * damageVsShields)
 *     clusterRadius    — neighbour-counting radius (m) for preferCluster
 *     minClusterSize   — require N+ alive enemies inside clusterRadius
 *
 *   Homing (one-shot guided projectile, see homing-projectile-pool):
 *   homing            — { kp, kd, maxTurn } PID-style guidance gains.
 *                       maxTurn caps the steering rate in rad/s so fast
 *                       targets can outmanoeuvre the integrator.
 *
 *   Flak detonation (mid-air burst on proximity to ANY enemy):
 *   flakDetonationRange — meters, detonates within this distance of any
 *                         alive enemy after the arming delay
 *   flakArmingDistance  — meters travelled before flak fuse arms
 *
 *   Burst firing pattern:
 *   burstCount        — number of shots in a burst before the cooldown
 *   burstInterval     — seconds between shots within a burst
 *
 *   Shader visual cfg (consumed by weapon-shaders.js + TurretSystem):
 *   shaderStyle       — beam style id for createBeamShaderPool. One of:
 *                       "standard"      — point-defense pulse (default)
 *                       "shield-breaker"— tight bright cracker beam
 *                       "lightning"     — arc-emitter chain bolt with vertex
 *                                         jitter + branching forks
 *                       "railgun"       — razor-thin penetrator + impact flash
 *   chargeTime        — seconds of pre-fire charge-up at the muzzle (railgun)
 *   chargeColor       — hex color for the charge-up glow
 *   shockwaveColor    — hex color for the impact shockwave (flak / railgun)
 *   shockwaveRadius   — meters, max radius of the expanding fresnel shell
 *   shockwaveDuration — seconds, lifetime of the shockwave effect
 *   trailColor        — hex color for the projectile contrail (defaults to
 *                       projectileColor)
 *   trailWidth        — meters, half-width of the trail ribbon
 *   smokeyTrail       — 0..1, 1 = puffy contrail (missiles), 0 = ember (flak)
 *   muzzleFlashSize   — meters, radius of the per-shot muzzle flash
 *   muzzleFlashColor  — hex color for the muzzle flash (defaults to projectileColor)
 *   muzzleFlashDuration — seconds, lifetime of the muzzle flash
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

  // ─── New Enemy Attacks ─────────────────────────────────────
  "interceptor-burst": {
    id: "interceptor-burst",
    label: "Rapid Burst",
    damage: 4,
    speed: 180,
    fireRate: 2.0,
    range: 120,
    energyCost: 0,
    hitRadius: 4,
    spread: 0.06,

    projectileType: "bolt",
    projectileColor: 0xff8844,
    projectileSize: 0.4,
    trailLength: 2,

    impactEffect: "small",
    impactColor: 0xffaa66,
    screenShake: 0.02,
  },

  "bomber-torpedo": {
    id: "bomber-torpedo",
    label: "Plasma Torpedo",
    damage: 20,
    speed: 50,
    fireRate: 0.3,
    range: 180,
    energyCost: 0,
    hitRadius: 12,
    spread: 0.01,

    projectileType: "bolt",
    projectileColor: 0xff2266,
    projectileSize: 2.0,
    trailLength: 8,

    impactEffect: "large",
    impactColor: 0xff4488,
    screenShake: 0.15,
  },

  "cruiser-beam": {
    id: "cruiser-beam",
    label: "Heavy Beam",
    damage: 10,
    speed: 0,
    fireRate: 0.6,
    range: 220,
    energyCost: 0,
    accuracy: 0.75,

    projectileType: "beam",
    projectileColor: 0xcc3366,
    projectileSize: 0.5,
    trailLength: 0,
    beamDuration: 0.2,

    impactEffect: "medium",
    impactColor: 0xee4488,
    screenShake: 0.06,
  },

  "proximity-mine": {
    id: "proximity-mine",
    label: "Proximity Mine",
    damage: 15,
    speed: 20,
    fireRate: 0.4,
    range: 100,
    energyCost: 0,
    hitRadius: 15,
    spread: 0.0,

    projectileType: "bolt",
    projectileColor: 0xaaaa22,
    projectileSize: 1.5,
    trailLength: 0,

    impactEffect: "medium",
    impactColor: 0xdddd44,
    screenShake: 0.1,
  },

  // ─── New Player Weapons ───────────────────────────────────
  railgun: {
    id: "railgun",
    label: "Railgun",
    damage: 40,
    speed: 0,
    fireRate: 0.3,
    range: 400,
    energyCost: 8,
    accuracy: 0.98,

    projectileType: "beam",
    projectileColor: 0xeeeeff,
    projectileSize: 0.8,
    trailLength: 0,
    beamDuration: 0.05,

    impactEffect: "large",
    impactColor: 0xffffff,
    screenShake: 0.12,
  },

  "scatter-cannon": {
    id: "scatter-cannon",
    label: "Scatter Cannon",
    damage: 5,
    speed: 150,
    fireRate: 2.0,
    range: 120,
    energyCost: 3,
    hitRadius: 4,
    spread: 0.12,

    projectileType: "bolt",
    projectileColor: 0x88ffaa,
    projectileSize: 0.3,
    trailLength: 1,

    impactEffect: "small",
    impactColor: 0xaaffcc,
    screenShake: 0.02,
  },

  "plasma-lance": {
    id: "plasma-lance",
    label: "Plasma Lance",
    damage: 25,
    speed: 0,
    fireRate: 0.8,
    range: 250,
    energyCost: 5,
    accuracy: 0.88,

    projectileType: "beam",
    projectileColor: 0xff6600,
    projectileSize: 0.6,
    trailLength: 0,
    beamDuration: 0.3,

    impactEffect: "medium",
    impactColor: 0xff8833,
    screenShake: 0.08,
  },

  "missile-pod": {
    id: "missile-pod",
    label: "Missile Pod",
    damage: 18,
    speed: 60,
    fireRate: 1.0,
    range: 300,
    energyCost: 4,
    hitRadius: 10,
    spread: 0.05,

    projectileType: "bolt",
    projectileColor: 0xffcc00,
    projectileSize: 1.2,
    trailLength: 6,

    impactEffect: "large",
    impactColor: 0xffdd33,
    screenShake: 0.1,
  },

  // ─── Mothership Turret Catalog (v2) ────────────────────────
  // See combat/weapon-catalog.md for the design rationale. These are the
  // weapons the TurretSystem actually equips per slot. Each one has a
  // distinct firing rule + damage profile so the player can read its role
  // from the visual + tracer color alone.

  // Tier 4: Bridge cluster — point defense, anti-swarm
  "point-defense-pulse": {
    id: "point-defense-pulse",
    label: "Point-Defense Pulse",
    damage: 8,
    speed: 0,
    fireRate: 3.5,             // shots per second — very fast
    range: 220,
    energyCost: 1,
    accuracy: 0.92,

    damageVsShields: 1.0,
    damageVsHull: 0.8,         // tracer rounds skim heavy plate

    // Data-driven tactical routine (see combat/weapon-routines.js). When
    // set, the turret system runs the routine's evaluate() per candidate
    // instead of the legacy priority-string scorer below. The priority is
    // retained as a fallback for codepaths that bypass the routine layer.
    routineId: "point-defense-pd",
    targetingRules: {
      priority: "preferFast",  // swat scouts/interceptors first
      maxHull: 100,            // don't waste PD on capitals
    },

    projectileType: "beam",
    projectileColor: 0x66ddff, // pale blue
    projectileSize: 0.25,
    trailLength: 0,
    beamDuration: 0.18,

    // Shader visual cfg
    shaderStyle: "standard",
    muzzleFlashSize: 0.55,
    muzzleFlashColor: 0xaaffff,
    muzzleFlashDuration: 0.08,

    // Audio cues — read from TurretSystem fire/impact paths
    fireSfx: "weapon-pd-pulse",
    impactSfx: "hull-hit",

    impactEffect: "small",
    impactColor: 0x99eeff,
    screenShake: 0.01,
  },

  // Tier 4 alternate: anti-shield specialist for the centre bridge slot
  "arc-emitter": {
    id: "arc-emitter",
    label: "Arc Emitter",
    damage: 14,
    speed: 0,
    fireRate: 1.6,
    range: 260,
    energyCost: 4,
    accuracy: 0.90,

    damageVsShields: 2.0,      // shield SHREDDER
    damageVsHull: 0.4,         // glances off plate

    routineId: "arc-emitter-chain",
    targetingRules: {
      priority: "preferShielded",
      requireShields: true,    // do not fire at unshielded targets
    },

    projectileType: "beam",
    projectileColor: 0xcc66ff, // electric purple
    projectileSize: 0.65,
    trailLength: 0,
    beamDuration: 0.32,

    // Shader visual cfg — the showpiece. Vertex-jittered branching arc bolt.
    shaderStyle: "lightning",
    muzzleFlashSize: 0.9,
    muzzleFlashColor: 0xee99ff,
    muzzleFlashDuration: 0.12,

    // Audio cues — electric arc fire + shield ripple impact (matches purple)
    fireSfx: "weapon-arc-emitter",
    impactSfx: "shield-hit",

    impactEffect: "medium",
    impactColor: 0xee99ff,
    screenShake: 0.05,
  },

  // Tier 3: Mid pair — anti-swarm flak with mid-air detonation
  "flak-burst": {
    id: "flak-burst",
    label: "Flak Burst",
    damage: 6,                 // direct hit damage if it touches an enemy
    aoeDamage: 18,             // bonus AOE on detonation
    aoeRadius: 22,
    speed: 170,
    fireRate: 0.8,
    range: 320,
    energyCost: 5,
    hitRadius: 6,
    spread: 0.04,

    damageVsShields: 1.0,
    damageVsHull: 1.0,

    flakDetonationRange: 14,   // detonate within 14 m of any enemy
    flakArmingDistance: 40,    // arm fuse after travelling 40 m

    routineId: "flak-burst-swarm",
    targetingRules: {
      priority: "preferCluster",
      clusterRadius: 30,
      minClusterSize: 2,       // need 2+ enemies near each other or skip
    },

    projectileType: "bolt",
    projectileColor: 0xffbb33, // yellow
    projectileSize: 1.0,
    trailLength: 5,

    // Shader visual cfg — hot ember bolt + thin trail + spherical shockwave
    trailColor: 0xff8822,
    trailWidth: 0.55,
    smokeyTrail: 0.25,           // mostly hot ember, just a little puff
    muzzleFlashSize: 1.4,
    muzzleFlashColor: 0xffdd66,
    muzzleFlashDuration: 0.14,
    shockwaveColor: 0xffaa33,
    shockwaveRadius: 26,         // a hair larger than aoeRadius (22) so the
                                 // shell visibly bridges the falloff zone
    shockwaveDuration: 0.55,

    // Audio cues — heavy launch boom + dedicated airburst on detonation
    fireSfx: "weapon-flak-launch",
    impactSfx: "weapon-flak-detonate",

    impactEffect: "large",
    impactColor: 0xffdd66,
    screenShake: 0.12,
  },

  // Tier 3 alternate: shield-breaker burst beam for the symmetric pair
  "shield-breaker": {
    id: "shield-breaker",
    label: "Shield Breaker",
    damage: 10,
    speed: 0,
    fireRate: 0.9,             // bursts per second
    range: 300,
    energyCost: 3,
    accuracy: 0.92,

    damageVsShields: 2.2,
    damageVsHull: 0.5,

    burstCount: 3,
    burstInterval: 0.1,        // 3 quick pulses

    routineId: "shield-breaker-anti-shield",
    targetingRules: {
      priority: "preferShielded",
      requireShields: true,
    },

    projectileType: "beam",
    // Magenta-cyan shift — tighter and more violent than the PD pulse so
    // the player reads each pulse as a "shield cracker" hit.
    projectileColor: 0xff66ff,
    projectileSize: 0.35,
    trailLength: 0,
    beamDuration: 0.22,

    // Shader visual cfg — narrow razor beam, three quick pulses, sharp
    // leading edge so each shot reads as a violent stab at the shield.
    shaderStyle: "shield-breaker",
    muzzleFlashSize: 0.7,
    muzzleFlashColor: 0xff99ff,
    muzzleFlashDuration: 0.08,

    // Audio cues — sharp shield-cracker zap per pulse + shield ripple impact
    fireSfx: "weapon-shield-breaker",
    impactSfx: "shield-hit",

    impactEffect: "medium",
    impactColor: 0xff99ff,
    screenShake: 0.04,
  },

  // Tier 2: Mid-aft pair — PID-homing missiles
  "guided-missile": {
    id: "guided-missile",
    label: "Guided Missile",
    damage: 45,
    aoeDamage: 18,
    aoeRadius: 12,
    speed: 110,                // moderate so the homing has time to work
    fireRate: 1.8,             // ≈0.55s between shots in a burst
    range: 450,
    energyCost: 6,
    hitRadius: 8,
    spread: 0.0,               // homing handles the lead

    damageVsShields: 0.6,
    damageVsHull: 1.4,         // shaped charge — punches hulls

    burstCount: 6,             // matches revolver chamber count
    burstInterval: 0.55,

    homing: {
      kp: 3.0,                 // proportional gain — chase the target
      kd: 1.2,                 // derivative gain — react to target velocity
      maxTurn: 1.8,            // rad/s — caps how hard the missile can bend
    },

    routineId: "guided-missile-smart",
    targetingRules: {
      priority: "preferLargeSlow",
      minHull: 60,             // ignore scouts when there are bigger fish
    },

    projectileType: "bolt",
    projectileColor: 0xffaa22, // orange
    projectileSize: 1.2,
    trailLength: 6,

    // Shader visual cfg — bright thruster bolt + long puffy smoke contrail.
    // The trail is the missile's identity: you can track the homing curve
    // by following the smoke ribbon through the sky.
    trailColor: 0xff8844,
    trailWidth: 0.85,
    smokeyTrail: 1.0,            // full puffy contrail
    muzzleFlashSize: 1.6,
    muzzleFlashColor: 0xffcc66,
    muzzleFlashDuration: 0.16,
    shockwaveColor: 0xff8833,
    shockwaveRadius: 18,
    shockwaveDuration: 0.6,

    // Audio cues — rocket ignition launch + chemical explosion impact
    fireSfx: "weapon-missile-launch",
    impactSfx: "explosion-small",

    impactEffect: "large",
    impactColor: 0xffcc44,
    screenShake: 0.18,
  },

  // Tier 2 alternate: cluster-detonation missile (specialist swap)
  "flak-burst-missile": {
    id: "flak-burst-missile",
    label: "Cluster Missile",
    damage: 8,
    aoeDamage: 22,
    aoeRadius: 28,
    speed: 75,
    fireRate: 0.4,
    range: 380,
    energyCost: 7,
    hitRadius: 8,
    spread: 0.02,

    damageVsShields: 1.0,
    damageVsHull: 1.1,

    flakDetonationRange: 16,
    flakArmingDistance: 25,

    targetingRules: {
      priority: "preferCluster",
      clusterRadius: 32,
      minClusterSize: 2,
    },

    projectileType: "bolt",
    projectileColor: 0xffd544, // gold
    projectileSize: 1.4,
    trailLength: 7,

    impactEffect: "large",
    impactColor: 0xffe888,
    screenShake: 0.16,
  },

  // Tier 1: Aft pair — long-range armor-piercing precision
  "heavy-railgun": {
    id: "heavy-railgun",
    label: "Heavy Railgun",
    damage: 85,
    aoeDamage: 35,             // small kinetic AOE on impact
    aoeRadius: 14,
    speed: 0,                  // hitscan — instantaneous
    fireRate: 0.28,            // very slow
    range: 550,                // longest in the roster
    energyCost: 14,
    accuracy: 0.98,

    damageVsShields: 0.4,      // kinetic penetrator skips shields
    damageVsHull: 1.8,         // and rips hulls open

    routineId: "heavy-railgun-capital",
    targetingRules: {
      priority: "preferHighestHull",
      // Don't waste a railgun shot on a target whose shields would eat the
      // hit at the configured shield modifier — wait for the shield-breaker
      // to crack the target first.
      skipIfShieldsAbsorb: true,
    },

    projectileType: "beam",
    projectileColor: 0xeeeeff, // brilliant white-blue
    projectileSize: 0.7,
    trailLength: 0,
    beamDuration: 0.45,        // long enough to read the screen-filling flash

    // Shader visual cfg — the big-deal weapon. 0.4s charge-up at the muzzle,
    // then a razor-thin penetrator with a leading impact flash + a screen-
    // filling spherical shockwave. Every fire should feel like an event.
    shaderStyle: "railgun",
    chargeTime: 0.4,
    chargeColor: 0xaaccff,
    muzzleFlashSize: 2.4,
    muzzleFlashColor: 0xffffff,
    muzzleFlashDuration: 0.2,
    shockwaveColor: 0xccddff,
    shockwaveRadius: 32,       // the screen-filler — biggest in the roster
    shockwaveDuration: 0.7,

    // Audio cues — capacitor whine charge, devastating crack on fire,
    // huge electrical slam on impact (distinct from chemical explosion-large)
    chargeSfx: "weapon-railgun-charge",
    fireSfx: "weapon-railgun-fire",
    impactSfx: "weapon-railgun-impact",

    impactEffect: "large",
    impactColor: 0xffffff,
    screenShake: 0.25,
  },

  // Tier 4 alternate fallback: gatling pulse for upgrade swap
  "gatling-pulse": {
    id: "gatling-pulse",
    label: "Gatling Pulse",
    damage: 5,
    speed: 0,
    fireRate: 6.0,
    range: 180,
    energyCost: 0.5,
    accuracy: 0.80,

    damageVsShields: 0.7,
    damageVsHull: 1.3,

    targetingRules: {
      priority: "nearest",
      skipShielded: true,
    },

    projectileType: "beam",
    projectileColor: 0x88ff88, // green
    projectileSize: 0.2,
    trailLength: 0,
    beamDuration: 0.06,

    impactEffect: "small",
    impactColor: 0xaaffaa,
    screenShake: 0.01,
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
  interceptor: "interceptor-burst",
  bomber: "bomber-torpedo",
  "shielded-cruiser": "cruiser-beam",
  minelayer: "proximity-mine",
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
