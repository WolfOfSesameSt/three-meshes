/**
 * BC coastal heightfield generator.
 *
 * Produces a 500×500 Float32Array of elevation values (meters) using
 * layered value noise. Profile:
 *   - Gentle overall slopes in the 0–12 m range
 *   - One ridge line running diagonally across the map
 *   - A shallow stream valley carved through the central third
 *
 * Output is indexed `y * MAP_TILES + x`. Values are bit-reproducible
 * for a given seed.
 */

import { MAP_TILES } from "../config.js";
import { createRng } from "./seeded-rng.js";

export const HEIGHT_MIN = 0;
export const HEIGHT_MAX = 14; // design target — gentle BC coastal

/**
 * Deterministic 2D value-noise built on top of a seeded lattice.
 * Lattice points carry random values in [0,1); samples are
 * bilinear-interpolated with a smoothstep-like fade.
 */
function makeValueNoise(rng, gridSize) {
  const grid = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();

  function sample(x, y) {
    // Wrap to avoid out-of-bounds.
    const gx = ((x % gridSize) + gridSize) % gridSize;
    const gy = ((y % gridSize) + gridSize) % gridSize;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % gridSize;
    const y1 = (y0 + 1) % gridSize;
    const fx = gx - x0;
    const fy = gy - y0;
    // Smoothstep fade for continuous gradient.
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
 * Distance from a point to an infinite line defined by two points.
 */
function distanceToLine(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Distance to a line *segment* endpoint-clipped; used for the
 * stream valley which doesn't extend across the whole map.
 */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * @param {number} seed
 * @returns {Float32Array} length MAP_TILES*MAP_TILES
 */
export function generateHeightfield(seed) {
  const N = MAP_TILES;
  const out = new Float32Array(N * N);

  // Forked RNG streams — each layer has an independent lattice so
  // adding a new layer doesn't shift the others.
  const baseRng = createRng(seed);
  const n1 = makeValueNoise(baseRng.fork(1), 8); // large blobs
  const n2 = makeValueNoise(baseRng.fork(2), 16); // medium
  const n3 = makeValueNoise(baseRng.fork(3), 32); // fine detail

  // Ridge line — a diagonal running roughly NE-SW; rotation and
  // offset jittered by seed so each run is unique.
  const ridgeRng = baseRng.fork(10);
  const ridgeAngle = ridgeRng.range(0.3, 1.27); // ~17°..73° — avoid axis-aligned
  const ridgeCenterX = ridgeRng.range(N * 0.3, N * 0.7);
  const ridgeCenterY = ridgeRng.range(N * 0.3, N * 0.7);
  const ridgeDx = Math.cos(ridgeAngle);
  const ridgeDy = Math.sin(ridgeAngle);
  const ridgeA = { x: ridgeCenterX - ridgeDx * N, y: ridgeCenterY - ridgeDy * N };
  const ridgeB = { x: ridgeCenterX + ridgeDx * N, y: ridgeCenterY + ridgeDy * N };
  const ridgeWidth = 35; // tiles — gentle falloff
  const ridgeHeight = 5.5; // meters added on the crest

  // Stream valley — a broad shallow trough through the central third.
  // (Fine-grained per-tile stream carving happens in water.js; this
  // layer gives the landscape a "valley" so water naturally flows.)
  const valleyRng = baseRng.fork(11);
  // Valley runs roughly perpendicular-ish to the ridge, biased to
  // cross the central third.
  const valleyStartX = valleyRng.range(N * 0.1, N * 0.4);
  const valleyStartY = valleyRng.range(N * 0.2, N * 0.5);
  const valleyEndX = valleyRng.range(N * 0.6, N * 0.9);
  const valleyEndY = valleyRng.range(N * 0.5, N * 0.8);
  const valleyWidth = 40;
  const valleyDepth = 2.5;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Base elevation from layered noise. Scale so the noise grid
      // wraps across the map a few times at each octave.
      const v1 = n1((x / N) * 8, (y / N) * 8);
      const v2 = n2((x / N) * 16, (y / N) * 16);
      const v3 = n3((x / N) * 32, (y / N) * 32);
      // Weights: base / medium / detail.
      let h = v1 * 6.0 + v2 * 2.5 + v3 * 1.0;

      // Ridge contribution: Gaussian-ish falloff from the line.
      const dRidge = distanceToLine(x, y, ridgeA.x, ridgeA.y, ridgeB.x, ridgeB.y);
      const ridgeFalloff = Math.exp(-(dRidge * dRidge) / (ridgeWidth * ridgeWidth));
      h += ridgeHeight * ridgeFalloff;

      // Valley contribution: subtract a Gaussian centred on the
      // segment. Creates a shallow trough along the valley path.
      const dValley = distanceToSegment(
        x, y,
        valleyStartX, valleyStartY,
        valleyEndX, valleyEndY
      );
      const valleyFalloff = Math.exp(-(dValley * dValley) / (valleyWidth * valleyWidth));
      h -= valleyDepth * valleyFalloff;

      // Clamp into design range so downstream consumers don't see
      // runaway values from overlapping features.
      if (h < HEIGHT_MIN) h = HEIGHT_MIN;
      if (h > HEIGHT_MAX) h = HEIGHT_MAX;

      out[y * N + x] = h;
    }
  }

  return out;
}
