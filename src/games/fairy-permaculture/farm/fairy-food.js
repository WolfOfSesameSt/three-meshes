/**
 * Fairy Permaculture — fairy-food re-export (C4.x).
 *
 * The canonical fairy-food store lives at `../fairies/fairy-food.js`
 * (owned by the fairy-population branch). Farm systems (animal-manager,
 * hive, plant-manager) import from here so they have a stable,
 * farm-adjacent path and so we can swap the backing store later without
 * touching every consumer.
 *
 * Three "fairy foods" grow the fairy population: HONEY, MILK, FRUIT.
 * Eggs, meat, grain are NOT fairy food by design.
 */

export {
  fairyFood,
  add,
  spend,
  total,
  snapshot,
  reset,
  onChange,
} from "../fairies/fairy-food.js";
