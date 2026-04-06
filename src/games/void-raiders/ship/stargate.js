/**
 * Stargate — the extraction portal.
 *
 * When summoned, spawns ~1000m ahead of the mothership.
 * Takes 60 seconds to stabilize. Ship must reach it and wait.
 * Visual: spinning torus with energy vortex shader.
 */

import * as THREE from "three";

// ~60 seconds of travel at mothership speed (2.78 m/s ≈ 170m)
const SPAWN_DISTANCE = 170;
const STABILIZE_TIME = 60;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = cameraPosition - worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress; // 0 = just spawned, 1 = fully stable
  uniform vec3 uColor;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    fresnel = pow(fresnel, 2.0);

    // Swirling energy pattern
    float swirl = sin(vUv.x * 20.0 + uTime * 3.0) * cos(vUv.y * 15.0 - uTime * 2.0);
    swirl = smoothstep(0.0, 0.8, swirl * 0.5 + 0.5);

    // Intensity increases with stabilization progress
    float intensity = 0.2 + uProgress * 0.8;

    // Pulsing glow
    float pulse = 0.8 + 0.2 * sin(uTime * 4.0 * (1.0 + uProgress));

    float alpha = (fresnel * 0.5 + swirl * 0.3) * intensity * pulse;
    vec3 color = uColor * intensity;

    // Bright core when nearly stable
    if (uProgress > 0.8) {
      float flash = (uProgress - 0.8) * 5.0; // 0-1 in final 20%
      color += vec3(1.0) * flash * pulse * 0.3;
      alpha += flash * 0.2;
    }

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.85));
  }
`;

/**
 * Extraction state machine.
 *
 * States: idle → summoned → stabilizing → ready → warping → complete
 */
export class ExtractionSystem {
  constructor(scene) {
    this.scene = scene;
    this.state = "idle"; // idle | summoned | stabilizing | ready | warping | complete
    this.timer = 0;
    this.warpTimer = 0;
    this.gatePosition = new THREE.Vector3();

    // Gate visual
    this._uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color(0x22aaff) },
    };

    const gateMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this._uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Torus gate
    const gateGeo = new THREE.TorusGeometry(25, 4, 16, 32);
    this.gateMesh = new THREE.Mesh(gateGeo, gateMat);
    this.gateMesh.visible = false;
    this.scene.add(this.gateMesh);

    // Inner vortex disc
    const vortexGeo = new THREE.CircleGeometry(22, 24);
    const vortexMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uProgress;
        varying vec2 vUv;

        void main() {
          vec2 center = vUv - 0.5;
          float dist = length(center);
          float angle = atan(center.y, center.x);

          // Spiral pattern
          float spiral = sin(angle * 5.0 + dist * 20.0 - uTime * 6.0);
          spiral = smoothstep(0.0, 1.0, spiral * 0.5 + 0.5);

          float alpha = spiral * uProgress * (1.0 - dist * 1.5);
          alpha = clamp(alpha, 0.0, 0.6);

          vec3 color = mix(vec3(0.1, 0.4, 1.0), vec3(0.8, 0.9, 1.0), dist);
          gl_FragColor = vec4(color, alpha * uProgress);
        }
      `,
      uniforms: this._uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.vortexMesh = new THREE.Mesh(vortexGeo, vortexMat);
    this.vortexMesh.visible = false;
    this.scene.add(this.vortexMesh);
  }

  /**
   * Summon the extraction stargate.
   * @param {THREE.Vector3} mothershipPos
   * @param {number} mothershipRotY — ship facing direction
   */
  summon(mothershipPos, mothershipRotY) {
    if (this.state !== "idle") return;

    // Spawn gate ahead of the ship's current facing
    this.gatePosition.set(
      mothershipPos.x + Math.sin(mothershipRotY) * SPAWN_DISTANCE,
      mothershipPos.y + 20,
      mothershipPos.z + Math.cos(mothershipRotY) * SPAWN_DISTANCE
    );

    this.gateMesh.position.copy(this.gatePosition);
    this.gateMesh.rotation.y = mothershipRotY;
    this.gateMesh.visible = true;

    this.vortexMesh.position.copy(this.gatePosition);
    this.vortexMesh.rotation.y = mothershipRotY;
    this.vortexMesh.visible = true;

    this.state = "stabilizing";
    this.timer = 0;
  }

  /**
   * Update extraction state.
   * @param {number} dt
   * @param {number} elapsed
   * @param {THREE.Vector3} mothershipPos
   * @returns {string} current state
   */
  update(dt, elapsed, mothershipPos) {
    this._uniforms.uTime.value = elapsed;

    if (this.state === "stabilizing") {
      this.timer += dt;
      this._uniforms.uProgress.value = Math.min(this.timer / STABILIZE_TIME, 1.0);

      // Gate spins while stabilizing
      this.gateMesh.rotation.z += dt * (0.5 + this._uniforms.uProgress.value * 2.0);

      if (this.timer >= STABILIZE_TIME) {
        this.state = "ready";
        this._uniforms.uColor.value.setHex(0x44ffaa); // green = ready
      }
    }

    if (this.state === "ready") {
      this.gateMesh.rotation.z += dt * 3.0;
      // Check if mothership reached the gate
      const dist = mothershipPos.distanceTo(this.gatePosition);
      if (dist < 40) {
        this.state = "warping";
        this.warpTimer = 0;
      }
    }

    if (this.state === "warping") {
      this.warpTimer += dt;
      // 3-second warp animation
      if (this.warpTimer >= 3.0) {
        this.state = "complete";
      }
      this.gateMesh.rotation.z += dt * 8.0;
      // Scale up gate during warp
      const s = 1.0 + this.warpTimer * 0.5;
      this.gateMesh.scale.setScalar(s);
      this.vortexMesh.scale.setScalar(s);
    }

    return this.state;
  }

  /**
   * Get stabilization progress (0-1).
   */
  getProgress() {
    return Math.min(this.timer / STABILIZE_TIME, 1.0);
  }

  /**
   * Get remaining seconds until stabilized.
   */
  getTimeRemaining() {
    return Math.max(0, STABILIZE_TIME - this.timer);
  }

  /**
   * Get the gate's world position for mothership routing.
   */
  getGatePosition() {
    return { x: this.gatePosition.x, y: this.gatePosition.y, z: this.gatePosition.z };
  }

  /**
   * Is extraction active (any state past idle)?
   */
  isActive() {
    return this.state !== "idle" && this.state !== "complete";
  }

  reset() {
    this.state = "idle";
    this.timer = 0;
    this.warpTimer = 0;
    this.gateMesh.visible = false;
    this.vortexMesh.visible = false;
    this.gateMesh.scale.setScalar(1);
    this.vortexMesh.scale.setScalar(1);
    this._uniforms.uProgress.value = 0;
    this._uniforms.uColor.value.setHex(0x22aaff);
  }

  dispose() {
    this.gateMesh.geometry.dispose();
    this.gateMesh.material.dispose();
    this.vortexMesh.geometry.dispose();
    this.vortexMesh.material.dispose();
    this.scene.remove(this.gateMesh);
    this.scene.remove(this.vortexMesh);
  }
}
