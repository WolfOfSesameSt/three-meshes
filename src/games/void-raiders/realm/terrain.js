/**
 * Chunked voxel terrain for Void Raiders realms.
 *
 * Generates terrain around the mothership using noise-based heightmap.
 * Chunks are loaded/unloaded as the ship moves through the realm.
 */

import * as THREE from "three";
import { fbm, noise2 } from "../utils/noise.js";
import {
  CHUNK_SIZE,
  VOXEL_SCALE,
  CHUNK_LOAD_RADIUS,
  CHUNK_UNLOAD_RADIUS,
  TERRAIN_HEIGHT,
  TERRAIN_OCTAVES,
  TERRAIN_LACUNARITY,
  TERRAIN_PERSISTENCE,
  TERRAIN_FREQUENCY,
} from "../config.js";

// ─── Biome Palettes ─────────────────────────────────────────────
// Multiple color palettes selected by a second noise layer

const BIOME_PALETTES = [
  // 0: Alien Violet (original)
  [
    new THREE.Color(0x5a3a6e), // purple bedrock
    new THREE.Color(0x7a5088), // violet
    new THREE.Color(0x9a6a8e), // dusty mauve
    new THREE.Color(0xb08858), // warm ochre
    new THREE.Color(0xc4a060), // sandy gold
    new THREE.Color(0x6a9a78), // alien green
    new THREE.Color(0x88b8a0), // pale teal
    new THREE.Color(0xbbaa88), // light stone
  ],
  // 1: Crimson Waste
  [
    new THREE.Color(0x3a1a1a), // dark maroon
    new THREE.Color(0x5a2828), // dried blood
    new THREE.Color(0x8a4030), // rust
    new THREE.Color(0xaa5538), // burnt sienna
    new THREE.Color(0xcc7744), // warm copper
    new THREE.Color(0xbb8855), // desert sand
    new THREE.Color(0xdd9966), // light clay
    new THREE.Color(0xccaa88), // bleached stone
  ],
  // 2: Frozen Depths
  [
    new THREE.Color(0x1a2a3a), // deep ocean
    new THREE.Color(0x2a3a55), // midnight blue
    new THREE.Color(0x3a5570), // steel blue
    new THREE.Color(0x4a7088), // slate
    new THREE.Color(0x6a90a0), // ice blue
    new THREE.Color(0x88aabb), // frost
    new THREE.Color(0xaaccdd), // pale ice
    new THREE.Color(0xccddee), // snow
  ],
];

// Biome selection noise frequency (very low = large biome regions)
const BIOME_FREQUENCY = 0.00025;

// Plateau noise — areas where terrain flattens out
const PLATEAU_FREQUENCY = 0.0008;
const PLATEAU_THRESHOLD = 0.65; // noise above this → plateau

/**
 * Get the biome index (0-2) at a world position using a second noise layer.
 */
function getBiomeIndex(worldX, worldZ) {
  const n = noise2(worldX * BIOME_FREQUENCY + 100, worldZ * BIOME_FREQUENCY + 200);
  if (n < 0.33) return 0;
  if (n < 0.66) return 1;
  return 2;
}

/**
 * Get terrain height at a world position.
 * Includes plateau smoothing and inter-level blending.
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {number} height in voxels
 */
export function getTerrainHeight(worldX, worldZ) {
  const nx = worldX * TERRAIN_FREQUENCY;
  const nz = worldZ * TERRAIN_FREQUENCY;
  let h = fbm(nx, nz, TERRAIN_OCTAVES, TERRAIN_LACUNARITY, TERRAIN_PERSISTENCE);

  // Plateau effect — flatten certain areas for interesting topology
  const plateauNoise = noise2(
    worldX * PLATEAU_FREQUENCY + 50,
    worldZ * PLATEAU_FREQUENCY + 50
  );
  if (plateauNoise > PLATEAU_THRESHOLD) {
    // Smoothly blend toward a flat level
    const blend = (plateauNoise - PLATEAU_THRESHOLD) / (1 - PLATEAU_THRESHOLD);
    const plateauLevel = Math.round(h * 4) / 4; // snap to quarter-levels
    h = h + (plateauLevel - h) * blend * blend;
  }

  // Smooth stepping: instead of hard Math.floor, blend between levels
  // This reduces the uniformly-stepped look
  const raw = h * TERRAIN_HEIGHT;
  const floored = Math.floor(raw);
  const frac = raw - floored;
  // Only step when the fractional part is decisive (sharp transitions at 0.3/0.7)
  const smoothFrac = frac < 0.3 ? 0 : frac > 0.7 ? 1 : (frac - 0.3) / 0.4;
  return floored + Math.round(smoothFrac);
}

/**
 * Get terrain color based on height and biome.
 */
function getTerrainColor(height, worldX, worldZ) {
  const biome = getBiomeIndex(worldX, worldZ);
  const palette = BIOME_PALETTES[biome];
  const idx = Math.min(
    Math.max(0, Math.floor((height / TERRAIN_HEIGHT) * palette.length)),
    palette.length - 1
  );

  // Blend between adjacent biomes at boundaries for smoother transitions
  const n = noise2(worldX * BIOME_FREQUENCY + 100, worldZ * BIOME_FREQUENCY + 200);
  const edgeDist = Math.min(
    Math.abs(n - 0.33),
    Math.abs(n - 0.66)
  );

  if (edgeDist < 0.06) {
    // Near a biome boundary — blend with the neighbor palette
    const blend = edgeDist / 0.06;
    const neighborBiome = (biome + 1) % BIOME_PALETTES.length;
    const neighborPalette = BIOME_PALETTES[neighborBiome];
    const nIdx = Math.min(
      Math.max(0, Math.floor((height / TERRAIN_HEIGHT) * neighborPalette.length)),
      neighborPalette.length - 1
    );
    const base = palette[idx];
    const neighbor = neighborPalette[nIdx];
    return new THREE.Color(
      base.r * blend + neighbor.r * (1 - blend),
      base.g * blend + neighbor.g * (1 - blend),
      base.b * blend + neighbor.b * (1 - blend)
    );
  }

  return palette[idx];
}

