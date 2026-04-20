/**
 * Fairy Permaculture — pooled particle system.
 *
 * One InstancedMesh per particle "style". Acquire returns an index
 * that the caller animates for `lifetime` seconds; when expired the
 * slot is released. Scales to ~1000 concurrent particles.
 */

import * as THREE from "three";

const DUMMY = new THREE.Object3D();

export class ParticlePool {
  /**
   * @param {object} opts
   * @param {number} [opts.capacity=256]
   * @param {THREE.BufferGeometry} opts.geometry
   * @param {THREE.Material} opts.material
   */
  constructor(scene, opts = {}) {
    this.capacity = opts.capacity ?? 256;
    this.mesh = new THREE.InstancedMesh(
      opts.geometry ?? new THREE.IcosahedronGeometry(0.08, 0),
      opts.material ?? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      this.capacity
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Per-slot state
    this.slots = new Array(this.capacity).fill(null);
    this.free = Array.from({ length: this.capacity }, (_, i) => this.capacity - 1 - i);
    // Hide all slots to start
    for (let i = 0; i < this.capacity; i++) {
      DUMMY.position.set(0, -1000, 0);
      DUMMY.scale.setScalar(0);
      DUMMY.updateMatrix();
      this.mesh.setMatrixAt(i, DUMMY.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Spawn `count` particles at `origin` with random velocities.
   */
  burst(origin, count = 16, opts = {}) {
    const {
      speed = 2.5,
      spread = Math.PI * 2,
      lifetime = 0.7,
      gravity = -6,
      color = null,
    } = opts;
    for (let i = 0; i < count; i++) {
      const slot = this.free.pop();
      if (slot === undefined) return; // pool exhausted; drop excess
      const angle = (i / count) * spread + (Math.random() - 0.5) * 0.4;
      const pitch = Math.random() * 0.8 + 0.2;
      const s = speed * (0.7 + Math.random() * 0.6);
      this.slots[slot] = {
        x: origin.x,
        y: origin.y,
        z: origin.z,
        vx: Math.cos(angle) * s * Math.cos(pitch),
        vy: Math.sin(pitch) * s * 1.2,
        vz: Math.sin(angle) * s * Math.cos(pitch),
        age: 0,
        lifetime,
        gravity,
        baseScale: 0.6 + Math.random() * 0.6,
      };
      if (color !== null) {
        this.mesh.setColorAt?.(slot, new THREE.Color(color));
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Update all active particles. Call once per render frame. */
  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s) continue;
      s.age += dt;
      if (s.age >= s.lifetime) {
        this.slots[i] = null;
        this.free.push(i);
        DUMMY.position.set(0, -1000, 0);
        DUMMY.scale.setScalar(0);
        DUMMY.updateMatrix();
        this.mesh.setMatrixAt(i, DUMMY.matrix);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy += s.gravity * dt;
      const t = s.age / s.lifetime;
      const scale = s.baseScale * (1 - t * 0.4);
      DUMMY.position.set(s.x, s.y, s.z);
      DUMMY.rotation.set(s.age * 4, s.age * 2, 0);
      DUMMY.scale.setScalar(scale);
      DUMMY.updateMatrix();
      this.mesh.setMatrixAt(i, DUMMY.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get activeCount() {
    return this.capacity - this.free.length;
  }
}
