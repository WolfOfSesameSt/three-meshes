/**
 * Crafting Recipes — combine resources into higher-tier components.
 *
 * Each recipe:
 *   id         unique kebab-case identifier
 *   name       display name
 *   inputs     array of { resource, amount }
 *   output     { resource, amount }
 *   craftTime  seconds to complete (used for future crafting queues)
 *
 * All input/output resource IDs must exist in resources.js.
 */

import { RESOURCE_MAP } from "./resources.js";

const RECIPES = [
  // ─── Refined Components ─────────────────────────────────────
  {
    id: "craft-steel-plate",
    name: "Forge Steel Plate",
    inputs: [{ resource: "iron-ore", amount: 2 }],
    output: { resource: "steel-plate", amount: 1 },
    craftTime: 3,
  },
  {
    id: "craft-alloy-composite",
    name: "Alloy Composite",
    inputs: [
      { resource: "titanium-ore", amount: 1 },
      { resource: "copper-ore", amount: 1 },
    ],
    output: { resource: "alloy-composite", amount: 1 },
    craftTime: 5,
  },
  {
    id: "craft-energy-cell",
    name: "Energy Cell",
    inputs: [
      { resource: "crystal-shard", amount: 2 },
      { resource: "plasma-core", amount: 1 },
    ],
    output: { resource: "energy-cell", amount: 1 },
    craftTime: 6,
  },
  {
    id: "craft-circuit-board",
    name: "Circuit Board",
    inputs: [
      { resource: "silicon-dust", amount: 2 },
      { resource: "copper-ore", amount: 1 },
    ],
    output: { resource: "circuit-board", amount: 1 },
    craftTime: 4,
  },
  {
    id: "craft-bio-gel",
    name: "Bio-Gel",
    inputs: [
      { resource: "organic-matter", amount: 2 },
      { resource: "bio-compound", amount: 1 },
    ],
    output: { resource: "bio-gel", amount: 1 },
    craftTime: 4,
  },

  // ─── Advanced Components ────────────────────────────────────
  {
    id: "craft-shield-capacitor",
    name: "Shield Capacitor",
    inputs: [
      { resource: "energy-cell", amount: 2 },
      { resource: "alloy-composite", amount: 1 },
    ],
    output: { resource: "shield-capacitor", amount: 1 },
    craftTime: 10,
  },
  {
    id: "craft-quantum-processor",
    name: "Quantum Processor",
    inputs: [
      { resource: "circuit-board", amount: 2 },
      { resource: "exotic-matter", amount: 1 },
    ],
    output: { resource: "quantum-processor", amount: 1 },
    craftTime: 12,
  },
  {
    id: "craft-hull-armor",
    name: "Hull Armor",
    inputs: [
      { resource: "steel-plate", amount: 3 },
      { resource: "alloy-composite", amount: 1 },
    ],
    output: { resource: "hull-armor", amount: 1 },
    craftTime: 8,
  },
  {
    id: "craft-nano-repair-paste",
    name: "Nano-Repair Paste",
    inputs: [
      { resource: "bio-gel", amount: 2 },
      { resource: "circuit-board", amount: 1 },
    ],
    output: { resource: "nano-repair-paste", amount: 1 },
    craftTime: 10,
  },
];

/**
 * Map from recipe id to its definition.
 * @type {Map<string, object>}
 */
export const RECIPE_MAP = new Map(RECIPES.map((r) => [r.id, r]));

/**
 * All recipes (read-only reference).
 */
export const ALL_RECIPES = RECIPES;

/**
 * Validate that all recipe inputs and outputs reference valid resources.
 * Returns an array of error strings (empty = valid).
 */
export function validateRecipes() {
  const errors = [];
  for (const recipe of RECIPES) {
    for (const input of recipe.inputs) {
      if (!RESOURCE_MAP.has(input.resource)) {
        errors.push(
          `Recipe "${recipe.id}" input "${input.resource}" is not a valid resource`,
        );
      }
    }
    if (!RESOURCE_MAP.has(recipe.output.resource)) {
      errors.push(
        `Recipe "${recipe.id}" output "${recipe.output.resource}" is not a valid resource`,
      );
    }
  }
  return errors;
}

/**
 * Check for circular dependencies in the recipe graph.
 * Returns an array of cycle descriptions (empty = no cycles).
 */
export function detectCycles() {
  // Build adjacency: output resource -> input resources
  const outputToRecipe = new Map();
  for (const recipe of RECIPES) {
    outputToRecipe.set(recipe.output.resource, recipe);
  }

  const cycles = [];

  function dfs(resourceId, visited, path) {
    if (visited.has(resourceId)) {
      if (path.includes(resourceId)) {
        cycles.push(`Cycle: ${[...path, resourceId].join(" -> ")}`);
      }
      return;
    }
    visited.add(resourceId);
    path.push(resourceId);

    const recipe = outputToRecipe.get(resourceId);
    if (recipe) {
      for (const input of recipe.inputs) {
        dfs(input.resource, visited, path);
      }
    }

    path.pop();
  }

  for (const recipe of RECIPES) {
    dfs(recipe.output.resource, new Set(), []);
  }

  return cycles;
}
