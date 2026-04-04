/**
 * Single voxel chunk: 32x32x32 grid stored as a flat Uint8Array.
 * Coordinates: x = east, y = up, z = south.
 */

import { CHUNK_SIZE, VOXEL } from "../config.js";

export class Chunk {
  /**
   * @param {number} cx - chunk X index in world grid
   * @param {number} cz - chunk Z index in world grid
   */
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    this.dirty = true;
    this.mesh = null;       // THREE.Mesh set by chunk manager after meshing
    this.meshData = null;   // cached vertex data from worker
    this.meshing = false;   // true while worker is processing
    this.buildingIds = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE); // tracks which building each voxel belongs to (0 = none)
  }

  /** Convert local (x, y, z) to flat array index */
  static index(x, y, z) {
    return x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE;
  }

  get(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return VOXEL.AIR;
    return this.voxels[Chunk.index(x, y, z)];
  }

  set(x, y, z, type) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    this.voxels[Chunk.index(x, y, z)] = type;
    this.dirty = true;
  }

  getBuildingId(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return 0;
    return this.buildingIds[Chunk.index(x, y, z)];
  }

  setBuildingId(x, y, z, id) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    this.buildingIds[Chunk.index(x, y, z)] = id;
  }

  /** Remove a voxel, mark dirty. Returns the old type (0 if was already air). */
  remove(x, y, z) {
    const idx = Chunk.index(x, y, z);
    const old = this.voxels[idx];
    if (old !== VOXEL.AIR) {
      this.voxels[idx] = VOXEL.AIR;
      this.dirty = true;
    }
    return old;
  }

  /** Remove all voxels within a sphere (local coords). Returns array of {x,y,z,type} removed. */
  removeSphere(cx, cy, cz, radius) {
    const removed = [];
    const r2 = radius * radius;
    const rCeil = Math.ceil(radius);
    for (let dx = -rCeil; dx <= rCeil; dx++) {
      for (let dy = -rCeil; dy <= rCeil; dy++) {
        for (let dz = -rCeil; dz <= rCeil; dz++) {
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const lx = cx + dx, ly = cy + dy, lz = cz + dz;
          if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
          const old = this.remove(lx, ly, lz);
          if (old !== VOXEL.AIR) removed.push({ x: lx, y: ly, z: lz, type: old });
        }
      }
    }
    return removed;
  }

  /** Check if chunk has any non-air voxels */
  isEmpty() {
    for (let i = 0; i < this.voxels.length; i++) {
      if (this.voxels[i] !== VOXEL.AIR) return false;
    }
    return true;
  }

  /** Dispose Three.js mesh resources */
  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }
}
