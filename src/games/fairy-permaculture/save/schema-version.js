/**
 * Fairy Permaculture — save-schema version registry (C6.5).
 *
 * The top-level `version` field in every save payload is checked on
 * load. If it matches SAVE_SCHEMA_VERSION we deserialize directly; if
 * it's lower we step through MIGRATIONS in order; if it's higher we
 * reject the save (user is on an older build).
 *
 * MIGRATIONS is intentionally empty at v1. Future bumps append a
 * `{ from, to, migrate(payload) }` entry. The `migrate` fn returns a
 * new payload object; it must not mutate the input.
 */

export const SAVE_SCHEMA_VERSION = 1;

/**
 * Ordered list of migration steps. Entries must form an unbroken chain
 * from 1 → SAVE_SCHEMA_VERSION.
 *
 * @type {Array<{ from: number, to: number, migrate: (payload: object) => object }>}
 */
export const MIGRATIONS = [];

/**
 * Walk a saved payload up to the current schema version.
 * Returns a new object (original untouched) at SAVE_SCHEMA_VERSION.
 *
 * Throws if:
 *   - payload.version is higher than SAVE_SCHEMA_VERSION (newer build)
 *   - no migration path exists from payload.version → current
 */
export function migratePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("migratePayload: payload must be an object");
  }
  const from = payload.version;
  if (typeof from !== "number") {
    throw new Error("migratePayload: payload.version must be a number");
  }
  if (from > SAVE_SCHEMA_VERSION) {
    throw new Error(
      `migratePayload: save is from a newer build (v${from} > current v${SAVE_SCHEMA_VERSION})`
    );
  }
  let current = { ...payload };
  let version = from;
  while (version < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) {
      throw new Error(
        `migratePayload: no migration from v${version} → v${version + 1}`
      );
    }
    current = step.migrate(current);
    version = step.to;
    current.version = version;
  }
  return current;
}
