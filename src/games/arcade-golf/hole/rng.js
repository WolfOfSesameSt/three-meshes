export function createRng(seed) {
  let state = hashSeed(String(seed));
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function range(rng, min, max) {
  return min + (max - min) * rng();
}

export function intRange(rng, min, maxInclusive) {
  return Math.floor(range(rng, min, maxInclusive + 1));
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
