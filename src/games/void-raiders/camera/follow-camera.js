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
    this._lastMouseY = 0;

    // Free-fly mode (toggle with F): WASD to move, right-mouse-drag to look,
    // Q/E for vertical, Shift to sprint. Useful for inspecting the underside
    // of the ship and verifying turret aim from any angle.
    this.freeMode = false;
    this.freeYaw = 0;     // radians around world +Y
    this.freePitch = 0;   // radians around camera local X
    this.freeMoveSpeed = 80; // m/s base speed
    this._keys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };

    this._bindEvents();
  }

  toggleFreeMode() {
    this.freeMode = !this.freeMode;
    if (this.freeMode) {
      // Snap free-camera direction to wherever we were looking right now
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.freeYaw = Math.atan2(dir.x, dir.z);
      this.freePitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      console.log("[FollowCamera] Free mode ON — WASD/QE to move, right-drag to look, Shift to sprint, F to exit");
    } else {
      console.log("[FollowCamera] Free mode OFF — back to ship follow");
    }
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
      const dy = e.clientY - this._lastMouseY;
      if (this.freeMode) {
        this.freeYaw -= dx * 0.005;
        this.freePitch -= dy * 0.005;
        const lim = Math.PI / 2 - 0.05;
        this.freePitch = Math.max(-lim, Math.min(lim, this.freePitch));
      } else {
        this.orbitAngle -= dx * 0.005;
      }
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
    });

    // WASD / QE / Shift / F bindings for free-fly mode
    window.addEventListener("keydown", (e) => {
      // Don't intercept keys when the user is typing in an input element
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "f" && !e.repeat) { this.toggleFreeMode(); e.preventDefault(); }
      if (this.freeMode && this._keys[k] !== undefined) {
        this._keys[k] = true;
        e.preventDefault();
      }
      if (this.freeMode && (k === "shift" || e.shiftKey)) this._keys.shift = true;
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (this._keys[k] !== undefined) this._keys[k] = false;
      if (k === "shift") this._keys.shift = false;
    });

    // Listen on window, not the canvas — if the user right-click-drags and
    // releases OUTSIDE the canvas, a domElement-only listener misses the
    // mouseup and _dragging stays stuck true (camera then follows the
    // mouse forever without any button held).
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this._dragging = false;
    });
    // Also cancel drag if the mouse leaves the window entirely (e.g. switching
    // tabs / dragging off-screen) — the next mouseup may never fire.
    window.addEventListener("blur", () => { this._dragging = false; });

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
    if (this.freeMode) {
      this._updateFree(dt);
      return;
    }
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
   * Free-fly camera update — WASD/QE move, right-click drag rotates, Shift sprints.
   * Active when toggleFreeMode() has been called (default key: F).
   */
  _updateFree(dt) {
    const sprint = this._keys.shift ? 3 : 1;
    const speed = this.freeMoveSpeed * sprint * dt;

    // Forward + right vectors from yaw + pitch
    const forward = new THREE.Vector3(
      Math.sin(this.freeYaw) * Math.cos(this.freePitch),
      Math.sin(this.freePitch),
      Math.cos(this.freeYaw) * Math.cos(this.freePitch),
    );
    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize();

    if (this._keys.w) this.camera.position.addScaledVector(forward, speed);
    if (this._keys.s) this.camera.position.addScaledVector(forward, -speed);
    if (this._keys.d) this.camera.position.addScaledVector(right, speed);
    if (this._keys.a) this.camera.position.addScaledVector(right, -speed);
    if (this._keys.e) this.camera.position.y += speed;
    if (this._keys.q) this.camera.position.y -= speed;

    const lookAt = this.camera.position.clone().add(forward);
    this.camera.lookAt(lookAt);
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
