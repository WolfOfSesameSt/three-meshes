/**
 * Global configuration and tuning constants for Kaiju City.
 */

// ─── Voxel Engine ───────────────────────────────────────────────────
export const CHUNK_SIZE = 32;
export const VOXEL_SIZE = 2; // meters per voxel
export const CHUNK_WORLD_SIZE = CHUNK_SIZE * VOXEL_SIZE; // 64m per chunk

// ─── Voxel Types ────────────────────────────────────────────────────
export const VOXEL = {
  AIR: 0,
  GROUND: 1,
  ROAD: 2,
  CONCRETE: 3,
  GLASS: 4,
  STEEL: 5,
  WATER: 6,
  PARK: 7,
  RUBBLE: 8,
};

// Color per voxel type (RGB 0-1)
export const VOXEL_COLORS = {
  [VOXEL.GROUND]: [0.35, 0.30, 0.25],
  [VOXEL.ROAD]: [0.20, 0.20, 0.22],
  [VOXEL.CONCRETE]: [0.55, 0.53, 0.50],
  [VOXEL.GLASS]: [0.4, 0.6, 0.75],
  [VOXEL.STEEL]: [0.45, 0.48, 0.52],
  [VOXEL.WATER]: [0.15, 0.30, 0.55],
  [VOXEL.PARK]: [0.25, 0.50, 0.20],
  [VOXEL.RUBBLE]: [0.40, 0.35, 0.30],
};

// Structural strength per type (hits to destroy, 0 = indestructible)
export const VOXEL_STRENGTH = {
  [VOXEL.GROUND]: 0,
  [VOXEL.ROAD]: 3,
  [VOXEL.CONCRETE]: 2,
  [VOXEL.GLASS]: 1,
  [VOXEL.STEEL]: 4,
  [VOXEL.WATER]: 0,
  [VOXEL.PARK]: 1,
  [VOXEL.RUBBLE]: 1,
};

// ─── World / LOD ────────────────────────────────────────────────────
export const LOAD_RADIUS_NEAR = 8;    // chunks (~512m)
export const LOAD_RADIUS_MED = 16;    // chunks (~1km)
export const LOAD_RADIUS_FAR = 32;    // chunks (~2km)
export const UNLOAD_RADIUS = 36;      // chunks — unload beyond this

// ─── Kaiju ──────────────────────────────────────────────────────────
export const KAIJU_HEIGHT = 80;        // meters
export const KAIJU_SPEED = 40;         // meters/second walk
export const KAIJU_SPRINT_MULT = 1.8;
export const KAIJU_TURN_SPEED = 2.5;   // radians/second

// ─── Attacks ────────────────────────────────────────────────────────
export const PUNCH_RADIUS = 12;        // meters — sphere of destruction
export const STOMP_RADIUS = 20;        // meters — cylinder below kaiju
export const STOMP_DEPTH = 8;          // meters deep
export const TAIL_ARC = Math.PI * 0.6; // radians — arc width behind
export const TAIL_RANGE = 25;          // meters
export const BREATH_RANGE = 200;       // meters
export const BREATH_RADIUS = 6;        // meters — beam width
export const BREATH_ENERGY_COST = 25;  // per second
export const BREATH_ENERGY_MAX = 100;
export const BREATH_RECHARGE = 15;     // per second

// ─── Debris ─────────────────────────────────────────────────────────
export const DEBRIS_ACTIVE_MAX = 2000;
export const DEBRIS_STATIC_MAX = 8000;
export const DEBRIS_CUBE_SIZE = 1.5;   // meters
export const DEBRIS_GRAVITY = -30;     // m/s²
export const DEBRIS_DAMPING = 0.7;     // velocity retained on bounce
export const DEBRIS_REST_THRESHOLD = 0.5; // m/s — below this, bake to static
export const DEBRIS_REST_FRAMES = 10;  // frames below threshold before baking

// ─── Camera ─────────────────────────────────────────────────────────
export const CAM_DISTANCE = 120;       // meters behind kaiju
export const CAM_HEIGHT = 60;          // meters above kaiju
export const CAM_DAMPING = 3.0;        // follow speed
export const CAM_SHAKE_DECAY = 5.0;    // shake fade rate

// ─── Rendering ──────────────────────────────────────────────────────
export const FOG_NEAR = 200;
export const FOG_FAR = 1500;
export const BG_COLOR = 0x87CEEB;      // sky blue
export const SUN_COLOR = 0xfff5e0;
export const SUN_INTENSITY = 1.5;
export const AMBIENT_INTENSITY = 0.5;

// ─── City Generation ────────────────────────────────────────────────
export const DEFAULT_BUILDING_FLOORS = 3;
export const FLOOR_HEIGHT = 3.5;       // meters per floor
export const BUILDING_TAG_HEIGHTS = {
  house: 2,
  residential: 3,
  apartments: 6,
  commercial: 4,
  retail: 2,
  office: 8,
  industrial: 2,
  warehouse: 2,
  church: 4,
  cathedral: 8,
  hospital: 5,
  school: 3,
  university: 4,
  hotel: 8,
  skyscraper: 25,
};
export const MAX_BBOX_SIZE = 2000; // meters — max city generation area

// ─── Mesher Worker Pool ─────────────────────────────────────────────
export const WORKER_COUNT = 3;
export const MESH_BUDGET_PER_FRAME = 4; // max chunks to upload per frame
