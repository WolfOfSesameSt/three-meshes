/**
 * Smoke test — the scaffold imports cleanly and exposes expected
 * constants. If this breaks, C0.1 is broken.
 */

import { describe, expect, it } from "vitest";
import {
  PALETTE,
  TILE_SIZE,
  MAP_TILES,
  SECONDS_PER_DAY,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  CAMERA_PITCH_DEG,
} from "../config.js";

describe("fairy-permaculture scaffold", () => {
  it("exposes the 11-color palette", () => {
    const colors = Object.keys(PALETTE);
    expect(colors).toContain("meadowGreen");
    expect(colors).toContain("honeyGold");
    expect(colors).toContain("compostRich");
    expect(colors.length).toBeGreaterThanOrEqual(11);
  });

  it("has sane world-scale constants", () => {
    expect(TILE_SIZE).toBe(3.0);
    expect(MAP_TILES).toBe(500);
  });

  it("has Zelda-pace 60s per in-game day", () => {
    expect(SECONDS_PER_DAY).toBe(60);
    expect(DAYS_PER_SEASON).toBe(30);
    expect(DAYS_PER_YEAR).toBe(120);
  });

  it("uses the isometric 45° camera", () => {
    expect(CAMERA_PITCH_DEG).toBe(45);
  });
});
