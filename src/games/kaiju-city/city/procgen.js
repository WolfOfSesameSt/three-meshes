/**
 * Procedural test city generator.
 * Creates a grid of random buildings with roads between them.
 * Used for testing before OSM data is wired up.
 */

import { CHUNK_SIZE, VOXEL, VOXEL_SIZE, CHUNK_WORLD_SIZE } from "../config.js";

/**
 * Generate a test city spanning a grid of chunks.
 * @param {import('./chunk-manager.js').ChunkManager} chunkManager
 * @param {number} radiusChunks - radius in chunks to generate
 */
export function generateTestCity(chunkManager, radiusChunks = 6) {
  const BLOCK_SIZE = 24;  // voxels per city block (including road)
  const ROAD_WIDTH = 4;   // voxels wide
  const BUILD_SIZE_MIN = 6;
  const BUILD_SIZE_MAX = 16;
  const BUILD_HEIGHT_MIN = 4;
  const BUILD_HEIGHT_MAX = 28;

  let buildingId = 1;

  // Seed a simple PRNG for reproducibility
  let seed = 42;
  function rand() {
    seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (seed >>> 0) / 0xFFFFFFFF;
  }
  function randInt(min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  // Fill ground and roads first
  for (let ccx = -radiusChunks; ccx < radiusChunks; ccx++) {
    for (let ccz = -radiusChunks; ccz < radiusChunks; ccz++) {
      const chunk = chunkManager.getOrCreate(ccx, ccz);

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          // World voxel coords
          const wx = ccx * CHUNK_SIZE + lx;
          const wz = ccz * CHUNK_SIZE + lz;

          // Determine if this is a road
          const isRoad = (((wx % BLOCK_SIZE) + BLOCK_SIZE) % BLOCK_SIZE) < ROAD_WIDTH ||
                         (((wz % BLOCK_SIZE) + BLOCK_SIZE) % BLOCK_SIZE) < ROAD_WIDTH;

          chunk.set(lx, 0, lz, isRoad ? VOXEL.ROAD : VOXEL.GROUND);
        }
      }
    }
  }

  // Place buildings in each city block
  const totalVoxels = radiusChunks * 2 * CHUNK_SIZE;
  const startVoxel = -radiusChunks * CHUNK_SIZE;

  for (let bx = startVoxel; bx < startVoxel + totalVoxels; bx += BLOCK_SIZE) {
    for (let bz = startVoxel; bz < startVoxel + totalVoxels; bz += BLOCK_SIZE) {
      // Building area within block (inside the roads)
      const areaStartX = bx + ROAD_WIDTH;
      const areaStartZ = bz + ROAD_WIDTH;
      const areaSize = BLOCK_SIZE - ROAD_WIDTH;

      // Place 1-3 buildings per block
      const numBuildings = randInt(1, 3);
      for (let b = 0; b < numBuildings; b++) {
        const bw = randInt(BUILD_SIZE_MIN, Math.min(BUILD_SIZE_MAX, areaSize - 2));
        const bd = randInt(BUILD_SIZE_MIN, Math.min(BUILD_SIZE_MAX, areaSize - 2));
        const bh = randInt(BUILD_HEIGHT_MIN, BUILD_HEIGHT_MAX);

        const ox = areaStartX + randInt(0, Math.max(0, areaSize - bw - 1));
        const oz = areaStartZ + randInt(0, Math.max(0, areaSize - bd - 1));

        // Choose material
        const matRoll = rand();
        let material;
        if (bh > 15) {
          material = rand() > 0.5 ? VOXEL.GLASS : VOXEL.STEEL;
        } else if (matRoll < 0.6) {
          material = VOXEL.CONCRETE;
        } else if (matRoll < 0.85) {
          material = VOXEL.GLASS;
        } else {
          material = VOXEL.STEEL;
        }

        const bid = buildingId++;

        // Fill building voxels
        for (let y = 1; y <= bh; y++) {
          for (let x = ox; x < ox + bw; x++) {
            for (let z = oz; z < oz + bd; z++) {
              // Convert to chunk-local
              const ccx = Math.floor(x / CHUNK_SIZE) + (x < 0 ? -1 : 0);
              const ccz = Math.floor(z / CHUNK_SIZE) + (z < 0 ? -1 : 0);
              const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
              const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

              if (y < CHUNK_SIZE) {
                const chunk = chunkManager.getOrCreate(ccx, ccz);
                chunk.set(lx, y, lz, material);
                chunk.setBuildingId(lx, y, lz, bid);
              }
            }
          }
        }
      }

      // Occasional park
      if (rand() < 0.15) {
        const px = areaStartX + 2;
        const pz = areaStartZ + 2;
        const ps = randInt(4, 8);
        for (let x = px; x < px + ps && x < areaStartX + areaSize; x++) {
          for (let z = pz; z < pz + ps && z < areaStartZ + areaSize; z++) {
            const ccx = Math.floor(x / CHUNK_SIZE) + (x < 0 ? -1 : 0);
            const ccz = Math.floor(z / CHUNK_SIZE) + (z < 0 ? -1 : 0);
            const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const chunk = chunkManager.getOrCreate(ccx, ccz);
            chunk.set(lx, 0, lz, VOXEL.PARK);
          }
        }
      }
    }
  }

  // Mark all chunks dirty so they get meshed
  for (const [, chunk] of chunkManager.chunks) {
    chunk.dirty = true;
  }
}
