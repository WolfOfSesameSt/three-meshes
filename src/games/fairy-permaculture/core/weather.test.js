import { describe, it, expect } from "vitest";
import { createRng, rollDay, createWeatherListener } from "./weather.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const biome = JSON.parse(
  readFileSync(join(HERE, "../data/biomes/bc-coastal.json"), "utf8")
);

describe("createRng", () => {
  it("same seed → identical sequence", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 1000 }, () => a());
    const seqB = Array.from({ length: 1000 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds → different sequences", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
  });

  it("values are in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("rollDay", () => {
  it("summer has low rain chance per config", () => {
    // With 0.15 probability, 1000 summer rolls should give ~150 rain days
    const rng = createRng(99);
    let rainDays = 0;
    for (let i = 0; i < 1000; i++) {
      const w = rollDay(i, "summer", biome, rng);
      if (w.rained) rainDays++;
    }
    expect(rainDays).toBeGreaterThan(50);
    expect(rainDays).toBeLessThan(250);
  });

  it("winter has high rain chance per config", () => {
    const rng = createRng(99);
    let rainDays = 0;
    for (let i = 0; i < 1000; i++) {
      const w = rollDay(i, "winter", biome, rng);
      if (w.rained) rainDays++;
    }
    expect(rainDays).toBeGreaterThan(600);
  });

  it("temperature is in a plausible BC range", () => {
    const rng = createRng(42);
    for (let i = 0; i < 500; i++) {
      const w = rollDay(i, "summer", biome, rng);
      expect(w.tempC).toBeGreaterThan(-5);
      expect(w.tempC).toBeLessThan(40);
    }
  });
});

describe("weather listener streak tracking", () => {
  it("tracks consecutive rainless days in summer (drought pressure)", () => {
    const listener = createWeatherListener(biome, 123);
    let maxRainless = 0;
    for (let i = 0; i < 120; i++) {
      const env = { day: i, seasonName: "summer" };
      listener(env);
      if (env.rainlessDaysStreak > maxRainless) maxRainless = env.rainlessDaysStreak;
    }
    expect(maxRainless).toBeGreaterThan(1); // some streaks emerge
  });

  it("determinism: same seed gives identical streaks", () => {
    const listener1 = createWeatherListener(biome, 42);
    const listener2 = createWeatherListener(biome, 42);
    const sequence1 = [];
    const sequence2 = [];
    for (let i = 0; i < 365; i++) {
      const env1 = { day: i, seasonName: "spring" };
      const env2 = { day: i, seasonName: "spring" };
      listener1(env1);
      listener2(env2);
      sequence1.push(env1.rainMm);
      sequence2.push(env2.rainMm);
    }
    expect(sequence1).toEqual(sequence2);
  });
});
