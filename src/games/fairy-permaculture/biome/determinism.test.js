import { describe, it, expect } from "vitest";
import { generateBiome } from "./index.js";

/**
 * Stable stringification that handles Float32Array + Set cleanly.
 */
function serializeBiome(b) {
  function ser(v) {
    if (v instanceof Float32Array) {
      // Hash byte-by-byte so the string stays short.
      const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      let h1 = 0x811c9dc5;
      let h2 = 0xcbf29ce4;
      for (let i = 0; i < bytes.length; i++) {
        h1 ^= bytes[i];
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 ^= bytes[i];
        h2 = Math.imul(h2, 0x100000001b3) >>> 0;
      }
      return `F32[${v.length}]#${h1.toString(16)}${h2.toString(16)}`;
    }
    if (v instanceof Set) {
      return `Set[${[...v].sort((a, b) => a - b).join(",")}]`;
    }
    if (Array.isArray(v)) return v.map(ser);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = ser(v[k]);
      return out;
    }
    return v;
  }
  return JSON.stringify(ser(b));
}

describe("determinism — generateBiome", () => {
  it("generateBiome(42) run twice produces byte-identical outputs", () => {
    const a = generateBiome(42);
    const b = generateBiome(42);
    expect(serializeBiome(a)).toBe(serializeBiome(b));
  });

  it("different seeds produce different outputs", () => {
    const a = generateBiome(42);
    const b = generateBiome(43);
    expect(serializeBiome(a)).not.toBe(serializeBiome(b));
  });

  it("carries expected top-level shape", () => {
    const b = generateBiome(42);
    expect(b.heightfield).toBeInstanceOf(Float32Array);
    expect(b.soilOm).toBeInstanceOf(Float32Array);
    expect(Array.isArray(b.pois)).toBe(true);
    expect(b.stream).toBeTruthy();
    expect(Array.isArray(b.stream.path)).toBe(true);
    expect(b.stream.tiles).toBeInstanceOf(Set);
  });
});
