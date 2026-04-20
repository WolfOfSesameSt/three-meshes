/**
 * Fairy Permaculture — Pile class.
 *
 * Holds the full state of a single compost pile and ticks the
 * simulation once per in-game day. Rendering is NOT done here —
 * that's C2.3's job. Everything this module does is numeric and
 * deterministic (no `Math.random()` — RNG comes in via constructor).
 *
 *   pile = new Pile({ variant: "hot-pile", seed: 42 });
 *   pile.addIngredient("fresh-grass");
 *   pile.addIngredient("dry-leaves");
 *   pile.tick(dayEnv);
 *   pile.turn();           // if state == "turn-window"
 *   const { quality, kg } = pile.harvest();
 */

import {
  STATES,
  nextState,
  applyTurn,
  cnInBand,
  moistureInBand,
  TURN_WINDOW_MIN_DAYS,
  TURN_WINDOW_MAX_DAYS,
  DRY_STALL_MOISTURE,
  AMMONIA_CN_THRESHOLD,
} from "./state-machine.js";
import {
  getIngredient,
  resolveIngredient,
  mixCN,
  mixMoisture,
  totalDryMass,
} from "./ingredients.js";
import { computeQuality, createQualityTracker } from "./quality.js";

// 1 m³ of loose biomass ≈ 250 kg dry matter (very rough, but it's a
// stable conversion for volume-gated thresholds). This lets ~1.2 m³ of
// balanced greens+browns cross the 1 m³ volume gate.
const VOLUME_KG_PER_M3 = 250;

// Per-day decomposition deltas while in HOT state (empirical toy values
// chosen so a balanced 1.2 m³ pile finishes in ~40 days).
const HOT_MOISTURE_DROP_PER_DAY = 1.2;  // % per day (modelled evaporation)
const HOT_VOLUME_DECAY_PER_DAY = 0.015; // fractional (1.5%/day)
const COOLING_VOLUME_DECAY_PER_DAY = 0.005;
const TEMP_HOT = 60;
const TEMP_AMBIENT = 18;
const TEMP_LERP = 0.35;                    // each tick move 35% of the way toward target
const RAIN_MOISTURE_BUMP = 4;              // % per rain day
const TURN_MOISTURE_BUMP = 6;              // composter fairy waters while turning

export class Pile {
  /**
   * @param {object} opts
   * @param {string} [opts.variant]  compost.json variant id ("hot-pile" default)
   * @param {number} [opts.seed]     deterministic seed (for future jitter)
   * @param {boolean}[opts.covered]  whether pile has a cover/tarp
   */
  constructor(opts = {}) {
    this.variant = opts.variant ?? "hot-pile";
    this.seed = opts.seed ?? 0;
    this.covered = !!opts.covered;

    // State.
    this.state = STATES.EMPTY;
    this.daysInState = 0;

    // Composition.
    this.ingredients = [];
    this.volumeM3 = 0;
    this.currentCN = NaN;
    this.moisturePct = NaN;
    this.tempC = TEMP_AMBIENT;

    // Turn timing.
    this.turnsTotal = 0;
    this.daysUntilTurnWindow = TURN_WINDOW_MIN_DAYS;

    // Dry / wet streaks.
    this.daysDry = 0;

    // Quality tracker (mutated each tick).
    this.qualityTracker = createQualityTracker();

    // Terminal-quality fields (populated on harvest).
    this.quality = 0;
    this.biasAtHarvest = null;
    this.qualityFlags = [];
  }

  // ─── Ingredient handling ────────────────────────────────────────

  /**
   * Add one ingredient entry to the pile. Accepts either an id string
   * ("fresh-grass") or an object { id, dryMassKg?, moisturePct? } so
   * the caller can scale the portion.
   *
   * Recomputes C:N, moisture, and volume. No return value.
   */
  addIngredient(ing) {
    const resolved = resolveIngredient(ing);
    if (!resolved) return;
    // Store a frozen-ish copy so later mutations don't corrupt history.
    const entry = {
      id: resolved.id,
      category: resolved.category,
      dryMassKg: resolved.dryMassKg,
      cnRatio: resolved.cnRatio,
      moisturePct: resolved.moisturePct,
    };
    this.ingredients.push(entry);

    if (entry.category === "inoculants") {
      if (!this.qualityTracker.inoculantIds.includes(entry.id)) {
        this.qualityTracker.inoculantIds.push(entry.id);
      }
    }

    this._recompute();

    if (this.state === STATES.EMPTY) {
      this._setState(STATES.FILLING);
    }
  }

