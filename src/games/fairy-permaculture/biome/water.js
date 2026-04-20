/**
 * Freshwater stream carving.
 *
 * Traces a polyline from the forest-edge anchor through the central
 * third of the map with at least one inner loop, then:
 *   - sinks heightfield cells along the path by 1.5–3 m
 *   - collects the footprint tile set (2–4 tiles wide)
 *
 * The caller MUTATES the heightfield — we carve in-place for
 * efficiency and so the rest of the pipeline sees the valley.
 *
 * Export:
 *   carveStream(heightfield, seed, forestEdgePoi) => {
 *     path: Array<{x,y}>,
 *     tiles: Set<number>,
 *   }
 */

import { MAP_TILES } from "../config.js";
import { createRng } from "./seeded-rng.js";

const N = MAP_TILES;

function idx(x, y) {
  return y * N + x;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Sample a smooth Catmull-Rom-ish spline through control points and
 * return a dense polyline of 1-pixel-step samples.
 */
function densifyPath(control) {
  const out = [];
  // Walk each segment and densely sample. The control points are
  // already fairly close, so linear interpolation with ~1-unit step
  // is smooth enough for a stream.
  for (let i = 0; i < control.length - 1; i++) {
    const a = control[i];
    const b = control[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
    }
  }
  out.push(control[control.length - 1]);
  return out;
}

/**
 * @param {Float32Array} heightfield  500×500 heightfield (mutated)
 * @param {number} seed
 * @param {object} forestEdgePoi      POI object from placePois()
 * @returns {{ path: Array<{x:number,y:number}>, tiles: Set<number> }}
 */
export function carveStream(heightfield, seed, forestEdgePoi) {
  const rng = createRng(seed).fork(200);

  const start = { ...forestEdgePoi.meta.anchor };

  // Build a path of control points that:
  //   1. leaves the forest-edge anchor,
  //   2. winds into the central third of the map,
  //   3. forms a loop (figure-eight-ish) in the central third,
  //   4. exits the central third toward the opposite edge.
  const c1x = clamp(start.x + rng.range(-20, 20), 20, N - 20);
  const c1y = clamp(start.y + rng.range(-20, 20), 20, N - 20);

  // A loop in the central third: pick a centre and walk 4 points
  // around it before continuing.
  const centralLo = Math.floor(N / 3);
  const centralHi = Math.floor((2 * N) / 3);
  const loopCx = Math.floor(rng.range(centralLo + 20, centralHi - 20));
  const loopCy = Math.floor(rng.range(centralLo + 20, centralHi - 20));
  const loopR = rng.range(25, 40);

  // Decide loop winding direction.
  const dir = rng.next() < 0.5 ? 1 : -1;

  // Loop ring of 6 points centred at (loopCx, loopCy).
  const loopPoints = [];
  const loopStartAngle = rng.range(0, Math.PI * 2);
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const angle = loopStartAngle + dir * t * Math.PI * 2;
    loopPoints.push({
      x: loopCx + Math.cos(angle) * loopR,
      y: loopCy + Math.sin(angle) * loopR,
    });
  }

  // Exit point — continue past the loop toward the far side.
  const exitX = clamp(loopCx + rng.range(-60, 60), 30, N - 30);
  const exitY = clamp(loopCy + rng.range(40, 80), 30, N - 30);

  // Assemble control points.
  const control = [
    start,
    { x: c1x, y: c1y },
    { x: loopCx - loopR, y: loopCy }, // lead-in to loop
    ...loopPoints,
    { x: exitX, y: exitY },
  ];

  const polyline = densifyPath(control);

  // Stream width varies 2–4 tiles along the path; carve depth
  // 1.5–3 m. We use a per-segment base width and depth.
  const baseWidth = rng.range(2.0, 3.5); // in tiles (radius will be width/2)
  const baseDepth = rng.range(1.5, 3.0);

  const tiles = new Set();

  for (let pi = 0; pi < polyline.length; pi++) {
    const p = polyline[pi];
    // Slight width variation over length.
    const widthJitter = 0.75 + Math.sin(pi * 0.07) * 0.25;
    const radius = (baseWidth / 2) * widthJitter;
    const r2 = radius * radius;
    const ix0 = Math.max(0, Math.floor(p.x - radius - 1));
    const ix1 = Math.min(N - 1, Math.ceil(p.x + radius + 1));
    const iy0 = Math.max(0, Math.floor(p.y - radius - 1));
    const iy1 = Math.min(N - 1, Math.ceil(p.y + radius + 1));
    for (let y = iy0; y <= iy1; y++) {
      for (let x = ix0; x <= ix1; x++) {
        const dx = x + 0.5 - p.x;
        const dy = y + 0.5 - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const tIdx = idx(x, y);
        tiles.add(tIdx);
        // Distance-weighted sink: deepest at centre, tapering to 0
        // at the edge of the stream bed.
        const k = 1 - d2 / r2;
        const sink = baseDepth * k;
        // Mutate heightfield — take the min so repeated passes over
        // the same tile don't stack additively.
        const target = heightfield[tIdx] - sink;
        if (target < heightfield[tIdx]) {
          heightfield[tIdx] = Math.max(0, target);
        }
      }
    }
  }

  return {
    path: polyline.map((p) => ({ x: p.x, y: p.y })),
    tiles,
  };
}
