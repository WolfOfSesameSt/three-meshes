/**
 * Music configuration — shared between the game and the Music Laboratory.
 *
 * The game has four musical "situations" that the dynamic music system
 * crossfades between. Each situation has:
 *   - a track (URL to an mp3 in /public/audio/music/)
 *   - a description (where/when it plays in the game)
 *   - crossfade duration (seconds)
 *
 * Defaults are baked into this module. The Music Lab saves overrides to
 * localStorage under MUSIC_CONFIG_KEY. getMusicConfig() merges the two so
 * the lab can retune any situation without touching code.
 */

const MUSIC_CONFIG_KEY = "vr-music-config-v1";

export const MUSIC_SITUATIONS = ["station", "mission", "combat", "extraction"];

export const DEFAULT_MUSIC_CONFIG = {
  station: {
    label: "Station",
    track: "/audio/music/station-theme.mp3",
    fadeDuration: 2.0,
    description:
      "Plays on the pirate station between missions — where the player manages crafting, research, upgrades and launches new raids. Calm, contemplative, mysterious. The 'home base' mood.",
  },
  mission: {
    label: "Mission / Exploration",
    track: "/audio/music/mission-ambient.mp3",
    fadeDuration: 3.0,
    description:
      "Plays when a mission first begins and whenever the threat level is low (below 40%). The player is scouting a new realm, mining resources, and exploring. Tense but not frantic — watchful, building, alien atmosphere.",
  },
  combat: {
    label: "Combat",
    track: "/audio/music/combat-escalation.mp3",
    fadeDuration: 2.0,
    description:
      "Plays when the threat level climbs above 40% — enemies are swarming, the player is actively fighting. Intense, driving, urgent. Should make battles feel cinematic and heroic.",
  },
  extraction: {
    label: "Extraction",
    track: "/audio/music/extraction-urgency.mp3",
    fadeDuration: 1.5,
    description:
      "Plays the moment the player summons the stargate to extract. Frantic, high-stakes escape music — the ship is racing to the portal while enemies close in. Countdown tension, alarm-like stabs.",
  },
};

/** Load the current music config: defaults merged with any lab overrides. */
export function getMusicConfig() {
  const merged = {};
  for (const key of MUSIC_SITUATIONS) {
    merged[key] = { ...DEFAULT_MUSIC_CONFIG[key] };
  }
  if (typeof localStorage === "undefined") return merged;
  try {
    const raw = localStorage.getItem(MUSIC_CONFIG_KEY);
    if (!raw) return merged;
    const saved = JSON.parse(raw);
    for (const key of MUSIC_SITUATIONS) {
      if (saved[key]) Object.assign(merged[key], saved[key]);
    }
  } catch (e) {
    console.warn("[music-config] Failed to parse saved config, using defaults:", e);
  }
  return merged;
}

/** Persist a music config to localStorage. */
export function saveMusicConfig(config) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MUSIC_CONFIG_KEY, JSON.stringify(config));
}

/** Wipe any saved overrides and fall back to defaults. */
export function resetMusicConfig() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MUSIC_CONFIG_KEY);
}
