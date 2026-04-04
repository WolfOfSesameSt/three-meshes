/**
 * ChunkManager: owns all chunks, handles loading/unloading by distance,
 * dispatches meshing to Web Workers, uploads meshes to GPU.
 */

import * as THREE from "three";
import { Chunk } from "./chunk.js";
import {
  CHUNK_SIZE, VOXEL_SIZE, CHUNK_WORLD_SIZE, VOXEL,
  LOAD_RADIUS_NEAR, UNLOAD_RADIUS, WORKER_COUNT, MESH_BUDGET_PER_FRAME,
} from "../config.js";

export class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map(); // key: "cx,cz" → Chunk
    this.workerPool = [];
    this.workerQueue = [];    // pending mesh jobs
    this.workerBusy = [];     // true/false per worker
    this.meshUploadQueue = []; // chunks ready to upload this frame
    this.nextJobId = 0;
    this.jobCallbacks = new Map(); // jobId → callback

    // Shared material for all chunk meshes (vertex-colored)
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });

    this._initWorkers();
  }

  _initWorkers() {
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL("../utils/worker-mesher.js", import.meta.url)
      );
      worker.onmessage = (e) => this._onWorkerResult(i, e.data);
      this.workerPool.push(worker);
      this.workerBusy.push(false);
    }
  }

  _onWorkerResult(workerIdx, data) {
    this.workerBusy[workerIdx] = false;
    const { cx, cz, meshData } = data;
    const key = `${cx},${cz}`;
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.meshData = meshData;
      chunk.meshing = false;
      this.meshUploadQueue.push(chunk);
    }
    // Process next in queue
    this._dispatchNext();
  }

  _dispatchNext() {
    while (this.workerQueue.length > 0) {
      const freeIdx = this.workerBusy.indexOf(false);
      if (freeIdx === -1) break;

      const job = this.workerQueue.shift();
      this.workerBusy[freeIdx] = true;
      const buffer = job.voxels.buffer.slice(0); // copy for transfer
      this.workerPool[freeIdx].postMessage(
        { id: job.id, cx: job.cx, cz: job.cz, voxelBuffer: buffer },
        [buffer]
      );
    }
  }

  /** Request a chunk to be re-meshed */
  requestMesh(chunk) {
    if (chunk.meshing) return;
    chunk.meshing = true;
    chunk.dirty = false;
    this.workerQueue.push({
      id: this.nextJobId++,
      cx: chunk.cx,
      cz: chunk.cz,
      voxels: chunk.voxels,
    });
    this._dispatchNext();
  }

  /** Convert world position (meters) to chunk index */
  worldToChunk(wx, wz) {
    return {
      cx: Math.floor(wx / CHUNK_WORLD_SIZE),
      cz: Math.floor(wz / CHUNK_WORLD_SIZE),
    };
  }

  /** Convert world position to chunk-local voxel coordinates */
  worldToLocal(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_WORLD_SIZE);
    const cz = Math.floor(wz / CHUNK_WORLD_SIZE);
    const lx = Math.floor((wx - cx * CHUNK_WORLD_SIZE) / VOXEL_SIZE);
    const ly = Math.floor(wy / VOXEL_SIZE);
    const lz = Math.floor((wz - cz * CHUNK_WORLD_SIZE) / VOXEL_SIZE);
    return { cx, cz, lx, ly, lz };
  }

  /** Get or create a chunk at chunk index (cx, cz) */
  getOrCreate(cx, cz) {
    const key = `${cx},${cz}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Get chunk at index (may be undefined) */
  get(cx, cz) {
    return this.chunks.get(`${cx},${cz}`);
  }

  /** Set a voxel at world coordinates */
  setVoxelWorld(wx, wy, wz, type) {
    const { cx, cz, lx, ly, lz } = this.worldToLocal(wx, wy, wz);
    const chunk = this.getOrCreate(cx, cz);
    chunk.set(lx, ly, lz, type);
  }

  /** Get a voxel at world coordinates */
  getVoxelWorld(wx, wy, wz) {
    const { cx, cz, lx, ly, lz } = this.worldToLocal(wx, wy, wz);
    const chunk = this.get(cx, cz);
    if (!chunk) return VOXEL.AIR;
    return chunk.get(lx, ly, lz);
  }

  /**
   * Remove voxels in a world-space sphere. Returns array of { wx, wy, wz, type }.
   */
  removeSphereWorld(centerX, centerY, centerZ, radius) {
    const removed = [];
    const radiusVoxels = radius / VOXEL_SIZE;
    const rCeil = Math.ceil(radiusVoxels);

    // Determine which chunks are affected
    const minCx = Math.floor((centerX - radius) / CHUNK_WORLD_SIZE);
    const maxCx = Math.floor((centerX + radius) / CHUNK_WORLD_SIZE);
    const minCz = Math.floor((centerZ - radius) / CHUNK_WORLD_SIZE);
    const maxCz = Math.floor((centerZ + radius) / CHUNK_WORLD_SIZE);

    for (let ccx = minCx; ccx <= maxCx; ccx++) {
      for (let ccz = minCz; ccz <= maxCz; ccz++) {
        const chunk = this.get(ccx, ccz);
        if (!chunk) continue;

        const chunkWorldX = ccx * CHUNK_WORLD_SIZE;
        const chunkWorldZ = ccz * CHUNK_WORLD_SIZE;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const wy = ly * VOXEL_SIZE;
          const dy = wy - centerY;
          if (Math.abs(dy) > radius) continue;
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const wx = chunkWorldX + lx * VOXEL_SIZE;
            const dx = wx - centerX;
            if (Math.abs(dx) > radius) continue;
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              const wz = chunkWorldZ + lz * VOXEL_SIZE;
              const dz = wz - centerZ;
              const dist2 = dx * dx + dy * dy + dz * dz;
              if (dist2 > radius * radius) continue;

              const old = chunk.remove(lx, ly, lz);
              if (old !== VOXEL.AIR) {
                removed.push({ wx, wy, wz, type: old });
              }
            }
          }
        }
      }
    }
    return removed;
  }

  /**
   * Update: load/unload chunks based on player position, upload meshes.
   * @param {number} playerX - world X
   * @param {number} playerZ - world Z
   */
  update(playerX, playerZ) {
    const { cx: pcx, cz: pcz } = this.worldToChunk(playerX, playerZ);

    // Unload distant chunks
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > UNLOAD_RADIUS * UNLOAD_RADIUS) {
        if (chunk.mesh) {
          this.scene.remove(chunk.mesh);
          chunk.dispose();
        }
        this.chunks.delete(key);
      }
    }

    // Request meshing for dirty chunks in range
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz <= LOAD_RADIUS_NEAR * LOAD_RADIUS_NEAR) {
        if (chunk.dirty && !chunk.meshing) {
          this.requestMesh(chunk);
        }
      }
    }

    // Upload mesh results (budget-limited per frame)
    let uploaded = 0;
    while (this.meshUploadQueue.length > 0 && uploaded < MESH_BUDGET_PER_FRAME) {
      const chunk = this.meshUploadQueue.shift();
      this._uploadMesh(chunk);
      uploaded++;
    }
  }

  _uploadMesh(chunk) {
    // Remove old mesh
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }

    if (!chunk.meshData) return;

    const { positions, normals, colors, indices } = chunk.meshData;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const mesh = new THREE.Mesh(geometry, this.material);
    // Position the chunk mesh in world space
    mesh.position.set(
      chunk.cx * CHUNK_WORLD_SIZE,
      0,
      chunk.cz * CHUNK_WORLD_SIZE
    );
    // Scale voxel coords to world coords
    mesh.scale.set(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);

    this.scene.add(mesh);
    chunk.mesh = mesh;
    chunk.meshData = null; // free the buffer data
  }

  dispose() {
    for (const worker of this.workerPool) worker.terminate();
    for (const [, chunk] of this.chunks) {
      if (chunk.mesh) {
        this.scene.remove(chunk.mesh);
        chunk.dispose();
      }
    }
    this.chunks.clear();
  }
}
