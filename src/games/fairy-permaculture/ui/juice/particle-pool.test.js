/**
 * Particle pool — allocation mechanics (no leaks, respects cap).
 */

import { describe, it, expect, vi } from "vitest";

// We can't really test THREE rendering in unit tests, but we can
// verify the slot bookkeeping is correct. Use a minimal scene stub.
const sceneStub = { add: vi.fn() };

const { ParticlePool } = await import("./particle-pool.js");

describe("ParticlePool bookkeeping", () => {
  it("starts with zero active slots", () => {
    const p = new ParticlePool(sceneStub, { capacity: 16 });
    expect(p.activeCount).toBe(0);
  });

  it("burst acquires up to `count` slots", () => {
    const p = new ParticlePool(sceneStub, { capacity: 32 });
    p.burst({ x: 0, y: 0, z: 0 }, 10);
    expect(p.activeCount).toBe(10);
  });

  it("oversized burst drops excess silently", () => {
    const p = new ParticlePool(sceneStub, { capacity: 8 });
    p.burst({ x: 0, y: 0, z: 0 }, 50);
    expect(p.activeCount).toBe(8);
  });

  it("releases slots after lifetime expires", () => {
    const p = new ParticlePool(sceneStub, { capacity: 8 });
    p.burst({ x: 0, y: 0, z: 0 }, 5, { lifetime: 0.1 });
    expect(p.activeCount).toBe(5);
    // Advance well past lifetime
    p.update(0.2);
    expect(p.activeCount).toBe(0);
  });

  it("no leaks after 100 burst/expire cycles", () => {
    const p = new ParticlePool(sceneStub, { capacity: 64 });
    for (let i = 0; i < 100; i++) {
      p.burst({ x: 0, y: 0, z: 0 }, 10, { lifetime: 0.05 });
      p.update(0.1);
    }
    expect(p.activeCount).toBe(0);
  });
});
