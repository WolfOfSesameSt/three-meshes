/**
 * Drone shadow projections — dark circles on the terrain below each drone.
 *
 * Gives visual depth cues for where drones are relative to the ground.
 * Uses dark semi-transparent discs (like real shadows), NOT colored glow.
 * One draw call for all shadows (instanced).
 */

import * as THREE from "three";
import { getTerrainHeight } from "../realm/terrain.js";
import { MAX_DRONES, VOXEL_SCALE } from "../config.js";

// Height range over which shadow fades and scales
const MIN_HEIGHT = 2;       // below this, shadow is at full intensity
const MAX_HEIGHT = 120;     // above this, shadow is invisible
const BASE_RADIUS = 2.5;    // base shadow radius in meters
const MAX_RADIUS_MULT = 3;  // at MAX_HEIGHT the shadow is this many times larger (softer)
const TERRAIN_OFFSET = 0.3; // meters above terrain to avoid z-fighting
const SHADOW_COLOR = 0x000000; // black — real shadow color
const MAX_OPACITY = 0.35;   // shadow opacity when drone is close to ground

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Instanced drone shadow renderer.
 */
export class DroneLightRenderer {
  constructor(scene) {
    this.scene = scene;

    const geo = new THREE.CircleGeometry(BASE_RADIUS, 12);
    geo.rotateX(-Math.PI / 2); // face upward

    const mat = new THREE.MeshBasicMaterial({
      color: SHADOW_COLOR,
      transparent: true,
      opacity: MAX_OPACITY,
      depthWrite: false,
      blending: THREE.NormalBlending, // normal blending for dark shadows, NOT additive
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DRONES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // render before other transparent objects
    this.scene.add(this.mesh);
  }

  /**
   * Update shadow positions for all alive drones.
   * @param {Array} drones — all drone entities
   * @returns {number} — count of active shadows
   */
  update(drones) {
    let idx = 0;

    for (const drone of drones) {
      if (drone.state === "destroyed") continue;

      const terrainY = getTerrainHeight(drone.position.x, drone.position.z) * VOXEL_SCALE;
      const altitude = drone.position.y - terrainY;

      if (altitude < 0 || altitude > MAX_HEIGHT) continue;

      // Higher = larger, softer shadow (like real light)
      const heightT = Math.min(1, Math.max(0, (altitude - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT)));
      const scale = 1 + heightT * (MAX_RADIUS_MULT - 1);

      // Higher = fainter shadow
      const alpha = (1 - heightT) * MAX_OPACITY;

      _dummy.position.set(
        drone.position.x,
        terrainY + TERRAIN_OFFSET,
        drone.position.z
      );
      _dummy.scale.set(scale, 1, scale);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(idx, _dummy.matrix);

      // All shadows are dark — same neutral color, varying opacity via scale trick
      // Since instanced color multiplies with material color (black * anything = black),
      // we use a dark gray that gets darker when alpha should be stronger
      const brightness = 0.02 + heightT * 0.08; // very dark near ground, slightly lighter far
      _color.setRGB(brightness, brightness, brightness);
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
