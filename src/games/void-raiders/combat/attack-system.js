/**
 * Attack System — manages all projectiles and hitscan attacks in the game.
 *
 * Any unit fires attacks through this system. It handles:
 * - Hitscan (instant beam) attacks
 * - Projectile (bolt/missile) attacks with travel time
 * - Impact effects delegation to CombatEffects
 * - Damage application to targets
 *
 * Usage:
 *   attackSystem.fire(source, target, attackDef)
 *   attackSystem.update(dt)
 */

import * as THREE from "three";

const MAX_PROJECTILES = 200;
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

// Map attack IDs to their fire sound
const ATTACK_SOUNDS = {
  "pulse-laser": "weapon-pulse",
  "drone-laser": "weapon-drone-laser",
  "alien-plasma-bolt": "weapon-plasma-bolt",
  "alien-heavy-cannon": "weapon-heavy-cannon",
  "turret-beam": "weapon-turret-beam",
  "mining-beam": null, // mining sound handled separately (throttled)
  "repair-beam": null, // silent
};

// Map attack IDs to their impact sound
const IMPACT_SOUNDS = {
  "alien-plasma-bolt": "shield-hit",
  "alien-heavy-cannon": "hull-hit",
  "turret-beam": "shield-hit",
  "drone-laser": null, // small, skip
};

export class AttackSystem {
  constructor(scene, combatEffects, screenShake) {
    this.scene = scene;
    this.effects = combatEffects;
    this.screenShake = screenShake;
    this.audioManager = null; // set by main.js
    this.projectiles = [];
    this.beams = []; // active beam visuals

    // Instanced projectile rendering — small glowing bolts
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

    // Beam line material (reusable)
    this._beamMat = new THREE.LineBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Fire an attack from source at target.
   * @param {object} source — { position: {x,y,z} }
   * @param {object} target — { position: {x,y,z}, stats?, takeDamage? }
   * @param {object} attackDef — from attack-defs.js
   */
  fire(source, target, attackDef) {
    if (!source || !target || !attackDef) return;

    const sp = source.position;
    const tp = target.position;

    // Play fire sound at source position
    this._playFireSound(attackDef, sp);

    if (attackDef.speed === 0) {
      // ─── Hitscan: instant damage + beam visual ───
      this._applyDamage(target, attackDef);
      this._addBeamVisual(sp, tp, attackDef);

      // Play impact sound at target position
      this._playImpactSound(attackDef, tp);

      if (attackDef.impactEffect !== "none") {
        this.effects.addImpactFlash(tp, attackDef.damage);
      }
      if (attackDef.screenShake > 0 && this.screenShake) {
        this.screenShake.addTrauma(attackDef.screenShake);
      }
    } else {
      // ─── Projectile: travels through space ───
      const dx = tp.x - sp.x;
      const dy = (tp.y ?? sp.y) - sp.y;
      const dz = tp.z - sp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1) return;

      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      this.projectiles.push({
        x: sp.x, y: sp.y, z: sp.z,
        vx: nx * attackDef.speed,
        vy: ny * attackDef.speed,
        vz: nz * attackDef.speed,
        target,
        attackDef,
        distTraveled: 0,
        maxDist: dist + 20, // slight overshoot tolerance
        hitDist: dist,
        color: attackDef.projectileColor,
        size: attackDef.projectileSize,
      });

      // Cap projectile pool
      while (this.projectiles.length > MAX_PROJECTILES) {
        this.projectiles.shift();
      }
    }
  }

  /**
   * Update all projectiles and beam visuals.
   */
  update(dt) {
    // ─── Move projectiles ───
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const step = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.distTraveled += step;

      // Check if reached target distance
      if (p.distTraveled >= p.hitDist) {
        // Hit the target
        this._applyDamage(p.target, p.attackDef);

        // Impact sound at target
        this._playImpactSound(p.attackDef, p.target.position);

        if (p.attackDef.impactEffect !== "none") {
          this.effects.addImpactFlash(p.target.position, p.attackDef.damage);
          this.effects.addHitFlash(p.target.position);
        }
        if (p.attackDef.screenShake > 0 && this.screenShake) {
          this.screenShake.addTrauma(p.attackDef.screenShake);
        }

        this.projectiles.splice(i, 1);
        continue;
      }

      // Remove if overshot
      if (p.distTraveled > p.maxDist) {
        this.projectiles.splice(i, 1);
      }
    }

    // ─── Update instanced bolt mesh ───
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

    // ─── Fade beams ───
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.timer -= dt;
      if (b.timer <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        this.beams.splice(i, 1);
      }
    }
  }

  /**
   * Play the fire sound for an attack at a position.
   */
  _playFireSound(attackDef, pos) {
    if (!this.audioManager) return;
    const soundName = ATTACK_SOUNDS[attackDef.id];
    if (soundName) {
      this.audioManager.playSFX(soundName, pos);
    }
  }

  /**
   * Play the impact sound for an attack at a position.
   */
  _playImpactSound(attackDef, pos) {
    if (!this.audioManager) return;
    const soundName = IMPACT_SOUNDS[attackDef.id];
    if (soundName) {
      this.audioManager.playSFX(soundName, pos);
    }
  }

  /**
   * Apply damage to a target entity.
   * Shields absorb damage first for all entities.
   */
  _applyDamage(target, attackDef) {
    if (attackDef.damage <= 0) return;

    if (target.takeDamage) {
      // Mothership uses its own takeDamage method (handles shields internally)
      target.takeDamage(attackDef.damage);
    } else if (target.stats) {
      let remaining = attackDef.damage;
      // Shields absorb first
      if (target.stats.shields > 0) {
        const absorbed = Math.min(target.stats.shields, remaining);
        target.stats.shields -= absorbed;
        remaining -= absorbed;
      }
      // Remainder hits hull
      target.stats.hull = Math.max(0, target.stats.hull - remaining);
      if (target.stats.hull <= 0) {
        if (target.state !== undefined) target.state = "destroyed";
      }
    }
  }

  /**
   * Add a hitscan beam visual.
   */
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

    this.beams.push({
      line,
      timer: attackDef.beamDuration ?? 0.1,
    });
  }

  dispose() {
    for (const b of this.beams) {
      this.scene.remove(b.line);
      b.line.geometry.dispose();
    }
    this._boltMesh.geometry.dispose();
    this._boltMesh.material.dispose();
    this.scene.remove(this._boltMesh);
    this.projectiles = [];
    this.beams = [];
  }
}
