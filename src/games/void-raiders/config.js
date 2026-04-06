/**
 * Void Raiders — Global configuration constants.
 */

// ─── Realm ──────────────────────────────────────────────────────
export const REALM_SIZE = 10000;          // 10km across
export const CHUNK_SIZE = 16;             // voxels per chunk axis
export const VOXEL_SCALE = 4;            // meters per voxel
export const CHUNK_LOAD_RADIUS = 8;       // chunks around mothership
export const CHUNK_UNLOAD_RADIUS = 12;    // chunks before disposal

// ─── Terrain ────────────────────────────────────────────────────
export const TERRAIN_HEIGHT = 20;         // max terrain height in voxels (lower = smoother hills)
export const TERRAIN_OCTAVES = 4;         // fewer octaves = smoother
export const TERRAIN_LACUNARITY = 2.0;
export const TERRAIN_PERSISTENCE = 0.4;
export const TERRAIN_FREQUENCY = 0.0015;  // world-space frequency (lower = broader hills)

// ─── Mothership ─────────────────────────────────────────────────
export const MOTHERSHIP_SPEED = 10;       // km/h → ~2.78 m/s
export const MOTHERSHIP_SPEED_MS = MOTHERSHIP_SPEED * (1000 / 3600); // m/s

// ─── Camera ─────────────────────────────────────────────────────
export const CAMERA_DISTANCE = 80;        // meters behind mothership
export const CAMERA_HEIGHT = 40;          // meters above mothership
export const CAMERA_LOOK_AHEAD = 30;      // meters ahead of mothership for look target
export const CAMERA_LERP_SPEED = 3.0;     // smoothing factor
export const CAMERA_MIN_DISTANCE = 20;
export const CAMERA_MAX_DISTANCE = 300;
export const CAMERA_MIN_HEIGHT = 10;
export const CAMERA_MAX_HEIGHT = 200;

// ─── Rendering ──────────────────────────────────────────────────
export const BG_COLOR = 0x0a0e1a;
export const FOG_NEAR = 300;
export const FOG_FAR = 2500;
export const SUN_COLOR = 0xffeedd;
export const SUN_INTENSITY = 2.0;
export const AMBIENT_COLOR = 0x556688;
export const AMBIENT_INTENSITY = 0.8;

// ─── Atmosphere ─────────────────────────────────────���───────────
export const ATMOSPHERE_RADIUS = REALM_SIZE * 0.6;
export const ATMOSPHERE_COLOR = 0x4488ff;
export const ATMOSPHERE_OPACITY = 0.08;

// ─── Performance ────────────────────────────────────────────────
export const MAX_DRONES = 200;
export const TARGET_FPS = 60;
