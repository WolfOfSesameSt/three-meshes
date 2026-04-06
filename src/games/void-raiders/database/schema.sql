-- Void Raiders — Supabase Database Schema
--
-- Designed for cloud saves, leaderboards, and future multiplayer.
-- Run this migration to set up the database.
--
-- All tables use UUID primary keys and include RLS policies.
-- Save data is structured to match the localStorage save format
-- for easy migration.

-- ─── Save Files ─────────────────────────────────────────────────
-- One row per save slot per user. Max 3 slots.
CREATE TABLE save_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot              INTEGER NOT NULL CHECK (slot >= 0 AND slot <= 2),
  version           INTEGER NOT NULL DEFAULT 1,
  play_time_seconds INTEGER NOT NULL DEFAULT 0,
  missions_completed INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, slot)
);

-- ─── Station Resources ──────────────────────────────────────────
-- One row per resource type per save.
CREATE TABLE station_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id         UUID NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  resource_type   TEXT NOT NULL,
  amount          INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),

  UNIQUE(save_id, resource_type)
);

-- ─── Mothership Stats ───────────────────────────────────────────
-- One row per save — current mothership configuration.
CREATE TABLE mothership_stats (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id             UUID NOT NULL UNIQUE REFERENCES save_files(id) ON DELETE CASCADE,
  hull_max            INTEGER NOT NULL DEFAULT 1000,
  shields_max         INTEGER NOT NULL DEFAULT 500,
  energy_max          INTEGER NOT NULL DEFAULT 100,
  energy_production   REAL NOT NULL DEFAULT 10,
  tesseract_capacity  INTEGER NOT NULL DEFAULT 10000,
  weapon_slots        INTEGER NOT NULL DEFAULT 5
);

-- ─── Drone Fleet ────────────────────────────────────────────────
-- One row per drone type per save.
CREATE TABLE drone_fleet (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id     UUID NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  drone_type  TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),

  UNIQUE(save_id, drone_type)
);

-- ─── Research Unlocks ───────────────────────────────────────────
-- One row per unlocked research item per save.
CREATE TABLE research_unlocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id       UUID NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  research_id   TEXT NOT NULL,
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(save_id, research_id)
);

-- ─── Captured Leaders ───────────────────────────────────────────
-- Alien leaders captured during missions.
CREATE TABLE captured_leaders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id       UUID NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  leader_type   TEXT NOT NULL,
  civilization  TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'imprisoned' CHECK (status IN ('imprisoned', 'conscripted', 'interrogated', 'traded', 'ransomed')),
  bonus_type    TEXT,
  bonus_value   REAL DEFAULT 0,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Power Allocation ───────────────────────────────────────────
-- Saved power distribution settings.
CREATE TABLE power_allocation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id         UUID NOT NULL UNIQUE REFERENCES save_files(id) ON DELETE CASCADE,
  shields_pct     INTEGER NOT NULL DEFAULT 40 CHECK (shields_pct >= 0 AND shields_pct <= 100),
  weapons_pct     INTEGER NOT NULL DEFAULT 40 CHECK (weapons_pct >= 0 AND weapons_pct <= 100),
  replication_pct INTEGER NOT NULL DEFAULT 20 CHECK (replication_pct >= 0 AND replication_pct <= 100)
);

-- ─── Swarm Routines ─────────────────────────────────────────────
-- Saved drone swarm AI configurations.
CREATE TABLE swarm_routines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id       UUID NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  swarm_index   INTEGER NOT NULL,
  swarm_name    TEXT,
  anchor        TEXT NOT NULL DEFAULT 'follow-mothership',
  range_meters  INTEGER NOT NULL DEFAULT 200,
  priority      TEXT NOT NULL DEFAULT 'nearest',
  action        TEXT NOT NULL DEFAULT 'mine',
  retreat       TEXT NOT NULL DEFAULT 'cargo-full',

  UNIQUE(save_id, swarm_index)
);

-- ─── Mission History ────────────────────────────────────────────
-- Log of completed missions for stats/leaderboards.
CREATE TABLE mission_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id           UUID NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  realm_seed        INTEGER,
  realm_tier        INTEGER,
  realm_biome       TEXT,
  duration_seconds  INTEGER NOT NULL,
  resources_gained  JSONB NOT NULL DEFAULT '{}',
  drones_lost       INTEGER NOT NULL DEFAULT 0,
  enemies_killed    INTEGER NOT NULL DEFAULT 0,
  ship_destroyed    BOOLEAN NOT NULL DEFAULT false,
  extracted         BOOLEAN NOT NULL DEFAULT false,
  completed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────────
CREATE INDEX idx_save_files_user ON save_files(user_id);
CREATE INDEX idx_station_resources_save ON station_resources(save_id);
CREATE INDEX idx_drone_fleet_save ON drone_fleet(save_id);
CREATE INDEX idx_research_unlocks_save ON research_unlocks(save_id);
CREATE INDEX idx_mission_history_save ON mission_history(save_id);
CREATE INDEX idx_mission_history_completed ON mission_history(completed_at DESC);

-- ─── Row Level Security ─────────────────────────────────────────
ALTER TABLE save_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE mothership_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE drone_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE captured_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE power_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_history ENABLE ROW LEVEL SECURITY;

-- Users can only access their own save data
CREATE POLICY "Users own their saves" ON save_files
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their resources" ON station_resources
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

CREATE POLICY "Users own their mothership" ON mothership_stats
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

CREATE POLICY "Users own their drones" ON drone_fleet
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

CREATE POLICY "Users own their research" ON research_unlocks
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

CREATE POLICY "Users own their leaders" ON captured_leaders
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

CREATE POLICY "Users own their power config" ON power_allocation
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

CREATE POLICY "Users own their routines" ON swarm_routines
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

CREATE POLICY "Users own their history" ON mission_history
  FOR ALL USING (save_id IN (SELECT id FROM save_files WHERE user_id = auth.uid()));

-- ─── Updated_at Trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER save_files_updated_at
  BEFORE UPDATE ON save_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
