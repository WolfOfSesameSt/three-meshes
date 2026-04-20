/**
 * Fairy Permaculture — per-day weather generator.
 *
 * Deterministic weather for the BC coastal biome. Reads per-season
 * rainfall + frost probabilities from the biome config, rolls a
 * seeded RNG, and returns a `WeatherDay` passed to all day-tick
 * listeners via the scheduler env.
 *
 * Important: the simulator re-runs at the same seed must produce
 * bit-identical weather sequences. That's why this module takes an
 * explicit RNG state and never reads global state.
 */

/** Simple deterministic integer PRNG (mulberry32). */
export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Roll one day of weather.
 *
 * @param {number} day      — day index (0..)
 * @param {string} seasonName — 'spring' | 'summer' | 'autumn' | 'winter'
 * @param {object} biome    — full biome config (from data/biomes/*.json)
 * @param {() => number} rng — deterministic PRNG 0..1
 */
export function rollDay(day, seasonName, biome, rng) {
  const rainChance = biome.climate.rainfall_chance_per_season[seasonName];
  const frostChance = biome.climate.frost_chance_per_season[seasonName];

  const rained = rng() < rainChance;
  const frosted = rng() < frostChance;

  // Temperature follows a simple seasonal sinusoid with daily jitter.
  const seasonalBaseline = {
    spring: 11,
    summer: 20,
    autumn: 12,
    winter: 4,
  }[seasonName];
  const jitter = (rng() - 0.5) * 6; // ±3 °C
  const tempC = seasonalBaseline + jitter;

  // Rainfall amount when it rains — gamma-ish distribution via 2× uniform.
  const rainMm = rained ? Math.round((rng() * rng() * 40 + 2) * 10) / 10 : 0;

  return {
    day,
    seasonName,
    rained,
    rainMm,
    frosted,
    tempC,
  };
}

/**
 * Build a listener that, when attached to `onDay`, populates the
 * environment with weather + tracks consecutive-rain-day streaks
 * (needed by events).
 *
 * The returned closure also exposes `.serialize()` / `.hydrate(saved)`
 * so the save system can round-trip the streak state without reaching
 * into module internals.
 */
export function createWeatherListener(biome, seed) {
  const rng = createRng(seed);
  const streaks = {
    rainDaysStreak: 0,
    rainlessDaysStreak: 0,
  };
  function weatherDay(env) {
    const w = rollDay(env.day, env.seasonName, biome, rng);
    if (w.rained) {
      streaks.rainDaysStreak += 1;
      streaks.rainlessDaysStreak = 0;
    } else {
      streaks.rainlessDaysStreak += 1;
      streaks.rainDaysStreak = 0;
    }
    Object.assign(env, w, streaks);
    return env;
  }
  weatherDay.serialize = () => ({
    version: 1,
    seed,
    rainDaysStreak: streaks.rainDaysStreak,
    rainlessDaysStreak: streaks.rainlessDaysStreak,
  });
  weatherDay.hydrate = (saved) => {
    if (!saved) return;
    streaks.rainDaysStreak = saved.rainDaysStreak ?? 0;
    streaks.rainlessDaysStreak = saved.rainlessDaysStreak ?? 0;
  };
  return weatherDay;
}
