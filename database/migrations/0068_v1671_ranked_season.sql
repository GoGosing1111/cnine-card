CREATE TABLE IF NOT EXISTS pvp_ranked_match_tickets_v1671(
  token TEXT PRIMARY KEY,
  attacker_id INTEGER NOT NULL,
  defender_id INTEGER NOT NULL,
  season_key TEXT NOT NULL,
  attacker_score INTEGER NOT NULL,
  defender_score INTEGER NOT NULL,
  attacker_power INTEGER NOT NULL DEFAULT 0,
  defender_power INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pvp_ranked_ticket_attacker ON pvp_ranked_match_tickets_v1671(attacker_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_ranked_ticket_active ON pvp_ranked_match_tickets_v1671(attacker_id,season_key) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS pvp_season_title_grants_v1671(
  settlement_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title_id INTEGER NOT NULL,
  season_key TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  PRIMARY KEY(settlement_id,user_id,title_id)
);
CREATE INDEX IF NOT EXISTS idx_pvp_season_title_active ON pvp_season_title_grants_v1671(user_id,expires_at,revoked_at);

CREATE TABLE IF NOT EXISTS pvp_season_lifecycle_lock_v1671(
  lock_key TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  lease_until_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
