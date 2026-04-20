/**
 * POI placement for the BC coastal biome.
 *
 * Reads the `placement_rule` strings from bc-coastal.json and lays
 * the four always-present POIs onto the heightfield:
 *   - old-growth-forest-edge:  one map edge (N/E/W, never S), 60–100 tiles deep
 *   - freshwater-stream:       placeholder entry — actual polyline carved in water.js
 *   - rocky-outcrop:           8–15 tiles on higher ground than the homestead
 *   - abandoned-farmstead-ruin: 25–60 tiles, distinct from the starting homestead
 *
 * Also emits the starting-homestead tile set so downstream systems
 * (soil, renderer, camera target) can find it.
 *
 * Export: `placePois(heightfield, seed) => Array<POI>` where POI is
 *   { kind, tiles: Set<number>, meta }
 *   - `meta` carries POI-specific placement data (e.g. forest edge
 *     direction, outcrop centre) needed by water.js and the renderer.
 */

import bcCoastal from "../data/biomes/bc-coastal.json" with { type: "json" };
import { MAP_TILES } from "../config.js";
import { createRng } from "./seeded-rng.js";

const N = MAP_TILES;

// Look up POI config by kind so placement ranges track bc-coastal.json.
function poiRange(kind) {
  const entry = bcCoastal.pois.find((p) => p.kind === kind);
  if (!entry) throw new Error(`bc-coastal.json missing POI kind: ${kind}`);
  return entry.footprint_tiles_range;
}

// Kinds that this module places in the main pass (stream is placed
// by water.js on top of the heightfield once forest-edge is known).
const STREAM_KIND = "freshwater-stream";

function idx(x, y) {
  return y * N + x;
}

function mean(arr, fn) {
  let s = 0;
  for (const a of arr) s += fn(a);
  return arr.length === 0 ? 0 : s / arr.length;
}

/**
 * Forest edge: pick N, E, or W (never S). Fill a strip of depth
 * 60–100 tiles along the chosen edge.
 */
function placeForestEdge(rng) {
  const edges = ["N", "E", "W"];
  const edge = edges[rng.int(edges.length)];
  const depth = Math.floor(rng.range(60, 100 + 1));
  const tiles = new Set();

  if (edge === "N") {
    for (let y = 0; y < depth; y++)
      for (let x = 0; x < N; x++) tiles.add(idx(x, y));
  } else if (edge === "W") {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < depth; x++) tiles.add(idx(x, y));
  } else {
    // E
    for (let y = 0; y < N; y++)
      for (let x = N - depth; x < N; x++) tiles.add(idx(x, y));
  }

  // Anchor point near the inner boundary of the forest — water.js
  // uses this as the stream origin.
  let anchor;
  if (edge === "N") anchor = { x: Math.floor(N / 2), y: depth - 1 };
  else if (edge === "W") anchor = { x: depth - 1, y: Math.floor(N / 2) };
  else anchor = { x: N - depth, y: Math.floor(N / 2) };

  return {
    kind: "old-growth-forest-edge",
    tiles,
    meta: { edge, depth, anchor },
  };
}

/**
 * Starting homestead: a 20×20 flat pad near the south edge,
 * horizontally centred. Player-facing POI but the config marks it
 * separately from the four biome POIs.
 */
function placeHomestead(rng) {
  const size = bcCoastal.starting_homestead.size_tiles;
  // Place homestead a short distance from the south edge, with small
  // horizontal jitter.
  const marginY = 30;
  const cx = Math.floor(N / 2 + rng.range(-N * 0.08, N * 0.08));
  const cy = N - marginY - Math.floor(size / 2);
  const x0 = cx - Math.floor(size / 2);
  const y0 = cy - Math.floor(size / 2);
  const tiles = new Set();
  for (let y = y0; y < y0 + size; y++)
    for (let x = x0; x < x0 + size; x++) tiles.add(idx(x, y));
  return {
    kind: "starting-homestead",
    tiles,
    meta: { center: { x: cx, y: cy }, size },
  };
}

/**
 * Rocky outcrop: 8–15 tiles on higher ground than the homestead.
 * Reject samples that are on the homestead or forest-edge strip.
 */
