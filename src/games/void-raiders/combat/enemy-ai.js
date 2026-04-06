/**
 * Enemy AI — simple behavior for alien ships and turrets.
 *
 * Ships: patrol near spawn → detect player → pursue → attack
 * Turrets: stationary → detect player → attack within range
 *
 * Attacks are now fired through the AttackSystem for visual projectiles.
 */

import { isEnemyAlive } from "./enemy.js";
import { ENEMY_ATTACK_MAP, getAttack } from "./attack-defs.js";

const DETECT_RANGE = 400;
const PURSUIT_SPEED_MULT = 1.2;

/**
 * Update a single enemy's AI.
 * @param {object} enemy
 * @param {object} targets — { mothership: {position}, drones: [{position, stats}] }
 * @param {number} dt
 * @param {number} elapsed
 * @param {object} attackSystem — the shared AttackSystem instance (optional for tests)
 */
export function updateEnemyAI(enemy, targets, dt, elapsed, attackSystem) {
  if (!isEnemyAlive(enemy)) return;

  enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);

  const attackDefId = ENEMY_ATTACK_MAP[enemy.type];
  const attackDef = attackDefId ? getAttack(attackDefId) : null;

  const nearest = findNearestTarget(enemy, targets);

  if (!nearest) {
    enemy.state = "patrol";
    if (enemy.category === "ship") {
      patrolMovement(enemy, dt, elapsed);
    }
    return;
  }

  const dist = dist3(enemy.position, nearest.position);
  const attackRange = attackDef ? attackDef.range : enemy.stats.range;

  if (dist > DETECT_RANGE) {
    enemy.state = "patrol";
    if (enemy.category === "ship") {
      patrolMovement(enemy, dt, elapsed);
    }
    return;
  }

  if (dist <= attackRange) {
    // In weapon range — attack
    enemy.state = "attacking";
    enemy.target = nearest;

    if (enemy.fireCooldown <= 0 && attackDef) {
      // Fire through the attack system for proper visuals
      if (attackSystem) {
        attackSystem.fire(enemy, nearest, attackDef, "enemy");
      } else {
        // Fallback for tests without attack system
        if (nearest.takeDamage) {
          nearest.takeDamage(attackDef.damage);
        } else if (nearest.stats) {
          nearest.stats.hull = Math.max(0, nearest.stats.hull - attackDef.damage);
          if (nearest.stats.hull <= 0 && nearest.state !== undefined) {
            nearest.state = "destroyed";
          }
        }
      }
      enemy.fireCooldown = 1.0 / attackDef.fireRate;
    }

    if (enemy.category === "ship") {
      orbitTarget(enemy, nearest.position, attackRange * 0.7, dt, elapsed);
    }
  } else {
    // Detected but out of weapon range — pursue
    enemy.state = "pursuing";
    if (enemy.category === "ship") {
      moveToward(enemy, nearest.position, dt, PURSUIT_SPEED_MULT);
    }
  }
}

function findNearestTarget(enemy, targets) {
  let best = null;
  let bestDist = Infinity;

  if (targets.mothership && targets.mothership.alive !== false) {
    const d = dist3(enemy.position, targets.mothership.position);
    if (d < bestDist) {
      bestDist = d;
      best = targets.mothership;
    }
  }

  if (targets.drones) {
    for (const drone of targets.drones) {
      if (drone.state === "destroyed" || (drone.stats && drone.stats.hull <= 0)) continue;
      const d = dist3(enemy.position, drone.position);
      if (d < bestDist) {
        bestDist = d;
        best = drone;
      }
    }
  }

  return best;
}

function patrolMovement(enemy, dt, elapsed) {
  const phase = enemy.id * 1.7 + elapsed * 0.2;
  const radius = 50 + (enemy.id % 5) * 20;
  const baseX = enemy._spawnX ?? enemy.position.x;
  const baseZ = enemy._spawnZ ?? enemy.position.z;

  if (enemy._spawnX === undefined) {
    enemy._spawnX = enemy.position.x;
    enemy._spawnZ = enemy.position.z;
  }

  const tx = baseX + Math.cos(phase) * radius;
  const tz = baseZ + Math.sin(phase) * radius;
  moveToward(enemy, { x: tx, y: enemy.position.y, z: tz }, dt, 0.5);
}

function orbitTarget(enemy, targetPos, radius, dt, elapsed) {
  const phase = enemy.id * 2.1 + elapsed * 0.5;
  const tx = targetPos.x + Math.cos(phase) * radius;
  const tz = targetPos.z + Math.sin(phase) * radius;
  const ty = targetPos.y + Math.sin(phase * 0.7) * 10;
  moveToward(enemy, { x: tx, y: ty, z: tz }, dt, 1.0);
}

function moveToward(enemy, target, dt, speedMult) {
  const dx = target.x - enemy.position.x;
  const dy = (target.y ?? enemy.position.y) - enemy.position.y;
  const dz = target.z - enemy.position.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < 2) return;

  const speed = enemy.stats.speed * speedMult * dt;
  const factor = Math.min(speed / dist, 1);

  enemy.velocity.x = dx * factor / dt;
  enemy.velocity.y = dy * factor / dt;
  enemy.velocity.z = dz * factor / dt;

  enemy.position.x += dx * factor;
  enemy.position.y += dy * factor;
  enemy.position.z += dz * factor;
}

function dist3(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
