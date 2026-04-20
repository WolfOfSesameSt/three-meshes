/**
 * Fairy Permaculture — localStorage wrapper (C6.5).
 *
 * Thin, defensive wrapper around `localStorage`. All operations
 * swallow quota / parse errors and log them; the caller gets null
 * back and can decide what to do (typically: warn the user and
 * continue without saving).
 *
 * Slot naming convention:
 *   `fp.save.<slotId>` — actual save payload
 *   `fp.save.meta.<slotId>` — tiny metadata record (timestamp, day)
 *   `fp.save.index` — JSON array of known slot ids
 */

const KEY_PREFIX = "fp.save.";
const META_PREFIX = "fp.save.meta.";
const INDEX_KEY = "fp.save.index";

function getStore() {
  if (typeof globalThis === "undefined") return null;
  return globalThis.localStorage ?? null;
}

function safeParse(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[fp:save] JSON parse failed", err);
    return null;
  }
}

function readIndex(store) {
  const idx = safeParse(store.getItem(INDEX_KEY));
  return Array.isArray(idx) ? idx : [];
}

function writeIndex(store, ids) {
  try {
    store.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)]));
  } catch (err) {
    console.warn("[fp:save] index write failed", err);
  }
}

/**
 * Persist a JSON-serializable payload into a slot.
 * Returns true on success, false on any failure (quota, no storage,
 * circular refs).
 */
export function saveSlot(slotId, data) {
  const store = getStore();
  if (!store) return false;
  try {
    const payload = JSON.stringify(data);
    store.setItem(KEY_PREFIX + slotId, payload);
    const meta = {
      slotId,
      timestamp: Date.now(),
      day: data?.scheduler?.day ?? null,
      year: data?.scheduler?.year ?? null,
      bytes: payload.length,
    };
    store.setItem(META_PREFIX + slotId, JSON.stringify(meta));
    const index = readIndex(store);
    index.push(slotId);
    writeIndex(store, index);
    return true;
  } catch (err) {
    console.warn(`[fp:save] saveSlot('${slotId}') failed`, err);
    return false;
  }
}

/** Returns the payload for a slot, or null if missing/corrupt. */
export function loadSlot(slotId) {
  const store = getStore();
  if (!store) return null;
  return safeParse(store.getItem(KEY_PREFIX + slotId));
}

/** Returns the metadata for a slot, or null if missing/corrupt. */
export function loadSlotMeta(slotId) {
  const store = getStore();
  if (!store) return null;
  return safeParse(store.getItem(META_PREFIX + slotId));
}

/** Array of { slotId, meta }. Best-effort; skips corrupt entries. */
export function listSlots() {
  const store = getStore();
  if (!store) return [];
  const ids = readIndex(store);
  return ids
    .map((id) => ({ slotId: id, meta: loadSlotMeta(id) }))
    .filter((s) => s.meta != null);
}

/** Remove a slot and its metadata. Idempotent. */
export function deleteSlot(slotId) {
  const store = getStore();
  if (!store) return false;
  try {
    store.removeItem(KEY_PREFIX + slotId);
    store.removeItem(META_PREFIX + slotId);
    const index = readIndex(store).filter((id) => id !== slotId);
    writeIndex(store, index);
    return true;
  } catch (err) {
    console.warn(`[fp:save] deleteSlot('${slotId}') failed`, err);
    return false;
  }
}
