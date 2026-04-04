/**
 * Debris system: instanced cubes with simple physics.
 * Two pools: active (physics-updated each frame) and static (baked, no updates).
 */

import * as THREE from "three";
import {
  DEBRIS_ACTIVE_MAX, DEBRIS_STATIC_MAX, DEBRIS_CUBE_SIZE,
  DEBRIS_GRAVITY, DEBRIS_DAMPING, DEBRIS_REST_THRESHOLD, DEBRIS_REST_FRAMES,
  VOXEL_COLORS, VOXEL_SIZE,
} from "../config.js";

const _tempMatrix = new THREE.Matrix4();
const _tempColor = new THREE.Color();

export class DebrisSystem {
  constructor(scene) {
    this.scene = scene;

    // Active pool
    const cubeGeo = new THREE.BoxGeometry(DEBRIS_CUBE_SIZE, DEBRIS_CUBE_SIZE, DEBRIS_CUBE_SIZE);
    const cubeMat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.activeMesh = new THREE.InstancedMesh(cubeGeo, cubeMat, DEBRIS_ACTIVE_MAX);
    this.activeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.activeMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(DEBRIS_ACTIVE_MAX * 3), 3
    );
    this.activeMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.activeMesh.count = 0;
    this.activeMesh.frustumCulled = false;
    scene.add(this.activeMesh);

    // Active particle data
    this.activeCount = 0;
    this.positions = new Float32Array(DEBRIS_ACTIVE_MAX * 3);
    this.velocities = new Float32Array(DEBRIS_ACTIVE_MAX * 3);
    this.restFrames = new Uint8Array(DEBRIS_ACTIVE_MAX);
    this.activeColors = new Float32Array(DEBRIS_ACTIVE_MAX * 3);

    // Static pool (baked debris, no physics)
    this.staticMesh = new THREE.InstancedMesh(cubeGeo, cubeMat, DEBRIS_STATIC_MAX);
    this.staticMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(DEBRIS_STATIC_MAX * 3), 3
    );
    this.staticMesh.count = 0;
    this.staticMesh.frustumCulled = false;
    scene.add(this.staticMesh);
    this.staticCount = 0;
  }

  /**
   * Spawn debris from destroyed voxels.
   * @param {Array<{wx:number, wy:number, wz:number, type:number}>} voxels
   */
  spawn(voxels) {
    for (const v of voxels) {
      if (this.activeCount >= DEBRIS_ACTIVE_MAX) break;

      const i = this.activeCount;
      const i3 = i * 3;

      // Position at voxel center with slight randomization
      this.positions[i3] = v.wx + (Math.random() - 0.5) * VOXEL_SIZE;
      this.positions[i3 + 1] = v.wy + Math.random() * VOXEL_SIZE;
      this.positions[i3 + 2] = v.wz + (Math.random() - 0.5) * VOXEL_SIZE;

      // Random outward velocity
      this.velocities[i3] = (Math.random() - 0.5) * 20;
      this.velocities[i3 + 1] = Math.random() * 15 + 5;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 20;

      this.restFrames[i] = 0;

      // Color from voxel type
      const color = VOXEL_COLORS[v.type] || [0.5, 0.5, 0.5];
      this.activeColors[i3] = color[0];
      this.activeColors[i3 + 1] = color[1];
      this.activeColors[i3 + 2] = color[2];

      this.activeCount++;
    }
  }

  update(delta) {
    let removeList = [];

    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;

      // Apply gravity
      this.velocities[i3 + 1] += DEBRIS_GRAVITY * delta;

      // Integrate position
      this.positions[i3] += this.velocities[i3] * delta;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * delta;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * delta;

      // Ground collision
      if (this.positions[i3 + 1] < DEBRIS_CUBE_SIZE * 0.5) {
        this.positions[i3 + 1] = DEBRIS_CUBE_SIZE * 0.5;
        this.velocities[i3 + 1] = -this.velocities[i3 + 1] * DEBRIS_DAMPING;
        this.velocities[i3] *= DEBRIS_DAMPING;
        this.velocities[i3 + 2] *= DEBRIS_DAMPING;
      }

      // Check if at rest
      const speed = Math.sqrt(
        this.velocities[i3] ** 2 +
        this.velocities[i3 + 1] ** 2 +
        this.velocities[i3 + 2] ** 2
      );
      if (speed < DEBRIS_REST_THRESHOLD) {
        this.restFrames[i]++;
        if (this.restFrames[i] >= DEBRIS_REST_FRAMES) {
          // Bake to static
          this._bakeToStatic(i);
          removeList.push(i);
        }
      } else {
        this.restFrames[i] = 0;
      }

      // Update instance matrix
      _tempMatrix.makeTranslation(
        this.positions[i3],
        this.positions[i3 + 1],
        this.positions[i3 + 2],
      );
      this.activeMesh.setMatrixAt(i, _tempMatrix);
      _tempColor.setRGB(this.activeColors[i3], this.activeColors[i3 + 1], this.activeColors[i3 + 2]);
      this.activeMesh.setColorAt(i, _tempColor);
    }

    // Remove baked particles (compact active arrays)
    if (removeList.length > 0) {
      this._compactActive(removeList);
    }

    this.activeMesh.count = this.activeCount;
    if (this.activeCount > 0) {
      this.activeMesh.instanceMatrix.needsUpdate = true;
      this.activeMesh.instanceColor.needsUpdate = true;
    }
  }

  _bakeToStatic(activeIdx) {
    if (this.staticCount >= DEBRIS_STATIC_MAX) {
      // Overwrite oldest static debris (ring buffer)
      this.staticCount = 0;
    }

    const i3 = activeIdx * 3;
    _tempMatrix.makeTranslation(
      this.positions[i3],
      this.positions[i3 + 1],
      this.positions[i3 + 2],
    );
    this.staticMesh.setMatrixAt(this.staticCount, _tempMatrix);
    _tempColor.setRGB(this.activeColors[i3], this.activeColors[i3 + 1], this.activeColors[i3 + 2]);
    this.staticMesh.setColorAt(this.staticCount, _tempColor);

    this.staticCount++;
    this.staticMesh.count = this.staticCount;
    this.staticMesh.instanceMatrix.needsUpdate = true;
    this.staticMesh.instanceColor.needsUpdate = true;
  }

  _compactActive(removeIndices) {
    // Sort descending so we can swap-remove from the end
    removeIndices.sort((a, b) => b - a);
    for (const idx of removeIndices) {
      const last = this.activeCount - 1;
      if (idx !== last) {
        // Swap with last active
        const i3 = idx * 3;
        const l3 = last * 3;
        this.positions[i3] = this.positions[l3];
        this.positions[i3 + 1] = this.positions[l3 + 1];
        this.positions[i3 + 2] = this.positions[l3 + 2];
        this.velocities[i3] = this.velocities[l3];
        this.velocities[i3 + 1] = this.velocities[l3 + 1];
        this.velocities[i3 + 2] = this.velocities[l3 + 2];
        this.activeColors[i3] = this.activeColors[l3];
        this.activeColors[i3 + 1] = this.activeColors[l3 + 1];
        this.activeColors[i3 + 2] = this.activeColors[l3 + 2];
        this.restFrames[idx] = this.restFrames[last];
      }
      this.activeCount--;
    }
  }
}
