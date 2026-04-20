/**
 * BC biome procgen — orchestrator.
 *
 * `generateBiome(seed)` is the pure-logic entry point used by tests
 * and by the renderer. `mountBiome(data, scene)` wraps the Three.js
 * terrain renderer (so tests that don't touch WebGL don't import it).
 */

import { generateHeightfield } from "./heightfield.js";
import { placePois, findPoi } from "./pois.js";
import { carveStream } from "./water.js";
import { generateSoilOmField } from "./soil-distribution.js";
import { createTerrain } from "./terrain-renderer.js";
import { MAP_TILES, TILE_SIZE } from "../config.js";

/**
 * Pure-logic biome generation. No Three.js.
 *
 * Pipeline:
 *   1. Seeded heightfield (layered value noise + ridge + valley)
 *   2. POI placement (forest edge, homestead, outcrop, ruin)
 *   3. Carve stream polyline (mutates heightfield)
 *   4. Soil-OM field based on heightfield + POI overrides
 *
 * @param {number} seed
 * @returns {{
 *   heightfield: Float32Array,
 *   soilOm: Float32Array,
 *   pois: Array<object>,
 *   stream: { path: Array<{x:number,y:number}>, tiles: Set<number> },
 *   seed: number,
 * }}
 */
export function generateBiome(seed) {
  const heightfield = generateHeightfield(seed);
  const pois = placePois(heightfield, seed);
  const forestEdge = findPoi(pois, "old-growth-forest-edge");
  const stream = carveStream(heightfield, seed, forestEdge);
  const soilOm = generateSoilOmField(heightfield, pois, seed);

  return {
    heightfield,
    soilOm,
    pois,
    stream,
    seed,
  };
}

/**
 * Three.js-dependent entry: build the terrain mesh for a scene.
 *
 * @param {object} biomeData  return value of generateBiome()
 * @param {THREE.Scene} scene
 * @returns {{ dispose: () => void, chunks: THREE.Mesh[], group: THREE.Group }}
 */
export function mountBiome(biomeData, scene) {
  return createTerrain(biomeData, scene);
}

/**
 * Helper: world-space centre of the starting homestead (for camera
 * targeting etc.). Returns a `{x, y, z}` object in Three.js space
 * (y = height, z = world north/south).
 */
export function homesteadWorldCenter(biomeData) {
  const hp = findPoi(biomeData.pois, "starting-homestead");
  if (!hp) return { x: 0, y: 0, z: 0 };
  const { center } = hp.meta;
  const ox = -((MAP_TILES * TILE_SIZE) / 2);
  const oz = -((MAP_TILES * TILE_SIZE) / 2);
  const wx = ox + (center.x + 0.5) * TILE_SIZE;
  const wz = oz + (center.y + 0.5) * TILE_SIZE;
  const h = biomeData.heightfield[center.y * MAP_TILES + center.x];
  return { x: wx, y: h, z: wz };
}
