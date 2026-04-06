/**
 * Fleet manager — coordinates drone spawning, movement, and swarm behavior.
 *
 * Handles deploying drones from the mothership, AI routine evaluation,
 * target-based movement, and state transitions.
 */

import { createDrone, isDroneAlive } from "./drone.js";
import { createSwarm, addDroneToSwarm, updateSwarmAnchor } from "./swarm.js";
import { evaluateRoutine, resolveAnchor, ACTION_TYPES } from "./routine.js";
import { DRONE_ATTACK_MAP, getAttack } from "../combat/attack-defs.js";

const DEPLOY_INTERVAL = 0.15; // seconds between each drone launch
const DEPLOY_SPREAD = 30;     // meters spread behind mothership on deploy
const ENGAGE_RANGE = 30;      // meters — close enough to execute action on target
const OFFLOAD_RANGE = 25;     // meters — close enough to mothership to dump cargo
const RETREAT_SPEED_MULT = 1.3; // retreating drones move faster

/**
 * Fleet manager owns all drones and swarms.
 */
export class FleetManager {
  constructor() {
    this.drones = [];
    this.swarms = [];
    this._deployQueue = [];
    this._deployTimer = 0;

    // Game context — updated each frame by the game loop
    this.context = {
      mothershipPos: { x: 0, y: 0, z: 0 },
      deposits: [],
      enemies: [],
      friendlies: [],
      lootables: [],
      projectiles: [],
      recallActive: false,
    };

    // External system references (set by main.js)
    this.mothership = null;
    this.attackSystem = null;
    this.combatEffects = null;
  }

  /**
   * Create a starter fleet — a mining swarm and an offensive swarm.
   * @param {number} minerCount
   * @param {number} fighterCount
   */
  createStarterFleet(minerCount = 5, fighterCount = 3) {
    const minerSwarm = createSwarm({
      routine: { anchor: "track-resource", range: 300, priority: "nearest", action: "mine", retreat: "cargo-full" },
    });
    const fighterSwarm = createSwarm({
      routine: { anchor: "follow-mothership", range: 400, priority: "weakest", action: "attack", retreat: "health-low" },
    });

    for (let i = 0; i < minerCount; i++) {
      const drone = createDrone({ type: "worker-mining" });
      drone.state = "deploying";
      addDroneToSwarm(minerSwarm, drone);
      this.drones.push(drone);
      this._deployQueue.push(drone);
    }

    for (let i = 0; i < fighterCount; i++) {
      const drone = createDrone({ type: "offensive" });
      drone.state = "deploying";
      addDroneToSwarm(fighterSwarm, drone);
      this.drones.push(drone);
      this._deployQueue.push(drone);
    }

    this.swarms.push(minerSwarm, fighterSwarm);
  }

  /**
   * Update all drones and swarms.
   * @param {number} dt — delta time
   * @param {number} elapsed — total elapsed time
   * @param {object} mothershipPos — { x, y, z }
   */
  update(dt, elapsed, mothershipPos) {
    this.context.mothershipPos = mothershipPos;
    // Friendlies = alive drones + mothership (for repair targeting)
    const aliveDrones = this.drones.filter((d) => isDroneAlive(d));
    this.context.friendlies = [...aliveDrones];
    // Add mothership as a repair target if it exists and is damaged
    if (this.mothership) {
      this.context.friendlies.push(this.mothership);
    }

    // Decay fire cooldowns, regen shields, and check for deaths
    this._updateDroneCooldowns(dt);
    this._regenDroneShields(dt);
    this._checkDroneDeaths();

    // Deploy drones sequentially from the mothership
    this._processDeployQueue(dt, mothershipPos);

    // Per-swarm: resolve anchor, then evaluate + move each drone
    for (const swarm of this.swarms) {
      updateSwarmAnchor(swarm, mothershipPos);
      const anchorPos = resolveAnchor(swarm.routine, swarm, this.context);

      for (const drone of swarm.drones) {
        if (!isDroneAlive(drone)) continue;
        if (drone.state === "deploying") continue;

        // Evaluate AI routine
        const result = evaluateRoutine(drone, swarm.routine, anchorPos, this.context);

        if (result.retreating) {
          // Return to mothership
          const distToShip = dist3(drone.position, mothershipPos);
          if (distToShip <= OFFLOAD_RANGE) {
            // At mothership — offload cargo
            this._offloadCargo(drone);
            // After offloading, go back to active duty
            drone.state = "active";
          } else {
            this._moveToward(drone, mothershipPos, dt, RETREAT_SPEED_MULT);
            drone.state = "returning";
          }
        } else if (result.target) {
          // Move toward target
          const targetPos = result.target.position;
          const distToTarget = dist3(drone.position, targetPos);

          if (distToTarget <= ENGAGE_RANGE) {
            // Close enough — execute action
            const actionDef = ACTION_TYPES[result.type];
            if (actionDef) actionDef.execute(drone, result.target, dt);

            // Fire visual attack through attack system
            this._fireDroneAttack(drone, result.target, result.type);

            // Hover near target with slight orbit
            this._orbitAround(drone, targetPos, ENGAGE_RANGE * 0.5, elapsed, dt);
          } else {
            // Move toward target
            this._moveToward(drone, targetPos, dt, 1.0);
          }
          drone.state = "active";
        } else {
          // No target — idle orbit around anchor
          this._orbitAround(drone, anchorPos, swarm.routine.range * 0.4, elapsed, dt);
          drone.state = "active";
        }
      }
    }
  }

