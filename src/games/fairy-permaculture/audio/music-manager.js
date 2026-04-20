/**
 * Fairy Permaculture — dynamic music manager.
 *
 * Crossfades between `music-day` / `music-night` based on a caller-
 * supplied state snapshot, plays `music-tense` while any event is
 * active, and fires `music-milestone` as a one-shot stinger on
 * rare moments (new-fairy unlock, etc).
 *
 * The manager owns a single AudioContext. Because browsers require a
 * user gesture before audio can play, `start()` attaches a one-time
 * click/keydown listener that resumes the context and begins the
 * first fade-in. After that, `tick()` should be called from the main
 * render loop (or via a setInterval — it's debounced internally) with
 * a fresh `getMusicState()` result.
 *
 * State contract (returned from the game's getMusicState callback):
 *   {
 *     timeOfDay: "day" | "night",   // optional; if absent, inferred from season
 *     season:    "spring" | ...,    // used as a fallback proxy for TOD
 *     anyEventActive: boolean,
 *   }
 *
 * Public API:
 *   const mm = createMusicManager({ getMusicState, config? });
 *   mm.start();                    // attach gesture listeners
 *   mm.tick();                     // call each frame (cheap, debounced)
 *   mm.playMilestone();            // one-shot stinger (on new-fairy etc)
 *   mm.setVolume(0..1);            // master music volume
 *   mm.dispose();
 */

import { DEFAULT_MUSIC_CONFIG } from "./music-config.js";

const DEFAULT_VOLUME = 0.45;
const POLL_MS = 500;

/** Map season name → default time-of-day (spring/summer → day, autumn/winter → night). */
function seasonToTimeOfDay(season) {
  if (season === "autumn" || season === "winter") return "night";
  return "day";
}

/** Resolve desired situation from the game's music-state snapshot. */
function resolveSituation(state) {
  if (!state) return "day";
  if (state.anyEventActive) return "tense";
  if (state.timeOfDay === "night" || state.timeOfDay === "day") return state.timeOfDay;
  return seasonToTimeOfDay(state.season);
}

export function createMusicManager({
  getMusicState = () => ({ season: "spring", anyEventActive: false }),
  config = DEFAULT_MUSIC_CONFIG,
  volume = DEFAULT_VOLUME,
} = {}) {
  let ctx = null;
  let musicGain = null;         // master gain for looping beds
  let stingerGain = null;       // separate bus for one-shot stingers
  let currentSituation = null;  // situation key currently playing
  let currentVoice = null;      // { source, gain, url }
  let resumed = false;
  let lastTickAt = 0;
  let volumeLevel = volume;
  let disposed = false;

  // Cache decoded AudioBuffers so we don't re-fetch on every crossfade.
  const buffers = new Map(); // url -> Promise<AudioBuffer>

  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
    musicGain = ctx.createGain();
    musicGain.gain.value = volumeLevel;
    musicGain.connect(ctx.destination);
    stingerGain = ctx.createGain();
    stingerGain.gain.value = volumeLevel;
    stingerGain.connect(ctx.destination);
    return ctx;
  }

  async function loadBuffer(url) {
    if (buffers.has(url)) return buffers.get(url);
    const c = ensureContext();
    if (!c) return null;
    const p = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        return await c.decodeAudioData(arr);
      } catch (err) {
        console.warn(`[music-manager] failed to load ${url}:`, err.message);
        return null;
      }
    })();
    buffers.set(url, p);
    return p;
  }

  async function crossfadeTo(situation) {
    const c = ensureContext();
    if (!c || !resumed) return;
    const entry = config[situation];
    if (!entry) return;
    const buf = await loadBuffer(entry.track);
    if (!buf || disposed) return;

    const fade = entry.fadeDuration ?? 2;
    const now = c.currentTime;

    // Fade out current (if any).
    const prev = currentVoice;
    if (prev) {
      const g = prev.gain;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
      const stopAt = (fade * 1000) + 200;
      setTimeout(() => {
        try { prev.source.stop(); } catch {}
        try { prev.source.disconnect(); } catch {}
        try { prev.gain.disconnect(); } catch {}
      }, stopAt);
    }

    const source = c.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    source.connect(gain);
    gain.connect(musicGain);
    try { source.start(); } catch (err) {
      console.warn("[music-manager] source.start threw:", err.message);
      return;
    }
    currentVoice = { source, gain, url: entry.track };
    currentSituation = situation;
  }

  async function tick() {
    if (disposed || !resumed) return;
    const now = performance.now();
    if (now - lastTickAt < POLL_MS) return;
    lastTickAt = now;
    const state = getMusicState();
    const want = resolveSituation(state);
    if (want !== currentSituation) {
      await crossfadeTo(want);
    }
  }

  function onFirstGesture() {
    if (resumed || disposed) return;
    const c = ensureContext();
    if (!c) return;
    // Resume synchronously inside the gesture.
    const resume = () => {
      resumed = true;
      // Kick off immediately with the appropriate situation.
      const state = getMusicState();
      const want = resolveSituation(state);
      crossfadeTo(want);
    };
    if (c.state === "suspended") {
      c.resume().then(resume).catch(resume);
    } else {
      resume();
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("click", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    }
  }

  function start() {
    if (typeof window === "undefined") return;
    window.addEventListener("click", onFirstGesture, { once: false });
    window.addEventListener("keydown", onFirstGesture, { once: false });
  }

  async function playMilestone() {
    const c = ensureContext();
    if (!c || !resumed) return;
    const entry = config.milestone;
    if (!entry) return;
    const buf = await loadBuffer(entry.track);
    if (!buf || disposed) return;
    const source = c.createBufferSource();
    source.buffer = buf;
    source.loop = false;
    const gain = c.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(stingerGain);
    try { source.start(); } catch {}
    source.onended = () => {
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
  }

  function setVolume(v) {
    volumeLevel = Math.max(0, Math.min(1, v));
    if (musicGain) musicGain.gain.value = volumeLevel;
    if (stingerGain) stingerGain.gain.value = volumeLevel;
  }

  function dispose() {
    disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("click", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    }
    if (currentVoice) {
      try { currentVoice.source.stop(); } catch {}
      try { currentVoice.source.disconnect(); } catch {}
      try { currentVoice.gain.disconnect(); } catch {}
      currentVoice = null;
    }
    if (ctx) {
      try { ctx.close(); } catch {}
      ctx = null;
    }
  }

  return {
    start,
    tick,
    playMilestone,
    setVolume,
    dispose,
    // Debug introspection — used by tests and the future music-lab.
    _debug: () => ({
      situation: currentSituation,
      resumed,
      volume: volumeLevel,
    }),
  };
}
