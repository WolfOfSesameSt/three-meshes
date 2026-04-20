import { describe, it, expect } from "vitest";
import { createRng } from "./seeded-rng.js";

describe("seeded-rng", () => {
  it("same seed → identical first 1000 values", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = createRng(42);
    const b = createRng(43);
    let diff = 0;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) diff++;
    }
    expect(diff).toBeGreaterThan(90);
  });

  it("next() returns values in [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n) returns integers in [0, n)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it("range(a, b) returns values in [a, b)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it("choice returns elements from the array", () => {
    const r = createRng(7);
    const arr = ["a", "b", "c", "d", "e"];
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      seen.add(r.choice(arr));
    }
    expect(seen.size).toBe(5);
  });

  it("handles zero seed without locking up", () => {
    const r = createRng(0);
    const v1 = r.next();
    const v2 = r.next();
    expect(v1).not.toBe(v2);
  });

  it("fork() produces a different but deterministic stream", () => {
    const a = createRng(42).fork(100);
    const b = createRng(42).fork(100);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
    const c = createRng(42).fork(101);
    // Forking with a different tag should diverge quickly.
    let diff = 0;
    const a2 = createRng(42).fork(100);
    for (let i = 0; i < 20; i++) {
      if (a2.next() !== c.next()) diff++;
    }
    expect(diff).toBeGreaterThan(10);
  });
});
