/**
 * Fairy Permaculture — music configuration.
 *
 * The game has four musical "situations" that the music manager
 * crossfades between (or one-shots, in the case of the milestone
 * stinger). Each entry declares:
 *   - label:         human-readable name (for debug / future music-lab)
 *   - track:         URL to an mp3 under /public/audio/fairy-permaculture/
 *   - fadeDuration:  seconds to crossfade when this situation becomes
 *                    active (milestone one-shot ignores this)
 *   - description:   mood + where it plays, for the audio designer
 *                    and future reference.
 *
 * Plain data module — no Three.js, no side effects. Safe to import
 * from the main game, tests, or a future music-lab HTML page.
 */

export const MUSIC_SITUATIONS = ["day", "night", "milestone", "tense"];

export const DEFAULT_MUSIC_CONFIG = {
  day: {
    label: "Day",
    track: "/audio/fairy-permaculture/music-day.mp3",
    fadeDuration: 3.5,
    description:
      "Plays during day-time / spring + summer. Sparse piano field music with occasional flute or ocarina, gentle harp punctuation. Reverent, slow, mostly-silence — BOTW / Sable / Hollow Knight field music as the model.",
  },
  night: {
    label: "Night",
    track: "/audio/fairy-permaculture/music-night.mp3",
    fadeDuration: 3.5,
    description:
      "Plays during night-time / autumn + winter. Harp plus soft pad plus distant wooden flute, sparse and dreamy, starlit garden atmosphere.",
  },
  milestone: {
    label: "Milestone",
    track: "/audio/fairy-permaculture/music-milestone.mp3",
    fadeDuration: 0.25,
    description:
      "Brief orchestral swell + triad resolve — one-shot stinger on new-fairy unlock and other rare milestones.",
  },
  tense: {
    label: "Tense / Event Active",
    track: "/audio/fairy-permaculture/music-tense.mp3",
    fadeDuration: 2.0,
    description:
      "Plays while any event is active — light dissonance, low drone, subtle percussion. Watchful, not scary.",
  },
};

/** Resolve the URL for a given situation, honoring optional overrides. */
export function getTrackUrl(situation, overrides = null) {
  const cfg = overrides?.[situation] ?? DEFAULT_MUSIC_CONFIG[situation];
  return cfg?.track ?? null;
}
