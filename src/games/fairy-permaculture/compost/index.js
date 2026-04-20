/**
 * Fairy Permaculture — Compost system public surface.
 *
 * Rendering lives in a future chunk (C2.3); this module is pure sim.
 */

export { Pile } from "./pile.js";

export {
  STATES,
  nextState,
  applyTurn,
  cnInBand,
  moistureInBand,
  volumeSufficient,
  hotReady,
  isPrimary,
  isFailure,
  HOT_VOLUME_M3,
  CN_BAND_MIN,
  CN_BAND_MAX,
  MOISTURE_BAND_MIN,
  MOISTURE_BAND_MAX,
  TURN_WINDOW_MIN_DAYS,
  TURN_WINDOW_MAX_DAYS,
  HOT_RAMP_DAYS,
  COOLING_DAYS,
  CURING_DAYS,
  DRY_STALL_DAYS,
  WET_ANAEROBIC_DAYS,
  DRY_STALL_MOISTURE,
  AMMONIA_CN_THRESHOLD,
  FULLY_COOKED_TURNS,
} from "./state-machine.js";

export {
  getIngredient,
  listIngredients,
  INGREDIENT_CATEGORIES,
  mixCN,
  mixMoisture,
  totalDryMass,
  resolveIngredient,
} from "./ingredients.js";

export { computeQuality, createQualityTracker } from "./quality.js";
