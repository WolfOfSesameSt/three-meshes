/**
 * Fairy Permaculture — central game constants.
 *
 * All tuning numbers that multiple systems need live here or in
 * data/balance.json. Keep this file for constants that are inherently
 * code-level (renderer config, shader uniforms) and put player-facing
 * balance in balance.json.
 */

// ─── Palette (locked, 2-band cel-shading friendly) ────────────────
export const PALETTE = {
  meadowGreen:     0x8BC47A,
  sage:            0xB7D1A0,
  oliveDark:       0x5A7A4B,
  honeyGold:       0xF2C14E,
  warmCoral:       0xF28E74,
  berryPurple:     0xA178B5,
  skyPastel:       0xB8D8E8,
  mistCyan:        0xD6EEF0,
  moonlightSilver: 0xE8E6D8,
  earthBrown:      0x7A5C48,
  compostRich:     0x3E2F23,
};

// ─── World / Tile ─────────────────────────────────────────────────
export const TILE_SIZE = 3.0;          // meters per tile
export const MAP_TILES = 500;          // tiles per side (500×500 = 225 ha)
export const CHUNK_TILES = 32;         // chunk side in tiles

// ─── Time ─────────────────────────────────────────────────────────
export const SECONDS_PER_DAY = 60;     // real-time seconds per in-game day
export const DAYS_PER_SEASON = 30;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

// ─── Renderer ─────────────────────────────────────────────────────
export const BG_COLOR = PALETTE.mistCyan;
export const FOG_NEAR = 400;
export const FOG_FAR = 1600;
export const SUN_COLOR = 0xFFF4DC;
export const SUN_INTENSITY = 1.2;
export const AMBIENT_COLOR = PALETTE.skyPastel;
export const AMBIENT_INTENSITY = 0.55;

// ─── Isometric Camera ─────────────────────────────────────────────
// Fixed 45° isometric (per design decision). Orthographic projection
// with pitch set to true iso angle (arctan(1/√2) ≈ 35.264°) feels
// more authentic; stick with 45° for easier readability per plan.
export const CAMERA_PITCH_DEG = 45;
export const CAMERA_YAW_DEG = 45;
export const CAMERA_ORTHO_SIZE = 42;   // view half-height: 84 m tall, ~150 m wide — homestead + a bit of surrounding terrain
export const CAMERA_DISTANCE = 200;
