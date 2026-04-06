/**
 * Alien structures — simple enemy base clusters placed on terrain.
 *
 * Generates 2-4 structures per realm. Each is a cluster of box geometries
 * merged into a single BufferGeometry for performance.
 * Placed on flat terrain areas, serves as visual landmarks.
 */

import * as THREE from "three";
import { getTerrainHeight } from "./terrain.js";
import { mulberry32 } from "../utils/noise.js";
import { VOXEL_SCALE } from "../config.js";

const STRUCTURE_COLOR = 0x445566;
const STRUCTURE_EMISSIVE = 0x112233;
const MIN_STRUCTURES = 2;
const MAX_STRUCTURES = 4;
const MIN_SPACING = 600; // meters between structures
const BUILDINGS_PER_STRUCTURE = [3, 5]; // min, max buildings per cluster

/**
 * Generate structure positions using seeded RNG with minimum spacing.
 * @param {number} seed
 * @param {number} realmSize
 * @param {Array<object>} landmarks — pass landmarks to prefer flat areas near them
 * @returns {Array<object>} — array of structure descriptors
 */
export function generateStructurePositions(seed, realmSize = 10000, landmarks = []) {
  const rng = mulberry32(seed + 777); // offset seed from landmarks
  const count = MIN_STRUCTURES + Math.floor(rng() * (MAX_STRUCTURES - MIN_STRUCTURES + 1));

  const structures = [];
  const maxAttempts = 80;

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = (rng() - 0.5) * realmSize * 0.7;
      const z = (rng() - 0.5) * realmSize * 0.7;

      // Check spacing
      let tooClose = false;
      for (const existing of structures) {
        const dx = x - existing.x;
        const dz = z - existing.z;
        if (Math.sqrt(dx * dx + dz * dz) < MIN_SPACING) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Check terrain flatness — sample a few nearby points
      const h0 = getTerrainHeight(x, z);
      const h1 = getTerrainHeight(x + 20, z);
      const h2 = getTerrainHeight(x, z + 20);
      const h3 = getTerrainHeight(x - 20, z);
      const maxDiff = Math.max(
        Math.abs(h1 - h0), Math.abs(h2 - h0), Math.abs(h3 - h0)
      );
      // Accept if relatively flat (within 3 voxels)
      if (maxDiff > 3) continue;

      const buildingCount = BUILDINGS_PER_STRUCTURE[0] +
        Math.floor(rng() * (BUILDINGS_PER_STRUCTURE[1] - BUILDINGS_PER_STRUCTURE[0] + 1));

      structures.push({
        x,
        z,
        terrainH: h0,
        buildingCount,
        seed: Math.floor(rng() * 999999),
      });
      break;
    }
  }

  return structures;
}

/**
 * Build a merged mesh for a structure cluster.
 * @param {object} structure — { x, z, terrainH, buildingCount, seed }
 * @returns {THREE.Mesh}
 */
function buildStructureMesh(structure) {
  const rng = mulberry32(structure.seed);
  const geometries = [];
  const baseY = structure.terrainH * VOXEL_SCALE;

  for (let i = 0; i < structure.buildingCount; i++) {
    const w = 4 + rng() * 8;
    const h = 6 + rng() * 16;
    const d = 4 + rng() * 8;

    const offsetX = (rng() - 0.5) * 40;
    const offsetZ = (rng() - 0.5) * 40;
    const rotY = rng() * Math.PI * 0.5;

    const box = new THREE.BoxGeometry(w, h, d);
    const matrix = new THREE.Matrix4();
    matrix.makeRotationY(rotY);
    matrix.setPosition(
      structure.x + offsetX,
      baseY + h / 2,
      structure.z + offsetZ
    );
    box.applyMatrix4(matrix);
    geometries.push(box);
  }

  // Merge all building geometries
  const merged = mergeGeometries(geometries);

  // Dispose individual geometries
  for (const geo of geometries) geo.dispose();

  const material = new THREE.MeshStandardMaterial({
    color: STRUCTURE_COLOR,
    emissive: STRUCTURE_EMISSIVE,
    emissiveIntensity: 0.3,
    roughness: 0.7,
    metalness: 0.5,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Simple geometry merge — concatenate all positions/normals/indices.
 * @param {Array<THREE.BufferGeometry>} geometries
 * @returns {THREE.BufferGeometry}
 */
function mergeGeometries(geometries) {
  const positions = [];
  const normals = [];
  const indices = [];
  let vertexOffset = 0;

  for (const geo of geometries) {
    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    const idx = geo.index;

    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.array[i] + vertexOffset);
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices.push(i + vertexOffset);
      }
    }

    vertexOffset += posAttr.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

/**
 * Alien structure manager — generates and manages structure meshes.
 */
export class StructureManager {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this.structures = [];
  }

  /**
   * Generate structures from a seed and add to scene.
   * @param {number} seed
   * @param {number} realmSize
   * @param {Array<object>} landmarks
   */
  generate(seed, realmSize = 10000, landmarks = []) {
    this.structures = generateStructurePositions(seed, realmSize, landmarks);

    for (const structure of this.structures) {
      const mesh = buildStructureMesh(structure);
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  /**
   * Get all structure positions (for deposit placement logic).
   */
  getPositions() {
    return this.structures.map(s => ({ x: s.x, z: s.z }));
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
    this.meshes = [];
    this.structures = [];
  }
}
