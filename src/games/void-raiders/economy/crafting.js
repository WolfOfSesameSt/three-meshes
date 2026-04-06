/**
 * Crafting System — craft resources at the station Replication Hub.
 *
 * Uses game-state resources and recipe definitions.
 * All operations are immediate (craftTime is stored for future queue UI).
 */

import { gameState, canAfford, spendResources } from "./game-state.js";
import { RECIPE_MAP, ALL_RECIPES } from "./recipes.js";

/**
 * Check if the player can craft a recipe (has all required inputs).
 * @param {string} recipeId
 * @returns {boolean}
 */
export function canCraft(recipeId) {
  const recipe = RECIPE_MAP.get(recipeId);
  if (!recipe) return false;

  const costs = {};
  for (const input of recipe.inputs) {
    costs[input.resource] = input.amount;
  }
  return canAfford(costs);
}

/**
 * Execute a craft — deduct inputs and add output to gameState.resources.
 * Returns true on success, false if player can't afford it or recipe is invalid.
 * @param {string} recipeId
 * @returns {boolean}
 */
export function craft(recipeId) {
  const recipe = RECIPE_MAP.get(recipeId);
  if (!recipe) return false;

  const costs = {};
  for (const input of recipe.inputs) {
    costs[input.resource] = input.amount;
  }

  if (!spendResources(costs)) return false;

  // Add output
  const out = recipe.output;
  gameState.resources[out.resource] =
    (gameState.resources[out.resource] || 0) + out.amount;

  return true;
}

/**
 * Get all recipes the player can currently afford.
 * @returns {Array<object>} array of recipe definitions
 */
export function getAvailableRecipes() {
  return ALL_RECIPES.filter((recipe) => canCraft(recipe.id));
}
