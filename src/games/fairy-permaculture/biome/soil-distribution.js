/**
 * Soil organic-matter field generator.
 *
 * Produces a per-tile OM% value satisfying the BC coastal profile:
 *   - forest-edge tiles            >= 4.0 % OM
 *   - starting-homestead pad       <= 1.5 % OM   (players start poor)
 *   - ruin tiles                   2.0–3.0 % OM
 *   - everywhere else              1.5–3.5 % OM, varying on noise
 *
 * Output is a Float32Array parallel to the heightfield (same
 * indexing: `y * MAP_TILES + x`). Deterministic for a given seed.
 */

import { MAP_TILES } from "../config.js";
import { createRng } from "./seeded-rng.js";
import { findPoi } from "./pois.js";

const N = MAP_TILES;

function makeValueNoise(rng, gridSize) {
  const grid = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  function sample(x, y) {
    const gx = ((x % gridSize) + gridSize) % gridSize;
    const gy = ((y % gridSize) + gridSize) % gridSize;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % gridSize;
    const y1 = (y0 + 1) % gridSize;
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * gridSize + x0];
    const b = grid[y0 * gridSize + x1];
    const c = grid[y1 * gridSize + x0];
    const d = grid[y1 * gridSize + x1];
    const ab = a + (b - a) * sx;
    const cd = c + (d - c) * sx;
    return ab + (cd - ab) * sy;
  }
  return sample;
}

/**
 * @param {Float32Array} heightfield
 * @param {Array<object>} pois
 * @param {number} seed
 * @returns {Float32Array} OM% per tile
 */
export function generateSoilOmField(heightfield, pois, seed) {
  const rng = createRng(seed).fork(300);
  const noise = makeValueNoise(rng.fork(1), 32);

  const forestEdge = findPoi(pois, "old-growth-forest-edge");
  const homestead = findPoi(pois, "starting-homestead");
  const ruin = findPoi(pois, "abandoned-farmstead-ruin");

  const out = new Float32Array(N * N);
  const ruinRng = rng.fork(2);

  // Pre-sample per-tile ruin jitter deterministically. Values in
  // [2.0, 3.0].
  // (Cheap to do on demand — only ~60 tiles.)
  const ruinJitter = new Map();
  if (ruin) {
    for (const i of ruin.tiles) {
      ruinJitter.set(i, 2.0 + ruinRng.next() * 1.0);
    }
  }

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      // Baseline field: 1.5–3.5 varying on smooth noise.
      const n = noise((x / N) * 32, (y / N) * 32); // [0,1)
      let om = 1.5 + n * 2.0; // [1.5, 3.5)

      // Homestead pad — poor soil, cap at 1.5 with tiny jitter.
      if (homestead && homestead.tiles.has(i)) {
        om = 1.0 + n * 0.5; // [1.0, 1.5)
      }

      // Forest edge — rich. Use >= 4.0 with noise added up to ~5.5.
      if (forestEdge && forestEdge.tiles.has(i)) {
        om = 4.0 + n * 1.5; // [4.0, 5.5)
      }

      // Ruin — mid 2–3.
      if (ruin && ruin.tiles.has(i)) {
        om = ruinJitter.get(i);
      }

      out[i] = om;
    }
  }

  return out;
}
