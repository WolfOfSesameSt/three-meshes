/**
 * Attack System — manages all projectiles and hitscan attacks with real collision.
 *
 * Hitscan: accuracy roll based on target speed. Fast targets are harder to hit.
 * Projectiles: travel through space and check proximity to ALL valid targets
 *   each frame. Can miss if the target dodges. Can hit unintended targets.
 *
 * Usage:
 *   attackSystem.setTargets(friendlies, enemies, mothership)
 *   attackSystem.fire(source, target, attackDef, faction)
 *   attackSystem.update(dt)
 */

import * as THREE from "three";

const MAX_PROJECTILES = 200;
const MAX_BEAMS = 20;
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

// Map attack IDs to fire sound
const ATTACK_SOUNDS = {
  "pulse-laser": "weapon-pulse",
  "drone-laser": "weapon-drone-laser",
  "alien-plasma-bolt": "weapon-plasma-bolt",
  "alien-heavy-cannon": "weapon-heavy-cannon",
  "turret-beam": "weapon-turret-beam",
  "mining-beam": null,
  "repair-beam": null,
};

// Map attack IDs to impact sound
const IMPACT_SOUNDS = {
  "pulse-laser": "shield-hit",
  "alien-plasma-bolt": "shield-hit",
  "alien-heavy-cannon": "hull-hit",
  "turret-beam": "shield-hit",
  "drone-laser": null,
};

export class AttackSystem {
  constructor(scene, combatEffects, screenShake) {
    this.scene = scene;
    this.effects = combatEffects;
    this.screenShake = screenShake;
    this.audioManager = null;
    this.projectiles = [];
    this.beams = [];

    // Target pools — set each frame by main.js
    this._friendlyTargets = []; // player drones + mothership
    this._enemyTargets = [];    // alien ships/turrets

    // Instanced projectile rendering
    const boltGeo = new THREE.SphereGeometry(0.5, 4, 3);
    const boltMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._boltMesh = new THREE.InstancedMesh(boltGeo, boltMat, MAX_PROJECTILES);
    this._boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._boltMesh.count = 0;
    this._boltMesh.frustumCulled = false;
    this.scene.add(this._boltMesh);
  }

  /**
   * Set the target pools for collision detection.
   * Call once per frame before update().
   * @param {Array} friendlies — player drones (with .position, .stats)
   * @param {Array} enemies — alien ships (with .position, .stats)
   * @param {object} mothership — mothership entity
   */
  setTargets(friendlies, enemies, mothership) {
    this._friendlyTargets = friendlies ?? [];
    this._enemyTargets = enemies ?? [];
    this._mothership = mothership ?? null;
  }

