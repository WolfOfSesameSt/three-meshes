/**
 * Fairy Permaculture — event engine (C6.1, MVP).
 *
 * Per in-game day:
 *   1. Decrement active events; revert effects on expiry.
 *   2. For each event catalogue entry, roll its probability against the
 *      current season gate, then evaluate its trigger predicate.
 *   3. If the predicate fires, compute mitigation-reduced severity,
 *      apply effects, schedule a duration, and notify UI.
 *
 * Events are read live from `data/events.json`; probability multipliers
 * come from `data/balance.json → event_probabilities` so the
 * balance-coordinator can tune without code changes.
 *
 * Public API:
 *   const engine = createEventEngine({ seed, events, balance });
 *   engine.tick(env, world);      // call from scheduler.onDay
 *   engine.activeEvents();        // array of { id, remainingDays, severity }
 *   engine.serialize();           // → plain JSON
 *   engine.hydrate(saved, { events, balance }); // restore
 *   engine.reset();               // clear active events
 *
 * Determinism: engine owns a mulberry32 RNG; the seed is serialized so
 * reload mid-game is reproducible from the same save state.
 */

import eventsData from "../data/events.json" with { type: "json" };
import balanceData from "../data/balance.json" with { type: "json" };
import { getTrigger } from "./triggers.js";
import { applyEffect, revertEffect } from "./effects.js";
import { severityMultiplier as computeSeverityMultiplier } from "./mitigations.js";
import { notifyEvent, notifyEventEnded } from "./ui-notifications.js";

/** Deterministic PRNG, matches weather.js. */
function createRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    },
    getState() {
      return state;
    },
    setState(s) {
      state = s >>> 0;
    },
  };
}

/** Roll an inclusive integer in [lo, hi]. */
function rollInt(rng, lo, hi) {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng.next() * (hi - lo + 1));
}

/**
 * @param {object} opts
 * @param {number} [opts.seed=0]
 * @param {Array}  [opts.events]    override catalogue (tests use smaller sets)
 * @param {object} [opts.balance]   override balance.json
 * @param {(event, severity) => void} [opts.onNotify]  injection for tests
 * @param {(event) => void}           [opts.onResolve] injection for tests
 */
