/**
 * Chunked Three.js terrain renderer for the BC biome.
 *
 * Strategy:
 *   - Split the 500×500 heightfield into CHUNK_TILES×CHUNK_TILES
 *     chunks (plus a ragged edge chunk for the remainder).
 *   - Each chunk is a BufferGeometry with per-vertex position, normal
 *     and color. We use flatShading + vertexColors so soil-OM and
 *     slope shading come through directly on MeshStandardMaterial.
 *   - One shared MeshStandardMaterial across all chunks.
 *
 * Vertex color mapping:
 *   - Base color interpolates between a "poor soil" color and a
 *     "rich soil" color based on soil OM (1.0 → 6.0).
 *   - Stream tiles paint blue (mistCyan tint).
 *   - Rocky outcrop tiles paint stone grey.
 *   - Ruin tiles paint earth brown.
 *   - Forest-edge tiles paint dark olive-green.
 *   - Homestead tiles paint meadow-green.
 *   - Finally multiply by a slope shading factor so ridges feel
 *     lit even before the actual sun light kicks in.
 */

import * as THREE from "three";
import { MAP_TILES, CHUNK_TILES, TILE_SIZE, PALETTE } from "../config.js";
import { findPoi } from "./pois.js";

const N = MAP_TILES;

// Convert hex int color to an RGB triple in 0..1.
function hexToRgb(hex) {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

const POOR_SOIL = hexToRgb(PALETTE.sage);         // dry, pale greenish
const RICH_SOIL = hexToRgb(PALETTE.oliveDark);    // rich dark green
const STREAM_COLOR = hexToRgb(PALETTE.skyPastel);
const STONE_COLOR = hexToRgb(PALETTE.moonlightSilver);
const RUIN_COLOR = hexToRgb(PALETTE.earthBrown);
const FOREST_COLOR = hexToRgb(PALETTE.oliveDark);
const HOMESTEAD_COLOR = hexToRgb(PALETTE.meadowGreen);

function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Per-tile base color from soil-OM + POI overrides.
 */
function tileColor(i, omPct, overrides) {
  if (overrides.streamTiles.has(i)) return STREAM_COLOR;
  if (overrides.outcropTiles.has(i)) return STONE_COLOR;
  if (overrides.ruinTiles.has(i)) return RUIN_COLOR;
  if (overrides.homesteadTiles.has(i)) return HOMESTEAD_COLOR;
  if (overrides.forestTiles.has(i)) return FOREST_COLOR;
  // Map OM 1.0 (poor) → 6.0 (rich) onto the sage→olive gradient.
  const t = Math.max(0, Math.min(1, (omPct - 1.0) / 5.0));
  return mixRgb(POOR_SOIL, RICH_SOIL, t);
}

/**
 * Build one chunk mesh. `cx, cy` are chunk tile origins.
 * `cw, ch` are the chunk width/height in tiles (variable for edges).
 *
 * We emit one quad per tile (two triangles) with unique vertices so
 * flat shading reads correctly. That's 4 verts per tile.
 * For a 32×32 chunk: 4096 verts, 6144 indices.
 */
function buildChunkGeometry(cx, cy, cw, ch, heightfield, soilOm, overrides) {
  const tilesPerChunk = cw * ch;
  const vertCount = tilesPerChunk * 4;
  const indexCount = tilesPerChunk * 6;

  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(indexCount);

  let vp = 0;
  let cp = 0;
  let ip = 0;
  let vi = 0;

  // World offset so chunks line up.
  // The full map spans 0..N*TILE_SIZE on x and z. Centre on origin.
  const ox = -((N * TILE_SIZE) / 2);
  const oz = -((N * TILE_SIZE) / 2);

  for (let ty = 0; ty < ch; ty++) {
    for (let tx = 0; tx < cw; tx++) {
      const gx = cx + tx;
      const gy = cy + ty;
      // Heights at the four corners (sample from neighbors for
      // smooth tessellation). Clamp to map bounds.
      const h00 = heightfield[gy * N + gx];
      const h10 = heightfield[gy * N + Math.min(N - 1, gx + 1)];
      const h01 = heightfield[Math.min(N - 1, gy + 1) * N + gx];
      const h11 =
        heightfield[Math.min(N - 1, gy + 1) * N + Math.min(N - 1, gx + 1)];

      const x0 = ox + gx * TILE_SIZE;
      const z0 = oz + gy * TILE_SIZE;
      const x1 = x0 + TILE_SIZE;
      const z1 = z0 + TILE_SIZE;

      // v0 = (x0,h00,z0), v1 = (x1,h10,z0), v2 = (x0,h01,z1), v3 = (x1,h11,z1)
      positions[vp++] = x0; positions[vp++] = h00; positions[vp++] = z0;
      positions[vp++] = x1; positions[vp++] = h10; positions[vp++] = z0;
      positions[vp++] = x0; positions[vp++] = h01; positions[vp++] = z1;
      positions[vp++] = x1; positions[vp++] = h11; positions[vp++] = z1;

      const i = gy * N + gx;
      const baseColor = tileColor(i, soilOm[i], overrides);

      // Slope shading: use centre-to-corner height delta to darken
      // on steeper slopes a bit. A cheap proxy for ambient occlusion.
      const dH = Math.max(
        Math.abs(h10 - h00),
        Math.abs(h01 - h00),
        Math.abs(h11 - h00)
      );
      const slope = Math.min(1, dH / 3.0);
      const darken = 1 - slope * 0.25;

      const r = baseColor[0] * darken;
      const g = baseColor[1] * darken;
      const b = baseColor[2] * darken;
      colors[cp++] = r; colors[cp++] = g; colors[cp++] = b;
      colors[cp++] = r; colors[cp++] = g; colors[cp++] = b;
      colors[cp++] = r; colors[cp++] = g; colors[cp++] = b;
      colors[cp++] = r; colors[cp++] = g; colors[cp++] = b;

      // Two triangles: (v0, v2, v1), (v1, v2, v3) — clockwise
      // winding for Y-up, matches default normal direction.
      indices[ip++] = vi + 0;
      indices[ip++] = vi + 2;
      indices[ip++] = vi + 1;
      indices[ip++] = vi + 1;
      indices[ip++] = vi + 2;
      indices[ip++] = vi + 3;
      vi += 4;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @param {object} data  output of generateBiome()
 * @param {THREE.Scene} scene
 * @returns {{ chunks: THREE.Mesh[], dispose: () => void }}
 */
export function createTerrain(data, scene) {
  const { heightfield, soilOm, pois, stream } = data;

  const homestead = findPoi(pois, "starting-homestead");
  const forestEdge = findPoi(pois, "old-growth-forest-edge");
  const outcrop = findPoi(pois, "rocky-outcrop");
  const ruin = findPoi(pois, "abandoned-farmstead-ruin");

  const overrides = {
    streamTiles: stream?.tiles ?? new Set(),
    outcropTiles: outcrop?.tiles ?? new Set(),
    ruinTiles: ruin?.tiles ?? new Set(),
    homesteadTiles: homestead?.tiles ?? new Set(),
    forestTiles: forestEdge?.tiles ?? new Set(),
  };

  const material = new THREE.MeshStandardMaterial({
    flatShading: true,
    vertexColors: true,
    metalness: 0.0,
    roughness: 0.95,
  });

  const chunks = [];
  const terrainGroup = new THREE.Group();
  terrainGroup.name = "bc-biome-terrain";

  for (let cy = 0; cy < N; cy += CHUNK_TILES) {
    for (let cx = 0; cx < N; cx += CHUNK_TILES) {
      const cw = Math.min(CHUNK_TILES, N - cx);
      const ch = Math.min(CHUNK_TILES, N - cy);
      const geometry = buildChunkGeometry(
        cx,
        cy,
        cw,
        ch,
        heightfield,
        soilOm,
        overrides
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `chunk-${cx}-${cy}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.chunkOrigin = { x: cx, y: cy };
      chunks.push(mesh);
      terrainGroup.add(mesh);
    }
  }

  scene.add(terrainGroup);

  function dispose() {
    for (const mesh of chunks) {
      mesh.geometry.dispose();
    }
    material.dispose();
    scene.remove(terrainGroup);
  }

  return { chunks, group: terrainGroup, dispose };
}