/**
 * Build a chunk mesh using greedy-ish face merging.
 * Returns a single BufferGeometry for the chunk.
 */
function buildChunkMesh(chunkX, chunkZ) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertCount = 0;

  const worldOffsetX = chunkX * CHUNK_SIZE * VOXEL_SCALE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE * VOXEL_SCALE;

  // Generate heightmap for this chunk + 1 border for neighbor checks
  const heights = new Int32Array((CHUNK_SIZE + 2) * (CHUNK_SIZE + 2));
  for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
    for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
      const wx = worldOffsetX + lx * VOXEL_SCALE;
      const wz = worldOffsetZ + lz * VOXEL_SCALE;
      heights[(lz + 1) * (CHUNK_SIZE + 2) + (lx + 1)] = getTerrainHeight(wx, wz);
    }
  }

  function getH(lx, lz) {
    return heights[(lz + 1) * (CHUNK_SIZE + 2) + (lx + 1)];
  }

  // For each voxel column, emit exposed faces
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const h = getH(lx, lz);
      if (h <= 0) continue;

      const wx = worldOffsetX + lx * VOXEL_SCALE;
      const wz = worldOffsetZ + lz * VOXEL_SCALE;
      const s = VOXEL_SCALE;

      // Top face (always exposed for the top of the column)
      const wy = h * VOXEL_SCALE;
      const color = getTerrainColor(h, wx, wz);

      // Top face
      positions.push(wx, wy, wz, wx + s, wy, wz, wx + s, wy, wz + s, wx, wy, wz + s);
      for (let i = 0; i < 4; i++) {
        normals.push(0, 1, 0);
        colors.push(color.r, color.g, color.b);
      }
      indices.push(vertCount, vertCount + 2, vertCount + 1, vertCount, vertCount + 3, vertCount + 2);
      vertCount += 4;

      // Side faces — only emit if neighbor is shorter
      const neighbors = [
        { dx: 1, dz: 0, nx: 1, nz: 0 },  // +X
        { dx: -1, dz: 0, nx: -1, nz: 0 }, // -X
        { dx: 0, dz: 1, nx: 0, nz: 1 },   // +Z
        { dx: 0, dz: -1, nx: 0, nz: -1 }, // -Z
      ];

      for (const n of neighbors) {
        const nh = getH(lx + n.dx, lz + n.dz);
        if (nh >= h) continue;

        const sideColor = getTerrainColor(h, wx, wz).clone().multiplyScalar(0.85);
        const startY = nh * VOXEL_SCALE;
        const endY = wy;

        // One quad for the exposed side
        let x0, z0, x1, z1;
        if (n.dx === 1) {
          x0 = wx + s; z0 = wz; x1 = wx + s; z1 = wz + s;
        } else if (n.dx === -1) {
          x0 = wx; z0 = wz + s; x1 = wx; z1 = wz;
        } else if (n.dz === 1) {
          x0 = wx + s; z0 = wz + s; x1 = wx; z1 = wz + s;
        } else {
          x0 = wx; z0 = wz; x1 = wx + s; z1 = wz;
        }

        positions.push(
          x0, startY, z0,
          x1, startY, z1,
          x1, endY, z1,
          x0, endY, z0
        );
        for (let i = 0; i < 4; i++) {
          normals.push(n.nx, 0, n.nz);
          colors.push(sideColor.r, sideColor.g, sideColor.b);
        }
        indices.push(vertCount, vertCount + 2, vertCount + 1, vertCount, vertCount + 3, vertCount + 2);
        vertCount += 4;
      }
    }
  }

  if (vertCount === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  return geometry;
}

// Shared material for all terrain chunks
const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.85,
  metalness: 0.1,
  flatShading: true,
});

/**
 * Terrain manager — handles chunk loading/unloading around a focus point.
 */
export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map(); // key "cx,cz" → THREE.Mesh
  }

  /**
   * Update loaded chunks based on focus position (mothership).
   * @param {THREE.Vector3} focusPos
   */
  update(focusPos) {
    const cx = Math.floor(focusPos.x / (CHUNK_SIZE * VOXEL_SCALE));
    const cz = Math.floor(focusPos.z / (CHUNK_SIZE * VOXEL_SCALE));

    // Load nearby chunks
    for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
      for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        if (this.chunks.has(key)) continue;

        const geometry = buildChunkMesh(cx + dx, cz + dz);
        if (geometry) {
          const mesh = new THREE.Mesh(geometry, terrainMaterial);
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.chunks.set(key, mesh);
        } else {
          // Empty chunk — mark as loaded but no mesh
          this.chunks.set(key, null);
        }
      }
    }

    // Unload distant chunks
    for (const [key, mesh] of this.chunks) {
      const [kcx, kcz] = key.split(",").map(Number);
      const dist = Math.max(Math.abs(kcx - cx), Math.abs(kcz - cz));
      if (dist > CHUNK_UNLOAD_RADIUS) {
        if (mesh) {
          mesh.geometry.dispose();
          this.scene.remove(mesh);
        }
        this.chunks.delete(key);
      }
    }
  }

  dispose() {
    for (const [, mesh] of this.chunks) {
      if (mesh) {
        mesh.geometry.dispose();
        this.scene.remove(mesh);
      }
    }
    this.chunks.clear();
  }
}