export function createEventEngine(opts = {}) {
  const catalogue = opts.events ?? eventsData;
  const balance = opts.balance ?? balanceData;
  const seed = opts.seed ?? 0;
  const rng = createRng(seed);
  const onNotify = opts.onNotify ?? notifyEvent;
  const onResolve = opts.onResolve ?? notifyEventEnded;

  /** Array of active events: { id, remainingDays, severity, appliedSnapshots, context }. */
  const active = [];
  /** Refractory cooldowns per event id — prevents instant re-fire. */
  const cooldowns = new Map(); // id -> days remaining
  const REFRACTORY_DAYS = 30;

  function catalogueById(id) {
    return catalogue.find((e) => e.id === id) ?? null;
  }

  /** Per-day probability for an event id, from balance.json (live). */
  function probabilityFor(id, fallback) {
    const p = balance?.event_probabilities?.[id];
    return typeof p === "number" ? p : fallback;
  }

  /** Is this event's season-gate met? */
  function seasonGateMet(event, env) {
    const gate = event.trigger?.season ?? "any";
    if (gate === "any") return true;
    return env?.seasonName === gate;
  }

  function startEvent(event, context, env, world) {
    const severity = computeSeverityMultiplier(event, context, world);
    // Fully mitigated → skip the event entirely. This keeps mitigations
    // tangibly valuable and avoids zero-impact log spam.
    if (severity <= 0) return null;

    const durationDays = rollInt(
      rng,
      event.duration_days_range?.[0] ?? 1,
      event.duration_days_range?.[1] ?? 1
    );

    const appliedSnapshots = [];
    for (const effect of event.effects ?? []) {
      const snap = applyEffect(effect, context, world, severity);
      if (snap) appliedSnapshots.push({ effect, snap });
    }

    const record = {
      id: event.id,
      remainingDays: durationDays,
      severity,
      context: { ...(context ?? {}) },
      appliedSnapshots,
      startedOnDay: env?.day ?? 0,
    };
    active.push(record);
    try {
      onNotify(event, severity);
    } catch (_err) {
      /* notification failures are non-fatal */
    }
    return record;
  }

  function endEvent(record, world) {
    const event = catalogueById(record.id);
    if (event) {
      for (const s of record.appliedSnapshots ?? []) {
        revertEffect(s.effect, record.context, world, s.snap);
      }
      try {
        onResolve(event);
      } catch (_err) {
        /* no-op */
      }
    }
  }

  function tickActive(world) {
    // Decrement in-place; remove expired. Expiring an event starts
    // a refractory cooldown so the same event can't instantly re-fire.
    for (let i = active.length - 1; i >= 0; i--) {
      active[i].remainingDays -= 1;
      if (active[i].remainingDays <= 0) {
        const [record] = active.splice(i, 1);
        endEvent(record, world);
        cooldowns.set(record.id, REFRACTORY_DAYS);
      }
    }
    // Decrement refractory cooldowns.
    for (const [id, days] of cooldowns) {
      if (days <= 1) cooldowns.delete(id);
      else cooldowns.set(id, days - 1);
    }
  }

  function rollNewEvents(env, world) {
    for (const event of catalogue) {
      // Disallow multiple concurrent instances of the same event — MVP rule.
      if (active.some((a) => a.id === event.id)) continue;
      // Refractory cooldown after a previous instance resolved.
      if (cooldowns.has(event.id)) continue;
      if (!seasonGateMet(event, env)) continue;

      const baseProb = probabilityFor(event.id, event.trigger?.probability ?? 0);
      if (baseProb <= 0) continue;
      if (rng.next() >= baseProb) continue;

      const trigger = getTrigger(event.trigger?.type);
      if (!trigger) continue;

      const result = trigger(event, env, world);
      if (!result?.fires) continue;

      startEvent(event, result.context ?? {}, env, world);
    }
  }

  function tick(env, world) {
    // Order matters: decrement/expire first so a day can end one event
    // and start another in the same call.
    tickActive(world);
    rollNewEvents(env, world);
  }

  function activeEvents() {
    return active.map((a) => ({
      id: a.id,
      remainingDays: a.remainingDays,
      severity: a.severity,
      startedOnDay: a.startedOnDay,
    }));
  }

  function reset() {
    active.length = 0;
  }

  function serialize() {
    return {
      version: 1,
      rngState: rng.getState(),
      active: active.map((a) => ({
        id: a.id,
        remainingDays: a.remainingDays,
        severity: a.severity,
        context: a.context,
        startedOnDay: a.startedOnDay,
        // We cannot serialize applied mutations generically (they're
        // pointers into world state). Hydrate re-applies effects from
        // the catalogue after world state has been restored.
      })),
      cooldowns: Array.from(cooldowns.entries()),
    };
  }

  /**
   * Restore state from a payload. Effects are re-applied against the
   * (already-hydrated) world so active penalties come back online.
   */
  function hydrate(saved, hydrateOpts = {}) {
    if (!saved) return;
    rng.setState(saved.rngState ?? seed);
    active.length = 0;
    cooldowns.clear();
    for (const [id, days] of saved.cooldowns ?? []) {
      cooldowns.set(id, days);
    }
    const world = hydrateOpts.world ?? {};
    for (const r of saved.active ?? []) {
      const event = catalogueById(r.id);
      if (!event) continue;
      const appliedSnapshots = [];
      for (const effect of event.effects ?? []) {
        const snap = applyEffect(effect, r.context, world, r.severity);
        if (snap) appliedSnapshots.push({ effect, snap });
      }
      active.push({
        id: r.id,
        remainingDays: r.remainingDays,
        severity: r.severity,
        context: r.context ?? {},
        appliedSnapshots,
        startedOnDay: r.startedOnDay ?? 0,
      });
    }
  }

  return {
    tick,
    activeEvents,
    serialize,
    hydrate,
    reset,
    // Exposed for debugging / tests.
    _rng: rng,
    _catalogue: catalogue,
  };
}
