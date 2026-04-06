import { describe, it, expect, beforeEach } from "vitest";
import { gameState } from "./game-state.js";
import { canCraft, craft, getAvailableRecipes } from "./crafting.js";
import { ALL_RECIPES, RECIPE_MAP, validateRecipes, detectCycles } from "./recipes.js";
import { RESOURCE_MAP } from "./resources.js";

// ─── Reset game state before each test ─────────────────────────

function resetResources(overrides = {}) {
  gameState.resources = {
    "iron-ore": 0,
    "copper-ore": 0,
    "titanium-ore": 0,
    "crystal-shard": 0,
    "quartz-crystal": 0,
    "plasma-core": 0,
    "exotic-matter": 0,
    "organic-matter": 0,
    "bio-compound": 0,
    "silicon-dust": 0,
    "rare-earth": 0,
    "salvage-parts": 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetResources();
});

// ─── Recipe Validation ─────────────────────────────────────────

describe("recipe validation", () => {
  it("all recipe inputs reference valid resources", () => {
    const errors = validateRecipes();
    expect(errors).toEqual([]);
  });

  it("all recipe outputs reference valid resources", () => {
    for (const recipe of ALL_RECIPES) {
      expect(RESOURCE_MAP.has(recipe.output.resource)).toBe(true);
    }
  });

  it("all recipes have unique ids", () => {
    const ids = ALL_RECIPES.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all recipes have positive input amounts", () => {
    for (const recipe of ALL_RECIPES) {
      for (const input of recipe.inputs) {
        expect(input.amount).toBeGreaterThan(0);
      }
    }
  });

  it("all recipes have positive output amounts", () => {
    for (const recipe of ALL_RECIPES) {
      expect(recipe.output.amount).toBeGreaterThan(0);
    }
  });

  it("all recipes have positive craft time", () => {
    for (const recipe of ALL_RECIPES) {
      expect(recipe.craftTime).toBeGreaterThan(0);
    }
  });

  it("no circular recipe dependencies", () => {
    const cycles = detectCycles();
    expect(cycles).toEqual([]);
  });
});

// ─── canCraft ──────────────────────────────────────────────────

describe("canCraft", () => {
  it("returns false when player has no resources", () => {
    expect(canCraft("craft-steel-plate")).toBe(false);
  });

  it("returns true when player has exact inputs", () => {
    resetResources({ "iron-ore": 2 });
    expect(canCraft("craft-steel-plate")).toBe(true);
  });

  it("returns true when player has more than enough inputs", () => {
    resetResources({ "iron-ore": 999 });
    expect(canCraft("craft-steel-plate")).toBe(true);
  });

  it("returns false when one input is missing", () => {
    resetResources({ "titanium-ore": 1 }); // missing copper-ore
    expect(canCraft("craft-alloy-composite")).toBe(false);
  });

  it("returns false for an invalid recipe id", () => {
    expect(canCraft("nonexistent-recipe")).toBe(false);
  });

  it("handles multi-input recipes correctly", () => {
    resetResources({ "crystal-shard": 2, "plasma-core": 1 });
    expect(canCraft("craft-energy-cell")).toBe(true);

    resetResources({ "crystal-shard": 1, "plasma-core": 1 }); // not enough crystal
    expect(canCraft("craft-energy-cell")).toBe(false);
  });
});

// ─── craft ─────���───────────────────────────────────────────────

describe("craft", () => {
  it("deducts inputs and adds output", () => {
    resetResources({ "iron-ore": 10 });
    const result = craft("craft-steel-plate");

    expect(result).toBe(true);
    expect(gameState.resources["iron-ore"]).toBe(8); // 10 - 2
    expect(gameState.resources["steel-plate"]).toBe(1);
  });

  it("returns false and does not modify state when inputs insufficient", () => {
    resetResources({ "iron-ore": 1 });
    const result = craft("craft-steel-plate");

    expect(result).toBe(false);
    expect(gameState.resources["iron-ore"]).toBe(1); // unchanged
    expect(gameState.resources["steel-plate"] || 0).toBe(0);
  });

  it("returns false for an invalid recipe id", () => {
    expect(craft("nonexistent")).toBe(false);
  });

  it("crafts multi-input recipe correctly", () => {
    resetResources({ "titanium-ore": 3, "copper-ore": 3 });
    const result = craft("craft-alloy-composite");

    expect(result).toBe(true);
    expect(gameState.resources["titanium-ore"]).toBe(2);
    expect(gameState.resources["copper-ore"]).toBe(2);
    expect(gameState.resources["alloy-composite"]).toBe(1);
  });

  it("can craft multiple times in sequence", () => {
    resetResources({ "iron-ore": 6 });
    craft("craft-steel-plate");
    craft("craft-steel-plate");
    craft("craft-steel-plate");

    expect(gameState.resources["iron-ore"]).toBe(0);
    expect(gameState.resources["steel-plate"]).toBe(3);
  });

  it("crafts advanced component from refined inputs", () => {
    // Provide refined components directly
    gameState.resources["energy-cell"] = 2;
    gameState.resources["alloy-composite"] = 1;

    const result = craft("craft-shield-capacitor");
    expect(result).toBe(true);
    expect(gameState.resources["energy-cell"]).toBe(0);
    expect(gameState.resources["alloy-composite"]).toBe(0);
    expect(gameState.resources["shield-capacitor"]).toBe(1);
  });
});

// ─── getAvailableRecipes ───────────────────────────────────────

describe("getAvailableRecipes", () => {
  it("returns empty array when player has no resources", () => {
    const available = getAvailableRecipes();
    expect(available).toEqual([]);
  });

  it("returns only recipes player can afford", () => {
    resetResources({ "iron-ore": 2 }); // only enough for steel-plate
    const available = getAvailableRecipes();

    expect(available.length).toBe(1);
    expect(available[0].id).toBe("craft-steel-plate");
  });

  it("returns multiple recipes when player has varied resources", () => {
    resetResources({
      "iron-ore": 10,
      "titanium-ore": 5,
      "copper-ore": 5,
      "crystal-shard": 10,
      "plasma-core": 5,
      "silicon-dust": 10,
      "organic-matter": 10,
      "bio-compound": 5,
    });
    const available = getAvailableRecipes();

    // Should include at least: steel-plate, alloy-composite, energy-cell, circuit-board, bio-gel
    const ids = available.map((r) => r.id);
    expect(ids).toContain("craft-steel-plate");
    expect(ids).toContain("craft-alloy-composite");
    expect(ids).toContain("craft-energy-cell");
    expect(ids).toContain("craft-circuit-board");
    expect(ids).toContain("craft-bio-gel");
  });

  it("includes advanced recipes when refined components are available", () => {
    gameState.resources["steel-plate"] = 10;
    gameState.resources["alloy-composite"] = 5;

    const available = getAvailableRecipes();
    const ids = available.map((r) => r.id);
    expect(ids).toContain("craft-hull-armor");
  });

  it("filters out recipes as resources are spent", () => {
    resetResources({ "iron-ore": 2 });
    expect(getAvailableRecipes().length).toBe(1);

    craft("craft-steel-plate"); // spends all iron-ore
    expect(getAvailableRecipes().length).toBeGreaterThanOrEqual(0);
    // steel-plate recipe should no longer be affordable
    const ids = getAvailableRecipes().map((r) => r.id);
    expect(ids).not.toContain("craft-steel-plate");
  });
});
