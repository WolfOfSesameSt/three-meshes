/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * Bit-reproducible across platforms — only uses Math.imul and
 * unsigned right-shift. Two `createRng(seed)` calls with the same
 * seed produce identical sequences.
 */

/**
 * @param {number} seed  Any 32-bit integer (negatives/overflows are coerced).
 * @returns {{
 *   next: () => number,     // [0, 1)
 *   int: (n: number) => number,           // [0, n) integer
 *   range: (a: number, b: number) => number, // [a, b) float
 *   choice: <T>(arr: T[]) => T,
 *   fork: (tag: number) => object,
 * }}
 */
export function createRng(seed) {
  // Coerce to unsigned 32-bit.
  let state = (seed | 0) >>> 0;
  if (state === 0) state = 0x9e3779b9; // avoid degenerate all-zero state

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(n) {
    return Math.floor(next() * n);
  }

  function range(a, b) {
    return a + (b - a) * next();
  }

  function choice(arr) {
    return arr[int(arr.length)];
  }

  /**
   * Fork a new independent RNG stream tagged with an integer.
   * Use when a sub-system wants its own deterministic sequence that
   * doesn't depend on how many `next()` calls other systems made.
   */
  function fork(tag) {
    // Mix tag into current state deterministically.
    const forkedSeed = (state ^ Math.imul(tag | 0, 0x9e3779b9)) >>> 0;
    return createRng(forkedSeed);
  }

  return { next, int, range, choice, fork };
}
