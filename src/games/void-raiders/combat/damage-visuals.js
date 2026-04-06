/**
 * Damage visuals — progressive visual degradation for all units.
 *
 * Manages smoke trails, spark bursts, flame flickers, and mothership
 * hull scars. Uses two InstancedMesh objects (smoke + sparks) to keep
 * draw calls minimal regardless of how many units are damaged.
 *
 * Health tiers:
 *   100-70%  — clean, no effects
 *   70-40%   — occasional sparks, light smoke wisps
 *   40-15%   — heavy smoke, frequent sparks, flame flickers
 *   <15%     — black smoke, constant sparks/flames, movement jitter
 */

import * as THREE from "three";

// ─── Particle Limits ────────────────────────────────────────────
const MAX_SMOKE = 200;
const MAX_SPARKS = 100;

// ─── Smoke Config ───────────────────────────────────────────────
const SMOKE_LIFETIME_MIN = 1.5;
const SMOKE_LIFETIME_MAX = 3.0;
const SMOKE_DRIFT_Y = 8;           // upward drift speed
const SMOKE_DRIFT_RANDOM = 3;      // random horizontal drift
const SMOKE_START_SCALE = 0.8;
const SMOKE_END_SCALE = 3.0;

// ─── Spark Config ───────────────────────────────────────────────
const SPARK_LIFETIME_MIN = 0.2;
const SPARK_LIFETIME_MAX = 0.5;
const SPARK_SPEED = 25;
const SPARK_GRAVITY = -20;

// ─── Flame Config ───────────────────────────────────────────────
const FLAME_LIFETIME_MIN = 0.3;
const FLAME_LIFETIME_MAX = 0.6;

// ─── Mothership Scars ───────────────────────────────────────────
const MAX_SCARS = 20;

const _dummy = new THREE.Object3D();

/**
 * Unified damage visualization system.
 */
export class DamageVisuals {
  constructor(scene) {
    this.scene = scene;

    // ── Smoke particle pool ──
    this.smokeParticles = [];
    const smokeGeo = new THREE.SphereGeometry(1, 5, 3);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this._smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_SMOKE);
    this._smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._smokeMesh.count = 0;
    this._smokeMesh.frustumCulled = false;
    this.scene.add(this._smokeMesh);

    // ── Spark / flame particle pool ──
    this.sparkParticles = [];
    const sparkGeo = new THREE.OctahedronGeometry(0.3, 0);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    this._sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._sparkMesh.count = 0;
    this._sparkMesh.frustumCulled = false;
    this.scene.add(this._sparkMesh);

    // ── Mothership scars ──
    this.scars = [];          // { mesh }
    this._mothershipRef = null;

