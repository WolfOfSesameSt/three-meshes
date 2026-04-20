/**
 * ingredients.js tests — table lookup + mixing math.
 */

import { describe, it, expect } from "vitest";
import {
  getIngredient,
  listIngredients,
  INGREDIENT_CATEGORIES,
  mixCN,
  mixMoisture,
  totalDryMass,
  resolveIngredient,
} from "./ingredients.js";

describe("getIngredient", () => {
  it("returns a copy of a known ingredient", () => {
    const grass = getIngredient("fresh-grass");
    expect(grass).toMatchObject({
      id: "fresh-grass",
      category: "greens",
    });
    expect(grass.cnRatio).toBeGreaterThan(0);
    expect(grass.moisturePct).toBeGreaterThan(0);
  });

  it("returns null for an unknown ingredient", () => {
    expect(getIngredient("unobtainium")).toBeNull();
  });

  it("returns a fresh copy each time (no aliasing)", () => {
    const a = getIngredient("fresh-grass");
    const b = getIngredient("fresh-grass");
    a.dryMassKg = 999;
    expect(b.dryMassKg).not.toBe(999);
  });
});

describe("listIngredients + INGREDIENT_CATEGORIES", () => {
  it("lists at least one ingredient per category from compost.json", () => {
    const all = listIngredients().map(getIngredient);
    for (const cat of INGREDIENT_CATEGORIES) {
      expect(all.some((i) => i.category === cat)).toBe(true);
    }
  });
});

describe("mixCN", () => {
  it("returns NaN for empty input", () => {
    expect(mixCN([])).toBeNaN();
    expect(mixCN(null)).toBeNaN();
  });

  it("returns the single ingredient's C:N when only one is present", () => {
    const cn = mixCN([{ id: "dry-leaves" }]);
    expect(cn).toBeCloseTo(getIngredient("dry-leaves").cnRatio, 5);
  });

  it("mixes 50/50 dry-leaves (60:1) + fresh-manure (18:1) → ~25-30:1", () => {
    // Equal dry mass, so result should sit roughly in hot-band.
    const cn = mixCN([
      { id: "dry-leaves",    dryMassKg: 20 },
      { id: "fresh-manure",  dryMassKg: 20 },
    ]);
    expect(cn).toBeGreaterThan(20);
    expect(cn).toBeLessThan(40);
  });

  it("weights heavier ingredient more", () => {
    const mostlyCarbon = mixCN([
      { id: "dry-leaves",   dryMassKg: 90 },
      { id: "fresh-manure", dryMassKg: 10 },
    ]);
    const mostlyNitrogen = mixCN([
      { id: "dry-leaves",   dryMassKg: 10 },
      { id: "fresh-manure", dryMassKg: 90 },
    ]);
    expect(mostlyCarbon).toBeGreaterThan(mostlyNitrogen);
  });

  it("returns Infinity when nitrogen is zero (pure carbon with infinite CN)", () => {
    // Craft a zero-nitrogen ingredient manually.
    const cn = mixCN([{ id: "synthetic-pure-C", cnRatio: Infinity, dryMassKg: 5, moisturePct: 0, category: "browns" }]);
    expect(cn).toBe(Infinity);
  });

  it("skips unknown ids gracefully", () => {
    const cn = mixCN([{ id: "unobtainium" }, { id: "fresh-grass" }]);
    expect(cn).toBeCloseTo(getIngredient("fresh-grass").cnRatio, 5);
  });
});

describe("mixMoisture", () => {
  it("returns NaN for empty input", () => {
    expect(mixMoisture([])).toBeNaN();
    expect(mixMoisture(null)).toBeNaN();
  });

  it("single-ingredient moisture matches the entry", () => {
    expect(mixMoisture([{ id: "dry-leaves" }])).toBeCloseTo(
      getIngredient("dry-leaves").moisturePct, 5
    );
  });

  it("50/50 of 75% + 15% moisture → 45% (mass-weighted average)", () => {
    const m = mixMoisture([
      { id: "fresh-grass", dryMassKg: 20, moisturePct: 75 },
      { id: "dry-leaves",  dryMassKg: 20, moisturePct: 15 },
    ]);
    expect(m).toBeCloseTo(45, 1);
  });

  it("dry-mass-weighted average correctly skews toward heavier side", () => {
    const m = mixMoisture([
      { id: "fresh-grass", dryMassKg: 80, moisturePct: 80 },
      { id: "dry-leaves",  dryMassKg: 20, moisturePct: 10 },
    ]);
    // 80*80 + 20*10 = 6400+200 = 6600 / 100 = 66
    expect(m).toBeCloseTo(66, 1);
  });
});

describe("totalDryMass", () => {
  it("sums dry masses across ingredients", () => {
    const m = totalDryMass([
      { id: "fresh-grass", dryMassKg: 20 },
      { id: "dry-leaves",  dryMassKg: 15 },
    ]);
    expect(m).toBe(35);
  });

  it("returns 0 for empty / null", () => {
    expect(totalDryMass(null)).toBe(0);
    expect(totalDryMass([])).toBe(0);
  });

  it("skips unknown ingredients", () => {
    expect(totalDryMass([{ id: "unobtainium" }])).toBe(0);
  });
});

describe("resolveIngredient", () => {
  it("accepts a bare id string", () => {
    expect(resolveIngredient("fresh-grass")).toMatchObject({ category: "greens" });
  });

  it("caller-provided dryMassKg overrides the table value", () => {
    const r = resolveIngredient({ id: "fresh-grass", dryMassKg: 5 });
    expect(r.dryMassKg).toBe(5);
  });

  it("returns null for unknown + untyped input", () => {
    expect(resolveIngredient(null)).toBeNull();
    expect(resolveIngredient("nope")).toBeNull();
    expect(resolveIngredient({ id: "nope" })).toBeNull();
  });

  it("passes a full record through unchanged", () => {
    const full = {
      id: "custom",
      category: "greens",
      dryMassKg: 10,
      cnRatio: 22,
      moisturePct: 55,
    };
    expect(resolveIngredient(full)).toBe(full);
  });
});
