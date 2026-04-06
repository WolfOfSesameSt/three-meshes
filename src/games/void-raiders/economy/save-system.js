/**
 * Save System — persists game state between sessions.
 *
 * V1: localStorage (instant, no backend)
 * Future: Supabase (cloud saves, cross-device, accounts)
 *
 * The save format is designed to be Supabase-portable:
 * - All data is JSON-serializable
 * - Schema matches planned database tables
 * - Save slots support multiple save files
 */

const STORAGE_KEY = "void-raiders-save";
const SAVE_VERSION = 1;

/**
 * Save schema — maps directly to future database tables.
 *
 * Tables (Supabase-ready):
 *
 * save_files
 *   id              UUID
 *   user_id         UUID (future auth)
 *   slot            INTEGER (0-2)
 *   version         INTEGER
 *   created_at      TIMESTAMP
 *   updated_at      TIMESTAMP
 *   play_time_s     INTEGER
 *   missions_completed INTEGER
 *
 * station_resources
 *   save_id         UUID FK
 *   resource_type   TEXT
 *   amount          INTEGER
 *
 * mothership_stats
 *   save_id         UUID FK
 *   hull_max        INTEGER
 *   shields_max     INTEGER
 *   energy_max      INTEGER
 *   energy_production FLOAT
 *   tesseract_capacity INTEGER
 *   weapon_slots    INTEGER
 *
 * drone_fleet
 *   save_id         UUID FK
 *   drone_type      TEXT
 *   count           INTEGER
 *
 * research_unlocks
 *   save_id         UUID FK
 *   research_id     TEXT
 *   unlocked_at     TIMESTAMP
 *
 * captured_leaders
 *   save_id         UUID FK
 *   leader_id       TEXT
 *   leader_type     TEXT
 *   civilization    TEXT
 *   status          TEXT (conscripted|imprisoned)
 *   bonus_type      TEXT
 *   bonus_value     FLOAT
 *
 * power_allocation
 *   save_id         UUID FK
 *   shields_pct     INTEGER
 *   weapons_pct     INTEGER
 *   replication_pct INTEGER
 *
 * swarm_routines
 *   save_id         UUID FK
 *   swarm_index     INTEGER
 *   anchor          TEXT
 *   range           INTEGER
 *   priority        TEXT
 *   action          TEXT
 *   retreat         TEXT
 */

import { gameState } from "./game-state.js";

/**
 * Serialize the current gameState into a save-ready object.
 */
export function serializeState() {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    playTimeSeconds: gameState.playTimeSeconds ?? 0,
    missionsCompleted: gameState.missionsCompleted,

    resources: { ...gameState.resources },

    mothership: { ...gameState.mothership },

    drones: gameState.drones.map(d => ({ ...d })),

    research: { ...gameState.research },

    // Future: captured leaders, swarm routines, power allocation
    capturedLeaders: gameState.capturedLeaders ?? [],
    swarmRoutines: gameState.swarmRoutines ?? [],
    powerAllocation: gameState.powerAllocation ?? { shields: 40, weapons: 40, replication: 20 },
  };
}

/**
 * Deserialize a save object back into gameState.
 */
export function deserializeState(save) {
  if (!save || save.version !== SAVE_VERSION) {
    console.warn("Save version mismatch or invalid save data");
    return false;
  }

  gameState.resources = save.resources ?? {};
  gameState.mothership = save.mothership ?? gameState.mothership;
  gameState.drones = save.drones ?? gameState.drones;
  gameState.research = save.research ?? {};
  gameState.missionsCompleted = save.missionsCompleted ?? 0;
  gameState.playTimeSeconds = save.playTimeSeconds ?? 0;
  gameState.capturedLeaders = save.capturedLeaders ?? [];
  gameState.swarmRoutines = save.swarmRoutines ?? [];
  gameState.powerAllocation = save.powerAllocation ?? { shields: 40, weapons: 40, replication: 20 };

  return true;
}

// ─── localStorage Backend ────────────────────────────────────

/**
 * Save to localStorage.
 * @param {number} slot — save slot (0, 1, or 2)
 */
export function saveToLocal(slot = 0) {
  const data = serializeState();
  const saves = loadAllLocalSaves();
  saves[slot] = data;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    console.log(`Game saved to slot ${slot}`);
    return true;
  } catch (e) {
    console.error("Failed to save:", e.message);
    return false;
  }
}

/**
 * Load from localStorage.
 * @param {number} slot — save slot (0, 1, or 2)
 * @returns {boolean} success
 */
export function loadFromLocal(slot = 0) {
  const saves = loadAllLocalSaves();
  const save = saves[slot];
  if (!save) {
    console.warn(`No save in slot ${slot}`);
    return false;
  }
  return deserializeState(save);
}

/**
 * Get all local saves (for displaying slot info).
 * @returns {Array} [slot0, slot1, slot2] — each is a save object or null
 */
export function loadAllLocalSaves() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [null, null, null];
    const saves = JSON.parse(raw);
    return Array.isArray(saves) ? saves : [null, null, null];
  } catch (e) {
    return [null, null, null];
  }
}

/**
 * Delete a local save slot.
 */
export function deleteLocalSave(slot) {
  const saves = loadAllLocalSaves();
  saves[slot] = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

/**
 * Check if any local save exists.
 */
export function hasLocalSave() {
  const saves = loadAllLocalSaves();
  return saves.some(s => s !== null);
}

// ─── File Export/Import (for backup) ─────────────────────────

/**
 * Export save as a downloadable JSON file.
 */
export function exportSaveFile(slot = 0) {
  const saves = loadAllLocalSaves();
  const save = saves[slot];
  if (!save) return;

  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `void-raiders-save-slot${slot}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import save from a JSON file.
 * @param {File} file
 * @param {number} slot
 * @returns {Promise<boolean>}
 */
export async function importSaveFile(file, slot = 0) {
  try {
    const text = await file.text();
    const save = JSON.parse(text);
    if (deserializeState(save)) {
      saveToLocal(slot);
      return true;
    }
    return false;
  } catch (e) {
    console.error("Failed to import save:", e.message);
    return false;
  }
}

// ─── Auto-save ──────────────────────────────────────────────

let autoSaveInterval = null;

/**
 * Start auto-saving every N seconds.
 */
export function startAutoSave(intervalSeconds = 60) {
  stopAutoSave();
  autoSaveInterval = setInterval(() => {
    saveToLocal(0);
  }, intervalSeconds * 1000);
}

/**
 * Stop auto-saving.
 */
export function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}
