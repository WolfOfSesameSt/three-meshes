/**
 * Fairy Permaculture — tiny audio pool.
 *
 * Wraps WebAudio to play short SFX with ±5% pitch variance and a
 * 16-voice cap (overflow evicts oldest). Works even without any
 * loaded sounds — falls back to a procedural "blip" if no buffer is
 * registered for a key. This lets the juice system work before the
 * sound-designer ships real assets.
 */

const VOICE_CAP = 16;
let sharedCtx = null;

function getCtx() {
  if (sharedCtx) return sharedCtx;
  const C = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!C) return null;
  sharedCtx = new C();
  return sharedCtx;
}

const buffers = new Map(); // key -> AudioBuffer
const active = []; // { source, gain, startedAt }

export async function registerSound(key, url) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    buffers.set(key, buf);
  } catch (err) {
    console.warn(`[audio] failed to load ${url}:`, err.message);
  }
}

/** Play a sound by key. Pitches ±5% for variety. */
export function play(key, opts = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const { volume = 0.6, pitchJitter = 0.05 } = opts;

  // Voice cap — evict oldest if over limit
  if (active.length >= VOICE_CAP) {
    const old = active.shift();
    try { old.source.stop(); } catch {}
  }

  const buf = buffers.get(key);
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(ctx.destination);

  let source;
  if (buf) {
    source = ctx.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchJitter;
    source.connect(gain);
    source.start();
  } else {
    // Procedural fallback: quick sine "pop"
    source = ctx.createOscillator();
    const baseFreq =
      key === "compost-scoop"  ? 220 :
      key === "biomass-chop"   ? 420 :
      key === "berry-pick"     ? 680 :
      key === "new-fairy"      ? 880 :
      440;
    source.frequency.value = baseFreq * (1 + (Math.random() * 2 - 1) * pitchJitter);
    source.type = "triangle";
    source.connect(gain);
    source.start();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    source.stop(ctx.currentTime + 0.24);
  }

  const entry = { source, gain, startedAt: ctx.currentTime };
  active.push(entry);
  source.onended = () => {
    const i = active.indexOf(entry);
    if (i >= 0) active.splice(i, 1);
  };
}

export function activeVoiceCount() {
  return active.length;
}

// ── Real asset registration ──────────────────────────────────
// Eagerly register the ElevenLabs-generated SFX so play() stops
// falling back to the procedural sine-blip as soon as decoding
// completes. Runs as a no-op in non-browser environments (tests).
const FP_SFX_KEYS = [
  "berry-pick",
  "biomass-chop",
  "compost-scoop",
  "new-fairy",
  "pile-hot",
  "compost-finish",
  "day-transition",
  "hover-tick",
];

if (typeof window !== "undefined") {
  for (const key of FP_SFX_KEYS) {
    // Fire-and-forget; registerSound logs its own warnings on failure.
    registerSound(key, `/audio/fairy-permaculture/${key}.mp3`);
  }
}
