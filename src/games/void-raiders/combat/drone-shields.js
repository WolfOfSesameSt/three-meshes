/**
 * Instanced drone shield bubbles — renders a mini shield sphere
 * around each drone that has shields > 0.
 *
 * Uses a simple fresnel sphere with additive blending.
 * One draw call for all drone shields (instanced).
 */

import * as THREE from "three";
import { MAX_DRONES } from "../config.js";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vViewDir = cameraPosition - worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    fresnel = pow(fresnel, 3.0);

    float alpha = fresnel * 0.35;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * Instanced drone shield renderer.
 */
export class DroneShieldRenderer {
  constructor(scene) {
    this.scene = scene;

    const geo = new THREE.SphereGeometry(3.0, 8, 6);
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(0x44aaff) },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DRONES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /**
   * Update shield bubble positions for all shielded drones.
   * @param {Array} drones — all drone entities
   */
  update(drones) {
    let idx = 0;

    for (const drone of drones) {
      if (drone.state === "destroyed") continue;
      if (!drone.stats.shields || drone.stats.shields <= 0) continue;
      if (!drone.stats.shieldsMax || drone.stats.shieldsMax <= 0) continue;

      // Scale bubble based on shield health
      const shieldPct = drone.stats.shields / drone.stats.shieldsMax;
      const scale = 0.7 + shieldPct * 0.3;

      _dummy.position.set(drone.position.x, drone.position.y, drone.position.z);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(idx, _dummy.matrix);

      // Color shifts from blue to red as shield drops
      if (shieldPct < 0.3) {
        _color.setHex(0xff4466);
      } else if (shieldPct < 0.6) {
        _color.setHex(0x88aaff);
      } else {
        _color.setHex(0x44aaff);
      }
      this.mesh.setColorAt(idx, _color);

      idx++;
    }

    this.mesh.count = idx;
    if (idx > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
  }
}
