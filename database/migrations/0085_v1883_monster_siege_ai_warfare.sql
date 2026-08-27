-- V1886 · Monster Siege AI warfare uses a companion state table so the
-- restricted PostgreSQL runtime role never needs ownership of the legacy
-- monster_siege_events table.
CREATE TABLE IF NOT EXISTS monster_siege_ai_state(
  event_id INTEGER PRIMARY KEY,
  alliance_hp INTEGER NOT NULL DEFAULT 20000000,
  alliance_max_hp INTEGER NOT NULL DEFAULT 20000000,
  monster_ai_sequence INTEGER NOT NULL DEFAULT 0,
  next_monster_action_at TEXT,
  last_monster_action_at TEXT,
  monster_effect_code TEXT NOT NULL DEFAULT '',
  monster_effect_percent INTEGER NOT NULL DEFAULT 0,
  monster_effect_ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monster_siege_ai_actions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  phase_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  skill_code TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  damage INTEGER NOT NULL DEFAULT 0,
  healing INTEGER NOT NULL DEFAULT 0,
  ticks INTEGER NOT NULL DEFAULT 1,
  alliance_hp_before INTEGER NOT NULL,
  alliance_hp_after INTEGER NOT NULL,
  phase_hp_before INTEGER NOT NULL,
  phase_hp_after INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,sequence)
);

CREATE INDEX IF NOT EXISTS idx_monster_siege_ai_feed
  ON monster_siege_ai_actions(event_id,id DESC);
