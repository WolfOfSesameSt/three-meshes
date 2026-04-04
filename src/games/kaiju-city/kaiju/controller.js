/**
 * Kaiju controller: glTF model, WASD+mouse movement, abilities.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  KAIJU_HEIGHT, KAIJU_SPEED, KAIJU_SPRINT_MULT, VOXEL_SIZE,
  PUNCH_RADIUS, STOMP_RADIUS, STOMP_DEPTH, TAIL_ARC, TAIL_RANGE,
  BREATH_RANGE, BREATH_RADIUS, BREATH_ENERGY_COST, BREATH_ENERGY_MAX, BREATH_RECHARGE,
} from "../config.js";
import { createAnimatedMaterial, updateAnimation } from "./anim-shader.js";

export class KaijuController {
  constructor(scene) {
    this.scene = scene;
    this.position = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // facing direction
    this.modelLoaded = false;

    // Energy for atomic breath
    this.energy = BREATH_ENERGY_MAX;
    this.breathing = false;

    // Input state
    this.keys = {};
    this.mouseButtons = {};
    this.attackQueue = []; // queued attacks to process

    // Cooldowns (seconds remaining)
    this.punchCooldown = 0;
    this.stompCooldown = 0;
    this.tailCooldown = 0;
    this.tailSwipeIntensity = 0; // decays over time, drives tail animation

    // Animation
    this.animUniforms = null;
    this.isMoving = false;
    this.elapsedTime = 0;

    // Build placeholder first, then load glTF model over it
    this._buildPlaceholder();
    this._loadModel();
    this._initInput();

    // Breath beam visual
    this.beamMesh = null;
    this._buildBeam();
  }

  _buildPlaceholder() {
    // Simple capsule shown while glTF loads
    const group = new THREE.Group();
    const bodyGeo = new THREE.CapsuleGeometry(KAIJU_HEIGHT * 0.15, KAIJU_HEIGHT * 0.5, 8, 16);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a4a2a });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = KAIJU_HEIGHT * 0.5;
    group.add(body);
    this.mesh = group;
    this.scene.add(group);
  }

  _loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/godzilla-2014/scene.gltf",
      (gltf) => {
        const model = gltf.scene;

        // Measure the model's bounding box to scale it to KAIJU_HEIGHT
        const box = new THREE.Box3().setFromObject(model);
        const modelHeight = box.max.y - box.min.y;
        const scale = KAIJU_HEIGHT / modelHeight;
        model.scale.set(scale, scale, scale);

        // Center the model horizontally and place feet on ground
        const centeredBox = new THREE.Box3().setFromObject(model);
        model.position.y = -centeredBox.min.y;
        model.position.x = -(centeredBox.min.x + centeredBox.max.x) / 2;
        model.position.z = -(centeredBox.min.z + centeredBox.max.z) / 2;

        // Apply procedural animation shader to the mesh
        model.traverse((child) => {
          if (child.isMesh && child.geometry) {
            const { material, uniforms } = createAnimatedMaterial(child);
            child.material = material;
            this.animUniforms = uniforms;
          }
        });

        // Replace placeholder
        this.scene.remove(this.mesh);
        this.mesh.traverse((child) => {
          if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); }
        });

        const wrapper = new THREE.Group();
        wrapper.add(model);
        this.mesh = wrapper;
        this.scene.add(wrapper);
        this.modelLoaded = true;
        console.log(`Godzilla model loaded (scale: ${scale.toFixed(2)}x, height: ${KAIJU_HEIGHT}m)`);
      },
      undefined,
      (err) => {
        console.warn("Failed to load Godzilla model, keeping placeholder:", err);
      }
    );
  }

  _buildBeam() {
    const geo = new THREE.CylinderGeometry(BREATH_RADIUS * 0.3, BREATH_RADIUS, BREATH_RANGE, 8, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -BREATH_RANGE / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beamMesh = new THREE.Mesh(geo, mat);
    this.beamMesh.visible = false;
    this.scene.add(this.beamMesh);
  }

  _initInput() {
    window.addEventListener("keydown", (e) => { this.keys[e.code] = true; });
    window.addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    window.addEventListener("mousedown", (e) => {
      this.mouseButtons[e.button] = true;
      if (e.button === 0) this.attackQueue.push("punch");
      if (e.button === 2) this.attackQueue.push("tail");
    });
    window.addEventListener("mouseup", (e) => { this.mouseButtons[e.button] = false; });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /**
   * @param {number} delta
   * @param {import('../camera/follow-camera.js').FollowCamera} camera
   * @returns {{ attacks: Array }} pending attacks for destruction system
   */
  update(delta, camera) {
    // Cooldowns
    this.punchCooldown = Math.max(0, this.punchCooldown - delta);
    this.stompCooldown = Math.max(0, this.stompCooldown - delta);
    this.tailCooldown = Math.max(0, this.tailCooldown - delta);

    // Movement
    const sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];
    const speed = KAIJU_SPEED * (sprint ? KAIJU_SPRINT_MULT : 1);
    const aimDir = camera.getAimDirection();
    const right = new THREE.Vector3(-aimDir.z, 0, aimDir.x);

    const move = new THREE.Vector3();
    if (this.keys["KeyW"]) move.add(aimDir);
    if (this.keys["KeyS"]) move.sub(aimDir);
    if (this.keys["KeyA"]) move.sub(right);
    if (this.keys["KeyD"]) move.add(right);

    this.isMoving = move.lengthSq() > 0;
    if (this.isMoving) {
      move.normalize().multiplyScalar(speed * delta);
      this.position.add(move);
      // Face movement direction
      this.yaw = Math.atan2(-aimDir.x, -aimDir.z);
    }

    // Energy recharge
    this.breathing = this.keys["KeyF"] && this.energy > 0;
    if (this.breathing) {
      this.energy = Math.max(0, this.energy - BREATH_ENERGY_COST * delta);
    } else {
      this.energy = Math.min(BREATH_ENERGY_MAX, this.energy + BREATH_RECHARGE * delta);
    }

    // Update mesh
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;

    // Update beam
    if (this.breathing) {
      this.beamMesh.visible = true;
      this.beamMesh.position.set(
        this.position.x,
        this.position.y + KAIJU_HEIGHT * 0.85,
        this.position.z
      );
      this.beamMesh.rotation.y = this.yaw;
    } else {
      this.beamMesh.visible = false;
    }

    // Process attacks
    const attacks = [];

    // Punch
    if (this.attackQueue.includes("punch") && this.punchCooldown <= 0) {
      this.punchCooldown = 0.4;
      const punchPos = new THREE.Vector3(
        this.position.x - Math.sin(this.yaw) * KAIJU_HEIGHT * 0.4,
        this.position.y + KAIJU_HEIGHT * 0.5,
        this.position.z - Math.cos(this.yaw) * KAIJU_HEIGHT * 0.4,
      );
      attacks.push({ type: "punch", position: punchPos, radius: PUNCH_RADIUS });
    }

    // Tail swipe
    if (this.attackQueue.includes("tail") && this.tailCooldown <= 0) {
      this.tailCooldown = 0.8;
      this.tailSwipeIntensity = 1.0;
      attacks.push({
        type: "tail",
        position: this.position.clone(),
        yaw: this.yaw + Math.PI, // behind
        arc: TAIL_ARC,
        range: TAIL_RANGE,
        height: KAIJU_HEIGHT * 0.3,
      });
    }

    // Stomp
    if (this.keys["Space"] && this.stompCooldown <= 0) {
      this.stompCooldown = 1.0;
      attacks.push({
        type: "stomp",
        position: this.position.clone(),
        radius: STOMP_RADIUS,
        depth: STOMP_DEPTH,
      });
    }

    // Atomic breath (continuous)
    if (this.breathing) {
      const origin = new THREE.Vector3(
        this.position.x,
        this.position.y + KAIJU_HEIGHT * 0.85,
        this.position.z
      );
      const direction = new THREE.Vector3(-Math.sin(this.yaw), -0.1, -Math.cos(this.yaw)).normalize();
      attacks.push({
        type: "breath",
        origin,
        direction,
        range: BREATH_RANGE,
        radius: BREATH_RADIUS,
      });
    }

    // Roar (visual only for now)
    if (this.keys["KeyQ"]) {
      camera.shake(3);
    }

    // Decay tail swipe intensity
    this.tailSwipeIntensity = Math.max(0, this.tailSwipeIntensity - delta * 2.5);

    // Update procedural animation
    this.elapsedTime += delta;
    if (this.animUniforms) {
      updateAnimation(
        this.animUniforms,
        this.elapsedTime,
        this.isMoving,
        this.breathing,
        this.tailSwipeIntensity,
      );
    }

    this.attackQueue = [];
    return { attacks };
  }
}