function placeOutcrop(rng, heightfield, homestead, forestEdge) {
  const [lo, hi] = poiRange("rocky-outcrop");
  const footprint = Math.floor(rng.range(lo, hi + 1));
  const homesteadAvgH = mean(
    [...homestead.tiles],
    (i) => heightfield[i]
  );

  // Find a high-ground candidate by sampling and picking the best
  // one that clears the homestead height and avoids other POIs.
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const cx = rng.int(N);
    const cy = rng.int(N);
    const i = idx(cx, cy);
    if (homestead.tiles.has(i)) continue;
    if (forestEdge.tiles.has(i)) continue;
    const h = heightfield[i];
    // Require outcrop to sit above the homestead by a margin.
    if (h <= homesteadAvgH + 1.5) continue;
    // Keep the highest candidate found so far.
    if (!best || h > best.h) best = { x: cx, y: cy, h };
    // Early exit once we've found a clearly higher point.
    if (best && best.h >= homesteadAvgH + 3.0 && attempt > 80) break;
  }

  // Fallback — global max sweep if sampling didn't find one.
  if (!best) {
    let maxH = -Infinity;
    let mx = 0;
    let my = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        if (homestead.tiles.has(i)) continue;
        if (forestEdge.tiles.has(i)) continue;
        const h = heightfield[i];
        if (h > maxH) {
          maxH = h;
          mx = x;
          my = y;
        }
      }
    }
    best = { x: mx, y: my, h: maxH };
  }

  // Grow a blob of `footprint` tiles around the chosen centre.
  const tiles = new Set();
  const radius = Math.max(1, Math.ceil(Math.sqrt(footprint / Math.PI)));
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const x = best.x + dx;
      const y = best.y + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      if (dx * dx + dy * dy > (radius + 0.3) * (radius + 0.3)) continue;
      tiles.add(idx(x, y));
      if (tiles.size >= footprint) break;
    }
    if (tiles.size >= footprint) break;
  }

  return {
    kind: "rocky-outcrop",
    tiles,
    meta: { center: { x: best.x, y: best.y }, height: best.h },
  };
}

/**
 * Ruin: 25–60 tiles; must be distinct from the homestead and not
 * inside the forest-edge strip or on the outcrop.
 */
function placeRuin(rng, homestead, forestEdge, outcrop) {
  const [lo, hi] = poiRange("abandoned-farmstead-ruin");
  const footprint = Math.floor(rng.range(lo, hi + 1));
  const minDistFromHomestead = 40;
  let center = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const cx = rng.int(N);
    const cy = rng.int(N);
    const i = idx(cx, cy);
    if (homestead.tiles.has(i)) continue;
    if (forestEdge.tiles.has(i)) continue;
    if (outcrop.tiles.has(i)) continue;
    const dx = cx - homestead.meta.center.x;
    const dy = cy - homestead.meta.center.y;
    if (Math.hypot(dx, dy) < minDistFromHomestead) continue;
    // Keep a healthy border so the blob fits.
    if (cx < 10 || cy < 10 || cx > N - 10 || cy > N - 10) continue;
    center = { x: cx, y: cy };
    break;
  }
  if (!center) {
    center = { x: Math.floor(N * 0.3), y: Math.floor(N * 0.3) };
  }

  const tiles = new Set();
  const radius = Math.max(2, Math.ceil(Math.sqrt(footprint / Math.PI)));
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      if (dx * dx + dy * dy > (radius + 0.3) * (radius + 0.3)) continue;
      tiles.add(idx(x, y));
      if (tiles.size >= footprint) break;
    }
    if (tiles.size >= footprint) break;
  }

  return {
    kind: "abandoned-farmstead-ruin",
    tiles,
    meta: { center },
  };
}

/**
 * @param {Float32Array} heightfield
 * @param {number} seed
 * @returns {Array<{ kind: string, tiles: Set<number>, meta: object }>}
 */
export function placePois(heightfield, seed) {
  const rng = createRng(seed);
  // Dedicated streams per POI so adding one later doesn't shift
  // others.
  const forestRng = rng.fork(100);
  const homesteadRng = rng.fork(101);
  const outcropRng = rng.fork(102);
  const ruinRng = rng.fork(103);

  const forestEdge = placeForestEdge(forestRng);
  const homestead = placeHomestead(homesteadRng);
  const outcrop = placeOutcrop(outcropRng, heightfield, homestead, forestEdge);
  const ruin = placeRuin(ruinRng, homestead, forestEdge, outcrop);

  // Return the 4 biome POIs + starting homestead in a stable order
  // so downstream consumers can rely on positions.
  return [forestEdge, homestead, outcrop, ruin];
}

export function findPoi(pois, kind) {
  return pois.find((p) => p.kind === kind);
}

export { STREAM_KIND, bcCoastal };