    // ── Per-unit spark cooldowns (keyed by some id or reference) ──
    this._sparkTimers = new Map();
  }

  /**
   * Register a hit event — spawns a burst of sparks and optionally
   * adds a persistent scar to the mothership.
   *
   * @param {{ x: number, y: number, z: number }} position — world hit point
   * @param {number} intensity — 0 to 1, scales the burst
   * @param {THREE.Group} [mothershipMesh] — if provided, adds a hull scar
   */
  registerHit(position, intensity, mothershipMesh) {
    // Spark burst
    const count = Math.floor(3 + intensity * 5);
    for (let i = 0; i < count; i++) {
      this._emitSpark(position.x, position.y, position.z, SPARK_SPEED * (0.5 + intensity));
    }

    // Mothership scar
    if (mothershipMesh) {
      this._addHullScar(mothershipMesh, position);
    }
  }

  /**
   * Update every frame — emits ongoing smoke/sparks for damaged units,
   * advances all particles.
   *
   * @param {number} dt — delta time in seconds
   * @param {Array<{
   *   position: { x: number, y: number, z: number },
   *   healthPct: number,
   *   velocity: { x: number, y: number, z: number },
   *   isMothership: boolean,
   *   id: number|string
   * }>} damagedUnits — all units below 70% health
   */
  update(dt, damagedUnits) {
    // ── Emit ongoing effects for each damaged unit ──
    for (const unit of damagedUnits) {
      const hp = unit.healthPct;
      const pos = unit.position;

      // Determine damage tier
      if (hp >= 0.7) continue; // shouldn't be in list, but guard

      // Smoke emission rate (particles per second)
      let smokeRate, sparkRate;
      if (hp < 0.15) {
        // Near-death: heavy smoke + constant sparks
        smokeRate = 12;
        sparkRate = 8;
      } else if (hp < 0.4) {
        // Critical
        smokeRate = 6;
        sparkRate = 3;
      } else {
        // Battle-worn (70-40%)
        smokeRate = 1.5;
        sparkRate = 0.5;
      }

      // Emit smoke
      const smokeCount = smokeRate * dt;
      const wholeSmokeCount = Math.floor(smokeCount);
      const fractionalSmoke = smokeCount - wholeSmokeCount;
      for (let i = 0; i < wholeSmokeCount; i++) {
        this._emitSmoke(pos.x, pos.y, pos.z, hp);
      }
      if (Math.random() < fractionalSmoke) {
        this._emitSmoke(pos.x, pos.y, pos.z, hp);
      }

      // Emit sparks (stochastic per-frame)
      const sparkCount = sparkRate * dt;
      const wholeSparkCount = Math.floor(sparkCount);
      const fractionalSpark = sparkCount - wholeSparkCount;
      for (let i = 0; i < wholeSparkCount; i++) {
        this._emitSpark(pos.x, pos.y, pos.z, SPARK_SPEED * 0.5);
      }
      if (Math.random() < fractionalSpark) {
        this._emitSpark(pos.x, pos.y, pos.z, SPARK_SPEED * 0.5);
      }

      // Flames for critical / near-death
      if (hp < 0.4 && Math.random() < dt * (hp < 0.15 ? 6 : 2)) {
        this._emitFlame(pos.x, pos.y, pos.z);
      }
    }

    // ── Update smoke particles ──
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.smokeParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Drift slightly
      p.vx += (Math.random() - 0.5) * SMOKE_DRIFT_RANDOM * dt;
      p.vz += (Math.random() - 0.5) * SMOKE_DRIFT_RANDOM * dt;
    }

    // ── Update spark particles ──
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.sparkParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy += SPARK_GRAVITY * dt;
      // Drag
      p.vx *= 0.97;
      p.vz *= 0.97;
    }

    // ── Write smoke instances ──
    for (let i = 0; i < this.smokeParticles.length; i++) {
      const p = this.smokeParticles[i];
      const age = 1 - p.timer / p.maxLife;
      const scale = SMOKE_START_SCALE + (SMOKE_END_SCALE - SMOKE_START_SCALE) * age;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.setScalar(scale);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      this._smokeMesh.setMatrixAt(i, _dummy.matrix);
    }
    this._smokeMesh.count = this.smokeParticles.length;
    if (this.smokeParticles.length > 0) {
      this._smokeMesh.instanceMatrix.needsUpdate = true;
    }
    // Adjust smoke opacity based on count presence
    this._smokeMesh.material.opacity = this.smokeParticles.length > 0 ? 0.4 : 0;

    // ── Write spark instances ──
    for (let i = 0; i < this.sparkParticles.length; i++) {
      const p = this.sparkParticles[i];
      const fade = p.timer / p.maxLife;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.setScalar(p.scale * fade);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      this._sparkMesh.setMatrixAt(i, _dummy.matrix);
    }
    this._sparkMesh.count = this.sparkParticles.length;
    if (this.sparkParticles.length > 0) {
      this._sparkMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ─── Private: Emit Smoke ─────────────────────────────────────

  _emitSmoke(x, y, z, healthPct) {
    if (this.smokeParticles.length >= MAX_SMOKE) return;

    const maxLife = SMOKE_LIFETIME_MIN + Math.random() * (SMOKE_LIFETIME_MAX - SMOKE_LIFETIME_MIN);
    // Darker smoke at lower health
    const darkness = healthPct < 0.15 ? 0.9 : healthPct < 0.4 ? 0.6 : 0.3;

    this.smokeParticles.push({
      x: x + (Math.random() - 0.5) * 3,
      y: y + (Math.random() - 0.5) * 2,
      z: z + (Math.random() - 0.5) * 3,
      vx: (Math.random() - 0.5) * 2,
      vy: SMOKE_DRIFT_Y * (0.6 + Math.random() * 0.4),
      vz: (Math.random() - 0.5) * 2,
      timer: maxLife,
      maxLife,
      darkness,
    });
  }

  // ─── Private: Emit Spark ─────────────────────────────────────

  _emitSpark(x, y, z, speed) {
    if (this.sparkParticles.length >= MAX_SPARKS) return;

    const maxLife = SPARK_LIFETIME_MIN + Math.random() * (SPARK_LIFETIME_MAX - SPARK_LIFETIME_MIN);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.5;
    const s = speed * (0.3 + Math.random() * 0.7);

    this.sparkParticles.push({
      x: x + (Math.random() - 0.5) * 2,
      y: y + (Math.random() - 0.5) * 2,
      z: z + (Math.random() - 0.5) * 2,
      vx: Math.cos(theta) * Math.sin(phi) * s,
      vy: Math.cos(phi) * s * 0.5 + 5,
      vz: Math.sin(theta) * Math.sin(phi) * s,
      timer: maxLife,
      maxLife,
      scale: 0.3 + Math.random() * 0.5,
      isFlame: false,
    });
  }

  // ─── Private: Emit Flame ─────────────────────────────────────

  _emitFlame(x, y, z) {
    if (this.sparkParticles.length >= MAX_SPARKS) return;

    const maxLife = FLAME_LIFETIME_MIN + Math.random() * (FLAME_LIFETIME_MAX - FLAME_LIFETIME_MIN);

    this.sparkParticles.push({
      x: x + (Math.random() - 0.5) * 3,
      y: y + Math.random() * 2,
      z: z + (Math.random() - 0.5) * 3,
      vx: (Math.random() - 0.5) * 3,
      vy: 4 + Math.random() * 4,
      vz: (Math.random() - 0.5) * 3,
      timer: maxLife,
      maxLife,
      scale: 0.6 + Math.random() * 1.0,
      isFlame: true,
    });
  }

  // ─── Private: Hull Scars (mothership only) ────────────────────

  _addHullScar(mothershipMesh, worldPos) {
    // Convert world hit position to local mothership space
    const localPos = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    mothershipMesh.worldToLocal(localPos);

    const radius = 0.5 + Math.random() * 1.5;
    const scarGeo = new THREE.CircleGeometry(radius, 6);
    const scarMat = new THREE.MeshBasicMaterial({
      color: 0x221100,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const scar = new THREE.Mesh(scarGeo, scarMat);
    scar.position.copy(localPos);

    // Orient outward from center
    const outward = localPos.clone().normalize().multiplyScalar(2).add(localPos);
    scar.lookAt(outward);

    mothershipMesh.add(scar);
    this.scars.push({ mesh: scar, parent: mothershipMesh });

    // Cap scars — remove oldest if over limit
    while (this.scars.length > MAX_SCARS) {
      const old = this.scars.shift();
      old.parent.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }

  /**
   * Dispose all GPU resources.
   */
  dispose() {
    this._smokeMesh.geometry.dispose();
    this._smokeMesh.material.dispose();
    this.scene.remove(this._smokeMesh);

    this._sparkMesh.geometry.dispose();
    this._sparkMesh.material.dispose();
    this.scene.remove(this._sparkMesh);

    // Clean up scars
    for (const scar of this.scars) {
      scar.parent.remove(scar.mesh);
      scar.mesh.geometry.dispose();
      scar.mesh.material.dispose();
    }
    this.scars = [];
    this.smokeParticles = [];
    this.sparkParticles = [];
    this._sparkTimers.clear();
  }
}
