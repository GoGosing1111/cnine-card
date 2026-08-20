CREATE TABLE IF NOT EXISTS pvp_battle_audits_v1781(
  attacker_id INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  defender_id INTEGER NOT NULL,
  winner_id INTEGER NOT NULL,
  winner_side TEXT NOT NULL,
  result_reason TEXT NOT NULL DEFAULT '',
  original_reason TEXT NOT NULL DEFAULT '',
  battle_seed INTEGER NOT NULL DEFAULT 0,
  attacker_survivors INTEGER NOT NULL DEFAULT 0,
  defender_survivors INTEGER NOT NULL DEFAULT 0,
  attacker_hp_percent REAL NOT NULL DEFAULT 0,
  defender_hp_percent REAL NOT NULL DEFAULT 0,
  action_count INTEGER NOT NULL DEFAULT 0,
  final_state_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(attacker_id,request_id)
);

CREATE INDEX IF NOT EXISTS idx_pvp_battle_audits_users_v1781
  ON pvp_battle_audits_v1781(attacker_id,defender_id,created_at DESC);

UPDATE character_titles
SET style_preset='CRIMSON',updated_at=CURRENT_TIMESTAMP
WHERE code='TITLE_RANKED_GAMBLER';
