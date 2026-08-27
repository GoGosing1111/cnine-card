-- V1883 · Monster Siege AI warfare and alliance fortress front.
ALTER TABLE monster_siege_events ADD COLUMN alliance_hp INTEGER NOT NULL DEFAULT 20000000;
ALTER TABLE monster_siege_events ADD COLUMN alliance_max_hp INTEGER NOT NULL DEFAULT 20000000;
ALTER TABLE monster_siege_events ADD COLUMN monster_ai_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monster_siege_events ADD COLUMN next_monster_action_at TEXT;
ALTER TABLE monster_siege_events ADD COLUMN last_monster_action_at TEXT;
ALTER TABLE monster_siege_events ADD COLUMN monster_effect_code TEXT NOT NULL DEFAULT '';
ALTER TABLE monster_siege_events ADD COLUMN monster_effect_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monster_siege_events ADD COLUMN monster_effect_ends_at TEXT;

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
