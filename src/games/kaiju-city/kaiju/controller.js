/**
 * Kaiju controller: rigged glTF model with skeletal animation,
 * WASD+mouse movement, and destruction abilities.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  KAIJU_HEIGHT, KAIJU_SPEED, KAIJU_SPRINT_MULT,
  PUNCH_RADIUS, STOMP_RADIUS, STOMP_DEPTH, TAIL_ARC, TAIL_RANGE,
  BREATH_RANGE, BREATH_RADIUS, BREATH_ENERGY_COST, BREATH_ENERGY_MAX, BREATH_RECHARGE,
} from "../config.js";

export class KaijuController {
  constructor(scene) {
    this.scene = scene;
    this.position = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.modelLoaded = false;

    // Animation
    this.mixer = null;
    this.actions = {};       // name → AnimationAction
    this.currentAction = null;

    // Energy for atomic breath
    this.energy = BREATH_ENERGY_MAX;
    this.breathing = false;
    this.isMoving = false;

    // Input state
    this.keys = {};
    this.mouseButtons = {};
    this.attackQueue = [];

    // Cooldowns
    this.punchCooldown = 0;
    this.stompCooldown = 0;
    this.tailCooldown = 0;

    // Build placeholder, then load rigged model
    this._buildPlaceholder();
    this._loadModel();
    this._initInput();

    // Breath beam visual
    this.beamMesh = null;
    this._buildBeam();
  }

  _buildPlaceholder() {
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
      "/models/godzilla-1954-rigged-and-animated-mixamo-pack/scene.gltf",
      (gltf) => {
        const model = gltf.scene;

        // Scale to KAIJU_HEIGHT
        const box = new THREE.Box3().setFromObject(model);
        const modelHeight = box.max.y - box.min.y;
        const scale = KAIJU_HEIGHT / modelHeight;
        model.scale.set(scale, scale, scale);

        // Center and ground
        const scaledBox = new THREE.Box3().setFromObject(model);
        model.position.y = -scaledBox.min.y;
        model.position.x = -(scaledBox.min.x + scaledBox.max.x) / 2;
        model.position.z = -(scaledBox.min.z + scaledBox.max.z) / 2;

        // Set up animation mixer
        this.mixer = new THREE.AnimationMixer(model);

        if (gltf.animations.length > 0) {
          // The Mixamo pack may have one or multiple animations
          for (const clip of gltf.animations) {
            const action = this.mixer.clipAction(clip);
            this.actions[clip.name] = action;
            console.log(`Animation loaded: "${clip.name}" (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`);
          }

          // Play the first animation as idle/walk
          const firstClip = gltf.animations[0];
          const action = this.actions[firstClip.name];
          action.play();
          this.currentAction = action;
        }

        // Make materials respond to scene lighting
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            // Convert unlit materials to lit for better look
            if (child.material.isMeshBasicMaterial || child.material.extensions?.KHR_materials_unlit) {
              const oldMat = child.material;
              child.material = new THREE.MeshStandardMaterial({
                map: oldMat.map,
                roughness: 0.7,
                metalness: 0.1,
                side: THREE.DoubleSide,
              });
              oldMat.dispose();
            }
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

        console.log(`Godzilla rigged model loaded (${gltf.animations.length} animations, 235 bones, scale: ${scale.toFixed(3)})`);
      },
      (progress) => {
        if (progress.total) {
          const pct = ((progress.loaded / progress.total) * 100).toFixed(0);
          console.log(`Loading Godzilla model... ${pct}%`);
        }
      },
      (err) => {
        console.warn("Failed to load rigged Godzilla model, keeping placeholder:", err);
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
   * @returns {{ attacks: Array }}
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
      this.yaw = Math.atan2(-aimDir.x, -aimDir.z);
    }

    // Animation speed: faster when walking, slower when idle
    if (this.mixer) {
      const animSpeed = this.isMoving ? (sprint ? 1.5 : 1.0) : 0.3;
      this.mixer.timeScale = animSpeed;
      this.mixer.update(delta);
    }

    // Energy recharge
    this.breathing = this.keys["KeyF"] && this.energy > 0;
    if (this.breathing) {
      this.energy = Math.max(0, this.energy - BREATH_ENERGY_COST * delta);
    } else {
      this.energy = Math.min(BREATH_ENERGY_MAX, this.energy + BREATH_RECHARGE * delta);
    }

    // Update mesh transform
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

    if (this.attackQueue.includes("punch") && this.punchCooldown <= 0) {
      this.punchCooldown = 0.4;
      const punchPos = new THREE.Vector3(
        this.position.x - Math.sin(this.yaw) * KAIJU_HEIGHT * 0.4,
        this.position.y + KAIJU_HEIGHT * 0.5,
        this.position.z - Math.cos(this.yaw) * KAIJU_HEIGHT * 0.4,
      );
      attacks.push({ type: "punch", position: punchPos, radius: PUNCH_RADIUS });
    }

    if (this.attackQueue.includes("tail") && this.tailCooldown <= 0) {
      this.tailCooldown = 0.8;
      attacks.push({
        type: "tail",
        position: this.position.clone(),
        yaw: this.yaw + Math.PI,
        arc: TAIL_ARC,
        range: TAIL_RANGE,
        height: KAIJU_HEIGHT * 0.3,
      });
    }

    if (this.keys["Space"] && this.stompCooldown <= 0) {
      this.stompCooldown = 1.0;
      attacks.push({
        type: "stomp",
        position: this.position.clone(),
        radius: STOMP_RADIUS,
        depth: STOMP_DEPTH,
      });
    }

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

    if (this.keys["KeyQ"]) {
      camera.shake(3);
    }

    this.attackQueue = [];
    return { attacks };
  }
}