  _recompute() {
    const mass = totalDryMass(this.ingredients);
    this.volumeM3 = mass / VOLUME_KG_PER_M3;
    this.currentCN = mixCN(this.ingredients);
    this.moisturePct = mixMoisture(this.ingredients);
  }

  // ─── Day tick ───────────────────────────────────────────────────

  /**
   * Advance the pile by one in-game day.
   *
   * @param {object} dayEnv
   * @param {string} [dayEnv.seasonId]
   * @param {boolean}[dayEnv.rainedToday]
   * @param {number} [dayEnv.tempC]            ambient temp in °C
   * @param {number} [dayEnv.rainDaysStreak]   consecutive rain days so far
   */
  tick(dayEnv = {}) {
    if (this.state === STATES.FINISHED) return;

    this._applyWeather(dayEnv);
    this._applyPhysics();
    this._trackQualityMetrics();

    const transition = nextState(this, dayEnv);
    if (transition) {
      this._setState(transition.state);
    } else {
      this.daysInState += 1;
      // Countdown toward the next turn window while hot.
      if (this.state === STATES.HOT && this.daysUntilTurnWindow > 0) {
        this.daysUntilTurnWindow -= 1;
      }
    }
  }

  _setState(newState) {
    // Capture "ever entered" flags for quality math.
    if (newState === STATES.ANAEROBIC) this.qualityTracker.anaerobicFlag = true;
    if (newState === STATES.AMMONIA_LOSS) this.qualityTracker.ammoniaFlag = true;

    // On entering TURN_WINDOW, daysUntilTurnWindow stays 0 (we're IN it).
    // On leaving HOT/TURN_WINDOW via turn() → HOT, we reset the counter.
    if (newState === STATES.HOT && this.state === STATES.TURN_WINDOW) {
      this.daysUntilTurnWindow = TURN_WINDOW_MIN_DAYS;
    }
    // On first entry to HOT from triggered, arm the turn window counter.
    if (newState === STATES.HOT && this.state !== STATES.HOT) {
      this.daysUntilTurnWindow = TURN_WINDOW_MIN_DAYS;
    }
    // On curing completion flag, mark it (for quality).
    if (newState === STATES.FINISHED) {
      this.qualityTracker.curingCompleted = true;
    }

    this.state = newState;
    this.daysInState = 0;
  }

  _applyWeather(env) {
    if (!env) return;
    if (env.rainedToday) {
      // Uncovered pile takes more water.
      const bump = this.covered ? RAIN_MOISTURE_BUMP * 0.25 : RAIN_MOISTURE_BUMP;
      if (Number.isFinite(this.moisturePct)) {
        this.moisturePct = Math.min(100, this.moisturePct + bump);
      }
    }
  }

  _applyPhysics() {
    // Temperature lerp toward the target for the current state.
    const target = this._targetTemp();
    if (Number.isFinite(this.tempC)) {
      this.tempC = this.tempC + (target - this.tempC) * TEMP_LERP;
    }

    // Moisture drops while hot (evaporation).
    if (this.state === STATES.HOT || this.state === STATES.TURN_WINDOW) {
      if (Number.isFinite(this.moisturePct)) {
        this.moisturePct = Math.max(0, this.moisturePct - HOT_MOISTURE_DROP_PER_DAY);
      }
    }

    // Volume decay.
    if (this.state === STATES.HOT || this.state === STATES.TURN_WINDOW) {
      this.volumeM3 *= (1 - HOT_VOLUME_DECAY_PER_DAY);
    } else if (this.state === STATES.COOLING) {
      this.volumeM3 *= (1 - COOLING_VOLUME_DECAY_PER_DAY);
    }

    // Dry-streak bookkeeping.
    if (Number.isFinite(this.moisturePct) && this.moisturePct < DRY_STALL_MOISTURE) {
      this.daysDry += 1;
    } else {
      this.daysDry = 0;
    }
  }

