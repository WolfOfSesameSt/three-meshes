/**
 * Drone light pools — instanced glow discs projected onto terrain below drones.
 *
 * Gives visual depth cues for where drones are relative to the ground,
 * without the expense of InstancedMesh shadow casting.
 * One draw call for all light pools (instanced).
 */

import * as THREE from "three";
import { getTerrainHeight } from "../realm/terrain.js";
import { MAX_DRONES, VOXEL_SCALE } from "../config.js";

// Drone type → glow color (darker/warmer version of fleet-renderer colors)
const GLOW_COLORS = {
  "worker-mining": 0x228844,
  "worker-looting": 0x886622,
  "worker-repair": 0x226688,
  offensive: 0x334488,
};

const DEFAULT_GLOW_COLOR = 0x334455;

// Height range over which glow fades and scales
const MIN_HEIGHT = 2;    // below this, disc is at full alpha
const MAX_HEIGHT = 120;  // above this, disc is invisible
const BASE_RADIUS = 3;   // base disc radius in meters
const MAX_RADIUS_MULT = 4; // at MAX_HEIGHT the disc is this many times larger
const TERRAIN_OFFSET = 0.5; // meters above terrain to avoid z-fighting

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Instanced drone light pool renderer.
 */
export class DroneLightRenderer {
  constructor(scene) {
    this.scene = scene;

    const geo = new THREE.CircleGeometry(BASE_RADIUS, 12);
    // CircleGeometry faces +Z by default; rotate to face +Y (upward)
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DRONES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /**
   * Update light pool positions for all alive drones.
   * @param {Array} drones — all drone entities
   * @returns {number} — count of active light discs (for testing)
   */
  update(drones) {
    let idx = 0;

    for (const drone of drones) {
      if (drone.state === "destroyed") continue;

      const terrainY = getTerrainHeight(drone.position.x, drone.position.z) * VOXEL_SCALE;
      const altitude = drone.position.y - terrainY;

      // Skip if drone is below terrain or too high
      if (altitude < 0 || altitude > MAX_HEIGHT) continue;

      // Scale: larger disc when higher
      const heightT = Math.min(1, Math.max(0, (altitude - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT)));
      const scale = 1 + heightT * (MAX_RADIUS_MULT - 1);

      // Alpha: inversely proportional to height (close = bright, far = faint)
      const alpha = 1 - heightT;

      _dummy.position.set(
        drone.position.x,
        terrainY + TERRAIN_OFFSET,
        drone.position.z
      );
      _dummy.scale.set(scale, 1, scale);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(idx, _dummy.matrix);

      // Color from drone type, dimmed by alpha
      const hex = GLOW_COLORS[drone.type] ?? DEFAULT_GLOW_COLOR;
      _color.setHex(hex);
      _color.multiplyScalar(alpha);
      this.mesh.setColorAt(idx, _color);

      idx++;
    }

    this.mesh.count = idx;
    if (idx > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    return idx;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
  }
}
