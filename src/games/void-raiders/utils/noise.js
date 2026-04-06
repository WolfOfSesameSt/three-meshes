/**
 * Noise functions for procedural generation.
 * Seeded simplex-like noise + FBM for terrain.
 */

/**
 * Seeded PRNG — mulberry32.
 * @param {number} seed
 * @returns {function(): number} returns 0-1
 */
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── 2D value noise (fast, good enough for terrain) ─────────────

function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * 2D value noise, range ~0-1.
 */
export function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

/**
 * Fractal Brownian Motion — layered noise for terrain.
 * @param {number} x
 * @param {number} y
 * @param {number} octaves
 * @param {number} lacunarity - frequency multiplier per octave
 * @param {number} persistence - amplitude multiplier per octave
 * @returns {number} 0-1
 */
export function fbm(x, y, octaves = 6, lacunarity = 2.0, persistence = 0.45) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2(x * frequency, y * frequency);
    max += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / max;
}