  _targetTemp() {
    switch (this.state) {
      case STATES.TRIGGERED:   return 40;
      case STATES.HOT:         return TEMP_HOT;
      case STATES.TURN_WINDOW: return 50;
      case STATES.COOLING:     return 30;
      case STATES.CURING:      return 22;
      default:                 return TEMP_AMBIENT;
    }
  }

  _trackQualityMetrics() {
    // Only counts while actively hot / turn-window — those are the
    // states where microbial quality is being built.
    if (this.state === STATES.HOT || this.state === STATES.TURN_WINDOW) {
      this.qualityTracker.hotDays += 1;
      if (Number.isFinite(this.currentCN) && cnInBand(this.currentCN)) {
        this.qualityTracker.cnInBandDays += 1;
      }
      if (Number.isFinite(this.moisturePct) && moistureInBand(this.moisturePct)) {
        this.qualityTracker.moistureInBandDays += 1;
      }
    }
  }

  // ─── Player actions ─────────────────────────────────────────────

  /**
   * Turn the pile. Valid only in TURN_WINDOW; a no-op otherwise.
   * Returns true if the turn succeeded.
   */
  turn() {
    // Count the turn first so applyTurn's FULLY_COOKED_TURNS check
    // observes the post-turn count and sends us to cooling once the
    // pile has been mixed enough times.
    if (this.state !== STATES.TURN_WINDOW) return false;
    this.turnsTotal += 1;
    this.qualityTracker.turnsTotal = this.turnsTotal;
    // Turning is typically paired with watering — bump moisture back
    // toward the band so the pile doesn't desiccate between turns.
    if (Number.isFinite(this.moisturePct)) {
      this.moisturePct = Math.min(100, this.moisturePct + TURN_MOISTURE_BUMP);
    }
    const t = applyTurn(this);
    if (!t) {
      // Shouldn't happen — but if it does, unwind the counter.
      this.turnsTotal -= 1;
      this.qualityTracker.turnsTotal = this.turnsTotal;
      return false;
    }
    this._setState(t.state);
    return true;
  }

  /**
   * Set or unset the cover. Covered piles are less vulnerable to
   * anaerobic failures from heavy rain.
   */
  setCovered(covered) {
    this.covered = !!covered;
  }

  /**
   * Harvest the pile. Valid in FINISHED (full quality) or from HOT /
   * CURING as an "early harvest" (quality cap applies via quality.js).
   * Returns the final quality metadata + kg of finished compost.
   * After harvest, the pile resets to EMPTY.
   */
  harvest() {
    if (this.state !== STATES.FINISHED) {
      this.qualityTracker.earlyHarvested = true;
    }

    // Sync turn count (in case caller queried harvest without ticks).
    this.qualityTracker.turnsTotal = this.turnsTotal;

    const q = computeQuality(this.qualityTracker);
    this.quality = q.stars;
    this.biasAtHarvest = q.bias;
    this.qualityFlags = q.flags;

    const kg = Math.round(totalDryMass(this.ingredients) * 0.5); // ~50% mass retained
    const result = { quality: q.stars, bias: q.bias, flags: q.flags, kg };

    // Reset pile for next batch.
    this._resetAfterHarvest();

    return result;
  }

  _resetAfterHarvest() {
    this.ingredients = [];
    this.volumeM3 = 0;
    this.currentCN = NaN;
    this.moisturePct = NaN;
    this.tempC = TEMP_AMBIENT;
    this.state = STATES.EMPTY;
    this.daysInState = 0;
    this.turnsTotal = 0;
    this.daysUntilTurnWindow = TURN_WINDOW_MIN_DAYS;
    this.daysDry = 0;
    this.qualityTracker = createQualityTracker();
  }

