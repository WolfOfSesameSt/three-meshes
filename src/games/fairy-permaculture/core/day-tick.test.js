import { describe, it, expect } from "vitest";
import {
  createScheduler,
  advanceDay,
  setSpeed,
  onDay,
  onSeason,
  onYear,
  currentSeasonName,
  serializeScheduler,
  hydrateScheduler,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
} from "./day-tick.js";

describe("scheduler basics", () => {
  it("starts at day 0 / spring / year 0", () => {
    const s = createScheduler();
    expect(s.day).toBe(0);
    expect(s.year).toBe(0);
    expect(currentSeasonName(s)).toBe("spring");
  });

  it("advances day-by-day", () => {
    const s = createScheduler();
    advanceDay(s);
    expect(s.day).toBe(1);
    advanceDay(s);
    expect(s.day).toBe(2);
  });

  it("rolls over into summer after 30 days", () => {
    const s = createScheduler();
    for (let i = 0; i < DAYS_PER_SEASON; i++) advanceDay(s);
    expect(currentSeasonName(s)).toBe("summer");
  });

  it("rolls into year 1 after 120 days", () => {
    const s = createScheduler();
    for (let i = 0; i < DAYS_PER_YEAR; i++) advanceDay(s);
    expect(s.year).toBe(1);
    expect(currentSeasonName(s)).toBe("spring");
  });
});

describe("listeners", () => {
  it("fires per-day callbacks with full env", () => {
    const s = createScheduler();
    const calls = [];
    onDay(s, (env) => calls.push(env));
    advanceDay(s, { rainMm: 3, tempC: 15 });
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ day: 0, seasonName: "spring", rainMm: 3 });
  });

  it("fires per-season callback at season boundary", () => {
    const s = createScheduler();
    const seasons = [];
    onSeason(s, (env) => seasons.push(env.seasonName));
    for (let i = 0; i < DAYS_PER_SEASON; i++) advanceDay(s);
    expect(seasons).toEqual(["summer"]);
  });

  it("fires per-year callback at year boundary", () => {
    const s = createScheduler();
    const years = [];
    onYear(s, (env) => years.push(env.year));
    for (let i = 0; i < DAYS_PER_YEAR; i++) advanceDay(s);
    expect(years).toEqual([1]);
  });

  it("unsubscribes cleanly", () => {
    const s = createScheduler();
    let c = 0;
    const off = onDay(s, () => c++);
    advanceDay(s);
    off();
    advanceDay(s);
    expect(c).toBe(1);
  });
});

describe("speed controls", () => {
  it("accepts 0, 1, 2, 4", () => {
    const s = createScheduler();
    setSpeed(s, 0);
    setSpeed(s, 4);
    expect(s.speed).toBe(4);
  });

  it("rejects other values", () => {
    const s = createScheduler();
    expect(() => setSpeed(s, 3)).toThrow();
    expect(() => setSpeed(s, -1)).toThrow();
  });
});

describe("determinism + save/load", () => {
  it("10 000 ticks produce expected date", () => {
    const s = createScheduler();
    for (let i = 0; i < 10000; i++) advanceDay(s);
    expect(s.day).toBe(10000);
    expect(s.year).toBe(Math.floor(10000 / DAYS_PER_YEAR));
  });

  it("serialize/hydrate round-trips", () => {
    const s1 = createScheduler();
    for (let i = 0; i < 200; i++) advanceDay(s1);
    setSpeed(s1, 4);
    const saved = serializeScheduler(s1);

    const s2 = createScheduler();
    hydrateScheduler(s2, saved);
    expect(s2.day).toBe(s1.day);
    expect(s2.seasonIndex).toBe(s1.seasonIndex);
    expect(s2.year).toBe(s1.year);
    expect(s2.speed).toBe(s1.speed);
  });
});
