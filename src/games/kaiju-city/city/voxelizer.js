/**
 * Voxelizer: converts GeoJSON building/road/water/park features into voxels.
 * Uses scanline polygon rasterization for building footprints.
 */

import {
  VOXEL, VOXEL_SIZE, CHUNK_SIZE, CHUNK_WORLD_SIZE,
  DEFAULT_BUILDING_FLOORS, FLOOR_HEIGHT, BUILDING_TAG_HEIGHTS,
} from "../config.js";
import { GeoProjection } from "../utils/geo.js";

/**
 * Voxelize OSM features into the chunk manager.
 * @param {object} osmData - {buildings, roads, water, parks}
 * @param {import('./chunk-manager.js').ChunkManager} chunkManager
 * @param {GeoProjection} projection
 * @param {function} onProgress
 */
export function voxelizeOSM(osmData, chunkManager, projection, onProgress = () => {}) {
  const { buildings, roads, water, parks } = osmData;
  let buildingId = 1;

  // First pass: lay ground everywhere that has chunks
  onProgress("Generating ground...");

  // Determine bounds from buildings to know what area to generate ground for
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of buildings) {
    const coords = getPolygonCoords(b);
    if (!coords) continue;
    for (const [lng, lat] of coords) {
      const { x, z } = projection.toLocal(lat, lng);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }

  // Expand bounds slightly and create ground chunks
  minX -= 100; maxX += 100; minZ -= 100; maxZ += 100;
  const minCX = Math.floor(minX / CHUNK_WORLD_SIZE);
  const maxCX = Math.floor(maxX / CHUNK_WORLD_SIZE);
  const minCZ = Math.floor(minZ / CHUNK_WORLD_SIZE);
  const maxCZ = Math.floor(maxZ / CHUNK_WORLD_SIZE);

  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      const chunk = chunkManager.getOrCreate(cx, cz);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          chunk.set(lx, 0, lz, VOXEL.GROUND);
        }
      }
    }
  }

  // Voxelize roads
  onProgress("Generating roads...");
  for (const road of roads) {
    const geom = road.geometry;
    if (geom.type !== "LineString" && geom.type !== "MultiLineString") continue;

    const lines = geom.type === "MultiLineString" ? geom.coordinates : [geom.coordinates];
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = projection.toLocal(line[i][1], line[i][0]);
        const b = projection.toLocal(line[i + 1][1], line[i + 1][0]);
        rasterizeLine(chunkManager, a.x, a.z, b.x, b.z, VOXEL.ROAD, 3); // 3 voxels wide
      }
    }
  }

  // Voxelize water
  onProgress("Generating water...");
  for (const w of water) {
    const coords = getPolygonCoords(w);
    if (!coords) continue;
    const projected = coords.map(([lng, lat]) => projection.toLocal(lat, lng));
    rasterizePolygon(chunkManager, projected, 0, 1, VOXEL.WATER, 0);
  }

  // Voxelize parks
  for (const p of parks) {
    const coords = getPolygonCoords(p);
    if (!coords) continue;
    const projected = coords.map(([lng, lat]) => projection.toLocal(lat, lng));
    rasterizePolygon(chunkManager, projected, 0, 1, VOXEL.PARK, 0);
  }

  // Voxelize buildings
  onProgress("Generating buildings...");
  for (let i = 0; i < buildings.length; i++) {
    if (i % 100 === 0) onProgress(`Building ${i}/${buildings.length}...`);

    const b = buildings[i];
    const coords = getPolygonCoords(b);
    if (!coords) continue;

    const projected = coords.map(([lng, lat]) => projection.toLocal(lat, lng));
    const height = estimateHeight(b);
    const heightVoxels = Math.max(1, Math.ceil(height / VOXEL_SIZE));
    const bid = buildingId++;

    // Choose material based on height
    let material = VOXEL.CONCRETE;
    if (height > 40) material = Math.random() > 0.5 ? VOXEL.GLASS : VOXEL.STEEL;
    else if (height > 20) material = Math.random() > 0.3 ? VOXEL.CONCRETE : VOXEL.GLASS;

    rasterizePolygon(chunkManager, projected, 1, heightVoxels, material, bid);
  }

  // Mark all chunks dirty
  for (const [, chunk] of chunkManager.chunks) {
    chunk.dirty = true;
  }

  onProgress("City generated!");
}

