-- V1811 territory warfare command channel.
-- Command authority is derived from the live contribution leaderboard, so no
-- mutable commander row is stored. Only the audited battlefield broadcasts
-- need persistence.
CREATE TABLE IF NOT EXISTS territory_war_v3_command_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  side TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_twv3_command_messages_round
  ON territory_war_v3_command_messages(round_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_twv3_command_messages_sender
  ON territory_war_v3_command_messages(round_id, user_id, id DESC);
