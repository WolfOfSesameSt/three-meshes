/**
 * Third-person follow camera with orbit, damping, and screen shake.
 */

import * as THREE from "three";
import { CAM_DISTANCE, CAM_HEIGHT, CAM_DAMPING, CAM_SHAKE_DECAY } from "../config.js";

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3();   // kaiju position
    this.currentPos = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.yaw = 0;          // horizontal orbit angle (radians)
    this.pitch = 0.3;      // vertical angle (0 = level, positive = looking down)
    this.distance = CAM_DISTANCE;
    this.minPitch = 0.05;
    this.maxPitch = 1.2;
    this.minDistance = 40;
    this.maxDistance = 250;

    // Screen shake
    this.shakeIntensity = 0;
    this.shakeOffset = new THREE.Vector3();

    // Mouse state
    this._mouseDX = 0;
    this._mouseDY = 0;
    this._locked = false;

    this._initControls();
  }

  _initControls() {
    document.addEventListener("mousemove", (e) => {
      if (!this._locked) return;
      this._mouseDX += e.movementX;
      this._mouseDY += e.movementY;
    });

    document.addEventListener("wheel", (e) => {
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + e.deltaY * 0.3));
    });

    document.addEventListener("pointerlockchange", () => {
      this._locked = document.pointerLockElement !== null;
    });
  }

  requestLock(element) {
    element.requestPointerLock();
  }

  /** Add screen shake (intensity in meters) */
  shake(intensity) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  /**
   * @param {THREE.Vector3} targetPos - kaiju world position
   * @param {number} targetYaw - kaiju facing direction
   * @param {number} delta - frame delta time
   */
  update(targetPos, targetYaw, delta) {
    this.target.copy(targetPos);
    this.target.y += CAM_HEIGHT * 0.3; // look at kaiju upper body

    // Apply mouse input to orbit
    this.yaw -= this._mouseDX * 0.003;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + this._mouseDY * 0.003));
    this._mouseDX = 0;
    this._mouseDY = 0;

    // Calculate ideal camera position
    const idealPos = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance,
    );

    // Smooth follow
    const t = 1 - Math.exp(-CAM_DAMPING * delta);
    this.currentPos.lerp(idealPos, t);
    this.currentLookAt.lerp(this.target, t);

    // Screen shake
    if (this.shakeIntensity > 0.01) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity,
      );
      this.shakeIntensity *= Math.exp(-CAM_SHAKE_DECAY * delta);
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeIntensity = 0;
    }

    // Apply to camera
    this.camera.position.copy(this.currentPos).add(this.shakeOffset);
    this.camera.lookAt(this.currentLookAt);
  }

  /** Get the camera's forward look direction (horizontal, for kaiju aiming) */
  getAimDirection() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
}