/** Extract the outer ring coordinates from a GeoJSON polygon/multipolygon */
function getPolygonCoords(feature) {
  const geom = feature.geometry;
  if (geom.type === "Polygon") return geom.coordinates[0];
  if (geom.type === "MultiPolygon") return geom.coordinates[0][0];
  return null;
}

/** Estimate building height in meters from OSM tags */
function estimateHeight(feature) {
  const tags = feature.properties?.tags || feature.properties || {};

  // Explicit height tag
  if (tags.height) {
    const h = parseFloat(tags.height);
    if (!isNaN(h)) return h;
  }

  // Building levels
  if (tags["building:levels"]) {
    const levels = parseInt(tags["building:levels"]);
    if (!isNaN(levels)) return levels * FLOOR_HEIGHT;
  }

  // Building type heuristic
  const buildingType = tags.building;
  if (buildingType && BUILDING_TAG_HEIGHTS[buildingType]) {
    return BUILDING_TAG_HEIGHTS[buildingType] * FLOOR_HEIGHT;
  }

  return DEFAULT_BUILDING_FLOORS * FLOOR_HEIGHT;
}

/**
 * Scanline rasterize a polygon into voxels.
 * @param {ChunkManager} cm
 * @param {Array<{x:number, z:number}>} polygon - projected vertices
 * @param {number} startY - starting Y voxel
 * @param {number} heightVoxels - how many voxel layers to fill
 * @param {number} voxelType
 * @param {number} buildingId
 */
function rasterizePolygon(cm, polygon, startY, heightVoxels, voxelType, buildingId) {
  if (polygon.length < 3) return;

  // Find bounding box in voxel coords
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }

  const vMinX = Math.floor(minX / VOXEL_SIZE);
  const vMaxX = Math.ceil(maxX / VOXEL_SIZE);
  const vMinZ = Math.floor(minZ / VOXEL_SIZE);
  const vMaxZ = Math.ceil(maxZ / VOXEL_SIZE);

  // Scanline fill using even-odd rule
  for (let vz = vMinZ; vz <= vMaxZ; vz++) {
    const scanZ = vz * VOXEL_SIZE + VOXEL_SIZE * 0.5;

    // Find all edge intersections with this scanline
    const intersections = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];

      if ((a.z <= scanZ && b.z > scanZ) || (b.z <= scanZ && a.z > scanZ)) {
        const t = (scanZ - a.z) / (b.z - a.z);
        intersections.push(a.x + t * (b.x - a.x));
      }
    }

    intersections.sort((a, b) => a - b);

    // Fill between pairs (even-odd)
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const xStart = Math.floor(intersections[i] / VOXEL_SIZE);
      const xEnd = Math.ceil(intersections[i + 1] / VOXEL_SIZE);

      for (let vx = xStart; vx <= xEnd; vx++) {
        const wx = vx * VOXEL_SIZE;
        const wz = vz * VOXEL_SIZE;

        for (let vy = startY; vy < startY + heightVoxels && vy < CHUNK_SIZE; vy++) {
          cm.setVoxelWorld(wx, vy * VOXEL_SIZE, wz, voxelType);

          // Set building ID if applicable
          if (buildingId > 0) {
            const loc = cm.worldToLocal(wx, vy * VOXEL_SIZE, wz);
            const chunk = cm.get(loc.cx, loc.cz);
            if (chunk) chunk.setBuildingId(loc.lx, loc.ly, loc.lz, buildingId);
          }
        }
      }
    }
  }
}

/** Rasterize a thick line (road) into ground-level voxels */
function rasterizeLine(cm, x1, z1, x2, z2, voxelType, widthVoxels) {
  const dx = x2 - x1, dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < VOXEL_SIZE) return;

  const steps = Math.ceil(length / VOXEL_SIZE);
  const halfW = widthVoxels * VOXEL_SIZE * 0.5;

  // Normal to the line
  const nx = -dz / length, nz = dx / length;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t;
    const cz = z1 + dz * t;

    for (let w = -widthVoxels; w <= widthVoxels; w++) {
      const wx = cx + nx * w * VOXEL_SIZE;
      const wz = cz + nz * w * VOXEL_SIZE;
      cm.setVoxelWorld(wx, 0, wz, voxelType);
    }
  }
}