  // ─── Serialization ──────────────────────────────────────────────

  /**
   * Return a plain JSON-safe object capturing the pile's full state.
   * `fromSerialized` reverses this.
   */
  serialize() {
    return {
      variant: this.variant,
      seed: this.seed,
      covered: this.covered,
      state: this.state,
      daysInState: this.daysInState,
      ingredients: this.ingredients.map((i) => ({ ...i })),
      volumeM3: this.volumeM3,
      currentCN: replaceNonFinite(this.currentCN),
      moisturePct: replaceNonFinite(this.moisturePct),
      tempC: this.tempC,
      turnsTotal: this.turnsTotal,
      daysUntilTurnWindow: this.daysUntilTurnWindow,
      daysDry: this.daysDry,
      quality: this.quality,
      biasAtHarvest: this.biasAtHarvest,
      qualityFlags: [...this.qualityFlags],
      qualityTracker: {
        cnInBandDays: this.qualityTracker.cnInBandDays,
        moistureInBandDays: this.qualityTracker.moistureInBandDays,
        hotDays: this.qualityTracker.hotDays,
        turnsTotal: this.qualityTracker.turnsTotal,
        inoculantIds: [...this.qualityTracker.inoculantIds],
        curingCompleted: this.qualityTracker.curingCompleted,
        earlyHarvested: this.qualityTracker.earlyHarvested,
        ammoniaFlag: this.qualityTracker.ammoniaFlag,
        anaerobicFlag: this.qualityTracker.anaerobicFlag,
      },
    };
  }

  /**
   * Reconstruct a Pile from a serialized payload.
   * `json` may be an object or a JSON string.
   */
  static fromSerialized(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    const p = new Pile({ variant: data.variant, seed: data.seed, covered: data.covered });
    p.state = data.state;
    p.daysInState = data.daysInState ?? 0;
    p.ingredients = (data.ingredients || []).map((i) => ({ ...i }));
    p.volumeM3 = data.volumeM3 ?? 0;
    p.currentCN = restoreNonFinite(data.currentCN);
    p.moisturePct = restoreNonFinite(data.moisturePct);
    p.tempC = data.tempC ?? TEMP_AMBIENT;
    p.turnsTotal = data.turnsTotal ?? 0;
    p.daysUntilTurnWindow = data.daysUntilTurnWindow ?? TURN_WINDOW_MIN_DAYS;
    p.daysDry = data.daysDry ?? 0;
    p.quality = data.quality ?? 0;
    p.biasAtHarvest = data.biasAtHarvest ?? null;
    p.qualityFlags = [...(data.qualityFlags || [])];
    if (data.qualityTracker) {
      p.qualityTracker = {
        cnInBandDays: data.qualityTracker.cnInBandDays ?? 0,
        moistureInBandDays: data.qualityTracker.moistureInBandDays ?? 0,
        hotDays: data.qualityTracker.hotDays ?? 0,
        turnsTotal: data.qualityTracker.turnsTotal ?? 0,
        inoculantIds: [...(data.qualityTracker.inoculantIds || [])],
        curingCompleted: !!data.qualityTracker.curingCompleted,
        earlyHarvested: !!data.qualityTracker.earlyHarvested,
        ammoniaFlag: !!data.qualityTracker.ammoniaFlag,
        anaerobicFlag: !!data.qualityTracker.anaerobicFlag,
      };
    }
    return p;
  }
}

// Marker strings for NaN / Infinity (JSON.stringify would otherwise
// emit `null`, which round-trips incorrectly).
function replaceNonFinite(n) {
  if (Number.isFinite(n)) return n;
  if (Number.isNaN(n)) return "__NaN__";
  if (n === Infinity) return "__Infinity__";
  if (n === -Infinity) return "__-Infinity__";
  return n;
}

function restoreNonFinite(v) {
  if (v === "__NaN__") return NaN;
  if (v === "__Infinity__") return Infinity;
  if (v === "__-Infinity__") return -Infinity;
  return v;
}

// Re-export ingredient helpers at the class scope for convenience.
Pile.getIngredient = getIngredient;