  /**
   * Process the deploy queue — launch drones one at a time from the mothership.
   */
  _processDeployQueue(dt, mothershipPos) {
    if (this._deployQueue.length === 0) return;

    this._deployTimer += dt;
    if (this._deployTimer < DEPLOY_INTERVAL) return;
    this._deployTimer = 0;

    const drone = this._deployQueue.shift();
    const spread = (Math.random() - 0.5) * DEPLOY_SPREAD;
    drone.position.x = mothershipPos.x + spread;
    drone.position.y = mothershipPos.y - 5;
    drone.position.z = mothershipPos.z + 15;
    drone.state = "active";
  }

  /**
   * Move a drone toward a target position.
   */
  _moveToward(drone, target, dt, speedMult) {
    const dx = target.x - drone.position.x;
    const dy = (target.y ?? drone.position.y) - drone.position.y;
    const dz = target.z - drone.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 2) return;

    const speed = drone.stats.speed * speedMult * dt;
    const factor = Math.min(speed / dist, 1);

    drone.velocity.x = dx * factor / dt;
    drone.velocity.y = dy * factor / dt;
    drone.velocity.z = dz * factor / dt;

    drone.position.x += dx * factor;
    drone.position.y += dy * factor;
    drone.position.z += dz * factor;
  }

  /**
   * Orbit a drone around a position for idle/engage behavior.
   */
  _orbitAround(drone, center, radius, elapsed, dt) {
    const phase = drone.id * 2.399 + elapsed * (0.3 + (drone.id % 5) * 0.1);
    const r = radius + (drone.id % 7) * (radius * 0.15);

    const targetX = center.x + Math.cos(phase) * r;
    const targetZ = center.z + Math.sin(phase) * r;
    const targetY = (center.y ?? 0) + Math.sin(phase * 0.7 + drone.id) * 8 + 5;

    this._moveToward(drone, { x: targetX, y: targetY, z: targetZ }, dt, 1.0);
  }

  /**
   * Fire a visual attack from a drone (beam or bolt via attack system).
   * Rate-limited by drone's internal fire cooldown.
   */
  _fireDroneAttack(drone, target, actionType) {
    if (!this.attackSystem) return;

    // Only fire visual attacks for combat and mining
    const attackId = DRONE_ATTACK_MAP[drone.type];
    if (!attackId) return;

    // Rate-limit visual firing per drone
    if (!drone._fireCooldown) drone._fireCooldown = 0;
    if (drone._fireCooldown > 0) return;

    const attackDef = getAttack(attackId);
    if (!attackDef) return;

    // All drone visuals are visual-only (damage/healing handled by routine execute)
    if (actionType === "mine" || actionType === "repair") {
      // Mining and repair beams — damage=0, just visual
      this.attackSystem.fire(drone, target, attackDef);
    } else if (actionType === "attack") {
      // Combat attack — damage already applied by routine, fire visual only
      const visualDef = { ...attackDef, damage: 0 };
      this.attackSystem.fire(drone, target, visualDef);
    }

    drone._fireCooldown = 1.0 / attackDef.fireRate;
  }

  /**
   * Decay drone fire cooldowns.
   */
  _updateDroneCooldowns(dt) {
    for (const drone of this.drones) {
      if (drone._fireCooldown > 0) {
        drone._fireCooldown -= dt;
      }
    }
  }

  /**
   * Check for newly destroyed drones and spawn death effects.
   */
  _checkDroneDeaths() {
    if (!this.combatEffects) return;
    for (const drone of this.drones) {
      if (drone.stats.hull <= 0 && drone.state !== "destroyed" && !drone._deathEffectSpawned) {
        drone.state = "destroyed";
        drone._deathEffectSpawned = true;
        this.combatEffects.addDeathEffect(
          drone.position,
          "scout-fighter", // size approximation
          drone.type === "offensive" ? 0x6688ff : 0x44dd88
        );
      }
    }
  }

  /**
   * Regenerate shields on drones that have shield capacity.
   * Rate is set externally (from power allocation system).
   */
  _regenDroneShields(dt) {
    const regenRate = this.droneShieldRegenRate ?? 0.5; // shields per second per drone
    for (const drone of this.drones) {
      if (!isDroneAlive(drone)) continue;
      if (drone.stats.shieldsMax <= 0) continue;
      if (drone.stats.shields >= drone.stats.shieldsMax) continue;
      drone.stats.shields = Math.min(
        drone.stats.shieldsMax,
        drone.stats.shields + regenRate * dt
      );
    }
  }

  /**
   * Offload drone's cargo into the mothership's tesseract.
   */
  _offloadCargo(drone) {
    if (!this.mothership || drone.cargo <= 0) return;

    // Determine resource type from the drone's swarm action context
    // For now, assume miners carry the type of the last deposit they mined
    const resourceType = drone._lastMinedType || "iron-ore";
    const stored = this.mothership.storeResource(resourceType, drone.cargo);
    drone.cargo -= stored;
  }

  /**
   * Get count of alive drones.
   */
  getAliveCount() {
    return this.drones.filter((d) => isDroneAlive(d)).length;
  }

  dispose() {
    this.drones = [];
    this.swarms = [];
    this._deployQueue = [];
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function dist3(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
