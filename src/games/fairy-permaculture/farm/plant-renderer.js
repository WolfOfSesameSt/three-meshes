/**
 * Fairy Permaculture — plant renderer (C3.1).
 *
 * Mounts Three.js meshes for every PlantInstance owned by a
 * PlantManager, and keeps them in sync per day. Strategy:
 *
 *   - A single `THREE.Group` named `plants` is added to the scene.
 *   - Per plant, we cache a mesh keyed by a stable string `plantKey`
 *     and rebuild it when the plant's (stage, ripe) signature changes.
 *   - Plants in `groundcover` and `shrub` categories ARE candidates
 *     for InstancedMesh batching; for the MVP we keep regular meshes
 *     (one Group per plant) to keep the ripe/stage swap code simple.
 *     Instancing is structured so future chunks can slot it in
 *     without touching the manager.
 *
 * Plant y-position is sampled from the biome heightfield so plants
 * hug the terrain.
 */

import * as THREE from "three";
import { MAP_TILES, TILE_SIZE } from "../config.js";
import { buildPlantMesh, disposePlantMesh } from "./plant-mesh.js";
import { isRipe } from "./plant-instance.js";

const N = MAP_TILES;
const WORLD_OFFSET = -((N * TILE_SIZE) / 2);

function tileToWorld(tileX, tileY, heightfield) {
  const x = WORLD_OFFSET + (tileX + 0.5) * TILE_SIZE;
  const z = WORLD_OFFSET + (tileY + 0.5) * TILE_SIZE;
  const y = heightfield
    ? heightfield[Math.min(heightfield.length - 1, tileY * N + tileX)]
    : 0;
  return { x, y, z };
}

function plantKey(p) {
  return `${p.id}@${p.tileX},${p.tileY}`;
}

/**
 * Build a renderer bound to a manager + biome data.
 *
 * @param {object} opts
 * @param {object} opts.manager       PlantManager instance
 * @param {THREE.Scene} opts.scene
 * @param {Float32Array} opts.heightfield
 * @returns {{ group: THREE.Group, sync: () => void, dispose: () => void }}
 */
export function createPlantRenderer({ manager, scene, heightfield }) {
  const group = new THREE.Group();
  group.name = "plants";
  scene.add(group);

  /** @type {Map<string, { mesh: THREE.Group, sig: string }>} */
  const cache = new Map();

  function signatureFor(plant, species) {
    const ripe = isRipe(plant, species);
    return `${plant.stage}|${ripe ? "R" : "."}`;
  }

  function sync() {
    const seen = new Set();
    for (const p of manager.all()) {
      const species = manager.getSpecies(p.id);
      const key = plantKey(p);
      seen.add(key);
      const sig = signatureFor(p, species);
      const existing = cache.get(key);
      if (existing && existing.sig === sig) continue;

      if (existing) {
        group.remove(existing.mesh);
        disposePlantMesh(existing.mesh);
      }

      const mesh = buildPlantMesh(species, p.tileX, p.tileY, {
        stage: p.stage,
        ripe: isRipe(p, species),
        seed: p.seed,
      });
      const { x, y, z } = tileToWorld(p.tileX, p.tileY, heightfield);
      mesh.position.set(x, y, z);
      group.add(mesh);
      cache.set(key, { mesh, sig });
    }
    // Prune meshes whose plants disappeared (harvested/chopped/removed).
    for (const [key, entry] of cache.entries()) {
      if (!seen.has(key)) {
        group.remove(entry.mesh);
        disposePlantMesh(entry.mesh);
        cache.delete(key);
      }
    }
  }

  // Sync whenever the manager tells us something changed.
  const unsubscribe = manager.onChange(sync);

  // Initial sync to mount any pre-seeded plants.
  sync();

  function dispose() {
    unsubscribe();
    for (const entry of cache.values()) {
      disposePlantMesh(entry.mesh);
    }
    cache.clear();
    scene.remove(group);
  }

  return { group, sync, dispose };
}
