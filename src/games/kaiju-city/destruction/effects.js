/**
 * Visual effects: dust clouds on destruction.
 * Uses a simple THREE.Points system with fade-out.
 */

import * as THREE from "three";

const MAX_DUST = 500;

export class DustEffects {
  constructor(scene) {
    this.scene = scene;
    this.count = 0;

    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_DUST * 3);
    this.velocities = new Float32Array(MAX_DUST * 3);
    this.lifetimes = new Float32Array(MAX_DUST);
    this.ages = new Float32Array(MAX_DUST);

    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x998877,
      size: 8,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Spawn dust at a world position */
  spawn(x, y, z, count = 5) {
    for (let i = 0; i < count; i++) {
      if (this.count >= MAX_DUST) this.count = 0; // ring buffer
      const idx = this.count;
      const i3 = idx * 3;

      this.positions[i3] = x + (Math.random() - 0.5) * 10;
      this.positions[i3 + 1] = y + Math.random() * 5;
      this.positions[i3 + 2] = z + (Math.random() - 0.5) * 10;

      this.velocities[i3] = (Math.random() - 0.5) * 8;
      this.velocities[i3 + 1] = Math.random() * 6 + 2;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 8;

      this.lifetimes[idx] = 1.5 + Math.random() * 1.5;
      this.ages[idx] = 0;

      this.count++;
    }
  }

  update(delta) {
    for (let i = 0; i < this.count; i++) {
      this.ages[i] += delta;
      if (this.ages[i] >= this.lifetimes[i]) {
        // Dead — move off-screen
        this.positions[i * 3 + 1] = -1000;
        continue;
      }

      const i3 = i * 3;
      this.velocities[i3 + 1] -= 2 * delta; // slight gravity
      this.positions[i3] += this.velocities[i3] * delta;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * delta;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * delta;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
