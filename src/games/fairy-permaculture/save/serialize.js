/**
 * Fairy Permaculture — whole-game serializer (C6.5).
 *
 * Walks every stateful subsystem and produces a plain JSON payload
 * with `version` at the top. The inverse operation lives in
 * `hydrate.js`.
 *
 * Handled subsystems:
 *   - scheduler  (day-tick.js)
 *   - treeState  (progression/tree-state.js)
 *   - events     (events/event-engine.js)
 *   - soilField  (farm/soil.js — summary mode by default)
 *   - compostPiles (compost/pile.js)
 *   - weatherListener (core/weather.js — streak state)
 *   - fairyFood  (plain counters on the game state)
 *   - plantManager / animalManager (optional; only if the subsystem
 *     exposes `.serialize()`)
 *
 * The caller passes a `game` object of references — typically built in
 * main.js — rather than this module reaching into module-level globals.
 */

import { SAVE_SCHEMA_VERSION } from "./schema-version.js";
import { serializeScheduler } from "../core/day-tick.js";
import { serialize as serializeTreeState } from "../progression/tree-state.js";
import { serializeSoilSummary, serializeSoilFull } from "../farm/soil.js";

/**
 * Serialize the full game state to a JSON-safe payload.
 *
 * @param {object} game
 * @param {object} game.scheduler
 * @param {object} game.treeState
 * @param {object} [game.eventEngine]
 * @param {object} [game.soilField]
 * @param {Array}  [game.compostPiles]
 * @param {Function} [game.weatherListener]
 * @param {object} [game.fairyFood]   { honey, milk, fruit, ... }
 * @param {object} [game.plantManager]
 * @param {object} [game.animalManager]
 * @param {object} [opts]
 * @param {boolean}[opts.fullSoil=false] include full per-tile soil arrays
 */
export function serializeGame(game, opts = {}) {
  if (!game) throw new Error("serializeGame: game object required");
  const payload = {
    version: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  };

  if (game.scheduler) payload.scheduler = serializeScheduler(game.scheduler);
  if (game.treeState) payload.treeState = serializeTreeState(game.treeState);

  if (game.eventEngine && typeof game.eventEngine.serialize === "function") {
    payload.events = game.eventEngine.serialize();
  }

  if (game.soilField) {
    payload.soilField = opts.fullSoil
      ? serializeSoilFull(game.soilField)
      : serializeSoilSummary(game.soilField);
  }

  if (Array.isArray(game.compostPiles)) {
    payload.compostPiles = game.compostPiles.map((p) =>
      typeof p?.serialize === "function" ? p.serialize() : null
    );
  }

  if (game.weatherListener && typeof game.weatherListener.serialize === "function") {
    payload.weather = game.weatherListener.serialize();
  }

  if (game.fairyFood) {
    payload.fairyFood = { ...game.fairyFood };
  }

  // Optional managers — only serialize if the subsystem opts in.
  if (game.plantManager && typeof game.plantManager.serialize === "function") {
    payload.plantManager = game.plantManager.serialize();
  }
  if (game.animalManager && typeof game.animalManager.serialize === "function") {
    payload.animalManager = game.animalManager.serialize();
  }

  // Seed + biome — purely so the hydrate step can verify the save
  // matches the current world (biome regen is deterministic from seed).
  if (game.biomeSeed != null) payload.biomeSeed = game.biomeSeed;

  return payload;
}
