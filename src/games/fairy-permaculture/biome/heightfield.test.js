import { describe, it, expect } from "vitest";
import { generateHeightfield, HEIGHT_MIN, HEIGHT_MAX } from "./heightfield.js";
import { MAP_TILES } from "../config.js";

/**
 * FNV-1a-style 32-bit hash over a Float32Array buffer. Used to
 * verify bit-identical output across runs.
 */
function checksum(buffer) {
  const bytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

describe("heightfield", () => {
  it("produces the right size array", () => {
    const hf = generateHeightfield(42);
    expect(hf).toBeInstanceOf(Float32Array);
    expect(hf.length).toBe(MAP_TILES * MAP_TILES);
  });

  it("same seed → bit-identical checksum", () => {
    const a = generateHeightfield(42);
    const b = generateHeightfield(42);
    expect(checksum(a)).toBe(checksum(b));
    // Spot-check a few sample indices too.
    for (let i = 0; i < 100; i++) {
      const idx = Math.floor((i * 2503) % a.length);
      expect(a[idx]).toBe(b[idx]);
    }
  });

  it("different seeds → different checksums", () => {
    const a = generateHeightfield(42);
    const b = generateHeightfield(7);
    expect(checksum(a)).not.toBe(checksum(b));
  });

  it("heights stay within [HEIGHT_MIN, HEIGHT_MAX]", () => {
    const hf = generateHeightfield(42);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < hf.length; i++) {
      if (hf[i] < min) min = hf[i];
      if (hf[i] > max) max = hf[i];
    }
    expect(min).toBeGreaterThanOrEqual(HEIGHT_MIN);
    expect(max).toBeLessThanOrEqual(HEIGHT_MAX);
    // Sanity: the map should actually have relief.
    expect(max - min).toBeGreaterThan(3);
  });

  it("has a valley — some tiles are substantially lower than the map mean", () => {
    const hf = generateHeightfield(42);
    let sum = 0;
    let min = Infinity;
    for (let i = 0; i < hf.length; i++) {
      sum += hf[i];
      if (hf[i] < min) min = hf[i];
    }
    const mean = sum / hf.length;
    // Valley should push at least one tile at least ~2m below mean.
    expect(mean - min).toBeGreaterThan(2);
  });

  it("has a ridge — max height is meaningfully above the mean", () => {
    const hf = generateHeightfield(42);
    let sum = 0;
    let max = -Infinity;
    for (let i = 0; i < hf.length; i++) {
      sum += hf[i];
      if (hf[i] > max) max = hf[i];
    }
    const mean = sum / hf.length;
    expect(max - mean).toBeGreaterThan(2);
  });
});
