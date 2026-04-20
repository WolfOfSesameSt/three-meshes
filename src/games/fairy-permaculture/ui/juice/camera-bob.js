/**
 * Fairy Permaculture — subtle camera bob on events.
 *
 * Adds a small positional offset to the camera for a few frames
 * without disturbing the target. Mid-juicy only, no shake.
 */

import * as THREE from "three";

export class CameraBob {
  constructor(camera, { maxOffset = 0.35, decay = 6 } = {}) {
    this.camera = camera;
    this.maxOffset = maxOffset;
    this.decay = decay;
    this._offset = new THREE.Vector3();
    this._impulse = new THREE.Vector3();
  }

  bump(strength = 1) {
    // Random direction, magnitude bounded by maxOffset
    const a = Math.random() * Math.PI * 2;
    const m = Math.min(strength, 1) * this.maxOffset;
    this._impulse.set(Math.cos(a) * m, 0, Math.sin(a) * m);
  }

  update(dt) {
    if (!this._impulse.lengthSq() && !this._offset.lengthSq()) return;
    // Spring the offset toward the impulse, then decay both.
    this._offset.addScaledVector(this._impulse, dt * 8);
    this._offset.multiplyScalar(Math.max(0, 1 - dt * this.decay));
    this._impulse.multiplyScalar(Math.max(0, 1 - dt * this.decay * 2));
    this.camera.position.add(this._offset);
  }

  /** Undo the current offset (call before render each frame). */
  unapply() {
    if (this._offset.lengthSq() === 0) return;
    this.camera.position.sub(this._offset);
  }
}