  /**
   * Fire an attack from source at target.
   * @param {object} source — { position }
   * @param {object} target — { position, stats?, velocity? }
   * @param {object} attackDef — from attack-defs.js
   * @param {string} faction — "player" | "enemy" (determines what projectiles can hit)
   */
  fire(source, target, attackDef, faction = "player") {
    if (!source || !target || !attackDef) return;

    const sp = source.position;
    const tp = target.position;

    this._playFireSound(attackDef, sp);

    if (attackDef.speed === 0) {
      // ─── Hitscan: accuracy roll ───
      const accuracy = attackDef.accuracy ?? 0.9;
      const targetSpeed = _getSpeed(target);
      // Fast targets are harder to hit: effective accuracy drops with target speed
      // At speed 0: full accuracy. At speed 20+: accuracy * 0.5
      const speedPenalty = Math.min(targetSpeed / 40, 0.5);
      const effectiveAccuracy = accuracy * (1 - speedPenalty);

      // Always draw the beam visual (even on miss — shows where the shot went)
      this._addBeamVisual(sp, tp, attackDef);

      if (Math.random() < effectiveAccuracy) {
        // Hit
        this._applyDamage(target, attackDef, tp);
        this._playImpactSound(attackDef, tp);
        if (attackDef.impactEffect !== "none") {
          this.effects.addImpactFlash(tp, attackDef.damage);
        }
      } else {
        // Miss — beam goes slightly off target (visual only)
        // Could add a "miss" particle effect here later
      }

      if (attackDef.screenShake > 0 && this.screenShake) {
        this.screenShake.addTrauma(attackDef.screenShake);
      }
    } else {
      // ─── Projectile: aimed at target but uses real collision ───
      const dx = tp.x - sp.x;
      const dy = (tp.y ?? sp.y) - sp.y;
      const dz = tp.z - sp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1) return;

      // Lead the target: predict where it will be based on projectile travel time
      const travelTime = dist / attackDef.speed;
      const tv = target.velocity ?? { x: 0, y: 0, z: 0 };
      const leadX = tp.x + tv.x * travelTime * 0.6; // 60% lead prediction (not perfect)
      const leadY = (tp.y ?? sp.y) + (tv.y ?? 0) * travelTime * 0.6;
      const leadZ = tp.z + tv.z * travelTime * 0.6;

      const ldx = leadX - sp.x;
      const ldy = leadY - sp.y;
      const ldz = leadZ - sp.z;
      const ldist = Math.sqrt(ldx * ldx + ldy * ldy + ldz * ldz);

      // Add slight inaccuracy spread
      const spread = attackDef.spread ?? 0.03;
      const sx = ldx / ldist + (Math.random() - 0.5) * spread;
      const sy = ldy / ldist + (Math.random() - 0.5) * spread;
      const sz = ldz / ldist + (Math.random() - 0.5) * spread;
      const slen = Math.sqrt(sx * sx + sy * sy + sz * sz);

      this.projectiles.push({
        x: sp.x, y: sp.y, z: sp.z,
        vx: (sx / slen) * attackDef.speed,
        vy: (sy / slen) * attackDef.speed,
        vz: (sz / slen) * attackDef.speed,
        attackDef,
        faction,
        hitRadius: attackDef.hitRadius ?? 5, // proximity check radius
        maxDist: (attackDef.range ?? 300) * 1.2, // max travel before despawn
        distTraveled: 0,
        color: attackDef.projectileColor,
        size: attackDef.projectileSize,
        sourceId: source.id, // don't hit the shooter
      });

      while (this.projectiles.length > MAX_PROJECTILES) {
        this.projectiles.shift();
      }
    }
  }

  /**
   * Update all projectiles — move and check collisions.
   */
  update(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      // Move
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const step = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) * dt;
      p.distTraveled += step;

      // Check collision with valid targets
      const targets = p.faction === "player" ? this._enemyTargets :
                      this._buildFriendlyHitList();
      const hit = this._checkCollision(p, targets);

      if (hit) {
        // Use the projectile's current position as the impact point — that's
        // where the visual flash appears, and where the shield should ripple.
        const impactPos = { x: p.x, y: p.y, z: p.z };
        this._applyDamage(hit, p.attackDef, impactPos);
        this._playImpactSound(p.attackDef, hit.position);
        if (p.attackDef.impactEffect !== "none") {
          this.effects.addImpactFlash(hit.position, p.attackDef.damage);
          this.effects.addHitFlash(hit.position);
        }
        if (p.attackDef.screenShake > 0 && this.screenShake) {
          this.screenShake.addTrauma(p.attackDef.screenShake);
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      // Despawn if too far
      if (p.distTraveled > p.maxDist) {
        this.projectiles.splice(i, 1);
      }
    }

    // Update instanced bolt mesh
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.setScalar(p.size);
      _dummy.updateMatrix();
      this._boltMesh.setMatrixAt(i, _dummy.matrix);
      _color.setHex(p.color);
      this._boltMesh.setColorAt(i, _color);
    }
    this._boltMesh.count = this.projectiles.length;
    if (this.projectiles.length > 0) {
      this._boltMesh.instanceMatrix.needsUpdate = true;
      if (this._boltMesh.instanceColor) this._boltMesh.instanceColor.needsUpdate = true;
    }

    // Fade beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].timer -= dt;
      if (this.beams[i].timer <= 0) {
        this.scene.remove(this.beams[i].line);
        this.beams[i].line.geometry.dispose();
        this.beams[i].line.material.dispose();
        this.beams.splice(i, 1);
      }
    }
    // Cap beams
    while (this.beams.length > MAX_BEAMS) {
      const old = this.beams.shift();
      this.scene.remove(old.line);
      old.line.geometry.dispose();
      old.line.material.dispose();
    }
  }

  /**
   * Check if a projectile hit any target via proximity.
   * @returns {object|null} the hit target, or null
   */
  _checkCollision(projectile, targets) {
    const px = projectile.x;
    const py = projectile.y;
    const pz = projectile.z;
    const r = projectile.hitRadius;
    const rSq = r * r;

    for (const t of targets) {
      // Skip dead targets
      if (t.stats?.hull !== undefined && t.stats.hull <= 0) continue;
      if (t.systems?.hull !== undefined && t.systems.hull <= 0) continue;
      if (t.state === "destroyed" || t.state === "dead") continue;
      // Skip source (don't hit yourself)
      if (t.id !== undefined && t.id === projectile.sourceId) continue;

      const tp = t.position;
      const dx = px - tp.x;
      const dy = py - (tp.y ?? py);
      const dz = px - tp.z; // intentional: fast squared check
      // Proper distance
      const distSq = (px - tp.x) ** 2 + (py - (tp.y ?? py)) ** 2 + (pz - tp.z) ** 2;
      if (distSq <= rSq) {
        return t;
      }
    }
    return null;
  }

  /**
   * Build the list of friendly targets that enemy projectiles can hit.
   */
  _buildFriendlyHitList() {
    const list = [...this._friendlyTargets];
    if (this._mothership && this._mothership.alive !== false) {
      list.push(this._mothership);
    }
    return list;
  }

  _playFireSound(attackDef, pos) {
    if (!this.audioManager) return;
    const soundName = ATTACK_SOUNDS[attackDef.id];
    if (soundName) this.audioManager.playSFX(soundName, pos);
  }

  _playImpactSound(attackDef, pos) {
    if (!this.audioManager) return;
    const soundName = IMPACT_SOUNDS[attackDef.id];
    if (soundName) this.audioManager.playSFX(soundName, pos);
  }

  /**
   * Apply damage to a target. Shields absorb first.
   * @param {object} target
   * @param {object} attackDef
   * @param {{x,y,z}} [impactPos] - world-space hit point, forwarded to
   *   target.takeDamage so the shield ripple starts at the right spot.
   */
  _applyDamage(target, attackDef, impactPos) {
    if (attackDef.damage <= 0) return;

    if (target.takeDamage) {
      target.takeDamage(attackDef.damage, impactPos);
    } else if (target.stats) {
      let remaining = attackDef.damage;
      if (target.stats.shields > 0) {
        const absorbed = Math.min(target.stats.shields, remaining);
        target.stats.shields -= absorbed;
        remaining -= absorbed;
      }
      target.stats.hull = Math.max(0, target.stats.hull - remaining);
      if (target.stats.hull <= 0) {
        if (target.state !== undefined) target.state = "destroyed";
      }
    }
  }

  _addBeamVisual(from, to, attackDef) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: attackDef.projectileColor,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.beams.push({ line, timer: attackDef.beamDuration ?? 0.1 });
  }

  dispose() {
    for (const b of this.beams) {
      this.scene.remove(b.line);
      b.line.geometry.dispose();
      b.line.material.dispose();
    }
    this._boltMesh.geometry.dispose();
    this._boltMesh.material.dispose();
    this.scene.remove(this._boltMesh);
    this.projectiles = [];
    this.beams = [];
  }
}

function _getSpeed(entity) {
  const v = entity.velocity ?? { x: 0, y: 0, z: 0 };
  return Math.sqrt((v.x ?? 0) ** 2 + (v.y ?? 0) ** 2 + (v.z ?? 0) ** 2);
}
