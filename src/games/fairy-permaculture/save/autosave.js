/**
 * Fairy Permaculture — autosave driver (C6.5).
 *
 * Subscribes to scheduler.onDay and writes the game state to the
 * `'autosave'` slot once per in-game day. Dev-off by default: main.js
 * opts in with `window.__FP__.autosave = true`.
 *
 * Returns an unsubscribe function so the caller can toggle it off.
 */

import { onDay } from "../core/day-tick.js";
import { serializeGame } from "./serialize.js";
import { saveSlot } from "./storage.js";

const DEFAULT_SLOT = "autosave";

/**
 * @param {object} game — the live game reference bundle
 * @param {object} [opts]
 * @param {string} [opts.slotId='autosave']
 * @param {() => boolean} [opts.enabled]   gate per tick (for runtime toggle)
 * @param {boolean} [opts.fullSoil=false]
 * @returns {() => void} unsubscribe
 */
export function startAutosave(game, opts = {}) {
  if (!game?.scheduler) {
    throw new Error("startAutosave: game.scheduler required");
  }
  const slotId = opts.slotId ?? DEFAULT_SLOT;
  const isEnabled = opts.enabled ?? (() => true);
  const unsubscribe = onDay(game.scheduler, (_env) => {
    if (!isEnabled()) return;
    try {
      const payload = serializeGame(game, { fullSoil: !!opts.fullSoil });
      saveSlot(slotId, payload);
    } catch (err) {
      console.warn("[fp:save] autosave failed", err);
    }
  });
  return unsubscribe;
}
