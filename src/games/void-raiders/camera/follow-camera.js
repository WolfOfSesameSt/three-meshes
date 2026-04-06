/**
 * 3rd-person follow camera for the mothership.
 *
 * Sits behind and above the ship, looking ahead.
 * Adjustable via mouse wheel (zoom) and right-click drag (orbit offset).
 */

import * as THREE from "three";
import {
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  CAMERA_LOOK_AHEAD,
  CAMERA_LERP_SPEED,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_HEIGHT,
  CAMERA_MAX_HEIGHT,
} from "../config.js";

export class FollowCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement || document.body;

    this.distance = CAMERA_DISTANCE;
    this.height = CAMERA_HEIGHT;
    this.orbitAngle = 0; // horizontal orbit offset in radians

    // Smooth positions
    this._currentPos = new THREE.Vector3();
    this._currentLook = new THREE.Vector3();
    this._targetPos = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();

    // Input state
    this._dragging = false;
    this._lastMouseX = 0;

    this._bindEvents();
  }

  _bindEvents() {
    this.domElement.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.distance = Math.max(
        CAMERA_MIN_DISTANCE,
        Math.min(CAMERA_MAX_DISTANCE, this.distance + e.deltaY * 0.2)
      );
      // Scale height proportionally
      this.height = CAMERA_MIN_HEIGHT +
        ((this.distance - CAMERA_MIN_DISTANCE) / (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE)) *
        (CAMERA_MAX_HEIGHT - CAMERA_MIN_HEIGHT);
    }, { passive: false });

    this.domElement.addEventListener("mousedown", (e) => {
      if (e.button === 2) { // right click
        this._dragging = true;
        this._lastMouseX = e.clientX;
      }
    });

    this.domElement.addEventListener("mousemove", (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastMouseX;
      this.orbitAngle -= dx * 0.005;
      this._lastMouseX = e.clientX;
    });

    this.domElement.addEventListener("mouseup", (e) => {
      if (e.button === 2) this._dragging = false;
    });

    // Prevent context menu on right click
    this.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /**
   * Update camera position to follow a target.
   * @param {THREE.Vector3} targetPos — mothership position
   * @param {number} targetRotY — mothership Y rotation
   * @param {number} dt — delta time
   */
  update(targetPos, targetRotY, dt) {
    // Calculate desired camera position behind the ship
    const behindAngle = targetRotY + Math.PI + this.orbitAngle;
    this._targetPos.set(
      targetPos.x + Math.sin(behindAngle) * this.distance,
      targetPos.y + this.height,
      targetPos.z + Math.cos(behindAngle) * this.distance
    );

    // Look target is ahead of the ship
    this._targetLook.set(
      targetPos.x + Math.sin(targetRotY) * CAMERA_LOOK_AHEAD,
      targetPos.y + 5,
      targetPos.z + Math.cos(targetRotY) * CAMERA_LOOK_AHEAD
    );

    // Smooth interpolation
    const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
    this._currentPos.lerp(this._targetPos, lerpFactor);
    this._currentLook.lerp(this._targetLook, lerpFactor);

    this.camera.position.copy(this._currentPos);

    // Apply screen shake offset if present
    if (this._shakeOffset) {
      this.camera.position.x += this._shakeOffset.x;
      this.camera.position.y += this._shakeOffset.y;
      this.camera.position.z += this._shakeOffset.z;
    }

    this.camera.lookAt(this._currentLook);
  }

  /**
   * Set the screen shake offset for this frame.
   * @param {{ x: number, y: number, z: number }} offset
   */
  setShakeOffset(offset) {
    this._shakeOffset = offset;
  }

  /**
   * Snap camera to position immediately (no lerp).
   */
  snap(targetPos, targetRotY) {
    const behindAngle = targetRotY + Math.PI + this.orbitAngle;
    this._currentPos.set(
      targetPos.x + Math.sin(behindAngle) * this.distance,
      targetPos.y + this.height,
      targetPos.z + Math.cos(behindAngle) * this.distance
    );
    this._currentLook.set(
      targetPos.x + Math.sin(targetRotY) * CAMERA_LOOK_AHEAD,
      targetPos.y + 5,
      targetPos.z + Math.cos(targetRotY) * CAMERA_LOOK_AHEAD
    );
    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLook);
  }
}
