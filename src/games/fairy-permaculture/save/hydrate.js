/**
 * Fairy Permaculture — whole-game hydrator (C6.5).
 *
 * Inverse of serialize.js. Given a saved payload and the live game
 * object (scheduler, tree-state, soilField, etc.), restore each
 * subsystem to its saved state.
 *
 * Dependency order:
 *   1. migratePayload — bump to current schema version first.
 *   2. scheduler — date is the most-depended-on state.
 *   3. soilField — must be restored before event effects re-apply
 *      (effects read soil summaries).
 *   4. weatherListener — streaks needed by events + soil tick.
 *   5. fairyFood + tree-state — player progression.
 *   6. compost piles — rebuilt via Pile.fromSerialized.
 *   7. plant/animal managers — if present.
 *   8. event-engine — last, since it re-applies active effects against
 *      the already-hydrated world.
 */

import { migratePayload } from "./schema-version.js";
import { hydrateScheduler } from "../core/day-tick.js";
import { hydrate as hydrateTreeState } from "../progression/tree-state.js";
import { hydrateSoil } from "../farm/soil.js";
import { Pile } from "../compost/pile.js";

/**
 * Mutate `game` in place so each subsystem reflects `payload`.
 *
 * @param {object} game
 * @param {object} payload
 * @param {object} [opts]
 * @param {object} [opts.world]  if provided, used as the `world` arg
 *   to eventEngine.hydrate so effects re-apply to current refs.
 * @returns {object} game
 */
export function hydrateGame(game, payload, opts = {}) {
  if (!game) throw new Error("hydrateGame: game object required");
  if (!payload) throw new Error("hydrateGame: payload required");
  const migrated = migratePayload(payload);

  // 1. Scheduler.
  if (migrated.scheduler && game.scheduler) {
    hydrateScheduler(game.scheduler, migrated.scheduler);
  }

  // 2. Soil.
  if (migrated.soilField && game.soilField) {
    hydrateSoil(game.soilField, migrated.soilField);
  }

  // 3. Weather streaks.
  if (migrated.weather && game.weatherListener?.hydrate) {
    game.weatherListener.hydrate(migrated.weather);
  }

  // 4. Fairy food.
  // The game's canonical fairy-food store is a read-only Proxy backed
  // by a private store; use its `reset()` hook if present, otherwise
  // fall back to Object.assign for plain-object counters (tests).
  if (migrated.fairyFood) {
    if (typeof game.fairyFoodReset === "function") {
      game.fairyFoodReset(migrated.fairyFood, { clearListeners: false });
    } else if (game.fairyFood) {
      try {
        Object.assign(game.fairyFood, migrated.fairyFood);
      } catch (_err) {
        console.warn(
          "[fp:save] fairyFood is read-only; pass game.fairyFoodReset to hydrate"
        );
      }
    }
  }

  // 5. Tree state.
  if (migrated.treeState && game.treeState) {
    hydrateTreeState(game.treeState, migrated.treeState);
  }

  // 6. Compost piles — rebuild the array in place so shared references
  //    in `game.compostPiles` keep pointing at the right piles.
  if (Array.isArray(migrated.compostPiles) && Array.isArray(game.compostPiles)) {
    game.compostPiles.length = 0;
    for (const entry of migrated.compostPiles) {
      if (!entry) continue;
      game.compostPiles.push(Pile.fromSerialized(entry));
    }
  }

  // 7. Managers.
  if (migrated.plantManager && game.plantManager?.hydrate) {
    game.plantManager.hydrate(migrated.plantManager);
  }
  if (migrated.animalManager && game.animalManager?.hydrate) {
    game.animalManager.hydrate(migrated.animalManager);
  }

  // 8. Event engine — must run last since it re-applies effects
  //    against the hydrated world. Build a reference world if caller
  //    didn't provide one.
  if (migrated.events && game.eventEngine?.hydrate) {
    const world = opts.world ?? {
      env: {},
      activePenalties: { yield: [] },
      pendingRisks: {},
      compostPiles: game.compostPiles,
      soilField: game.soilField,
      plantManager: game.plantManager,
      animalManager: game.animalManager,
    };
    game.eventEngine.hydrate(migrated.events, { world });
  }

  return game;
}
