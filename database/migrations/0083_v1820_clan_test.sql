-- V1820 clan system foundation (D1 fallback / local development)
-- Runtime exposure stays controlled by app_meta.clan_settings_v1 = TEST.

CREATE TABLE IF NOT EXISTS clan_seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_no INTEGER NOT NULL UNIQUE,
  phase TEXT NOT NULL DEFAULT 'REGISTRATION',
  max_members INTEGER NOT NULL DEFAULT 20,
  registration_ends_at TEXT NOT NULL,
  draft_ends_at TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  draft_pick_count INTEGER NOT NULL DEFAULT 0,
  next_pick_deadline TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clan_organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  mark_key TEXT NOT NULL DEFAULT 'SHIELD',
  primary_color TEXT NOT NULL DEFAULT '#31d7e8',
  accent_color TEXT NOT NULL DEFAULT '#e4f8ff',
  slogan TEXT NOT NULL DEFAULT '',
  trophies INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clan_season_teams (
  season_id INTEGER NOT NULL,
  clan_id INTEGER NOT NULL,
  master_user_id INTEGER NOT NULL,
  draft_position INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (season_id, clan_id),
  UNIQUE (season_id, master_user_id),
  UNIQUE (season_id, draft_position)
);

CREATE TABLE IF NOT EXISTS clan_draft_pool (
  season_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  candidate_key TEXT NOT NULL,
  preferred_role TEXT NOT NULL DEFAULT 'BALANCED',
  activity_window TEXT NOT NULL DEFAULT 'EVENING',
  activity_score INTEGER NOT NULL DEFAULT 0,
  rank_score INTEGER NOT NULL DEFAULT 0,
  contribution_score INTEGER NOT NULL DEFAULT 0,
  reliability_score INTEGER NOT NULL DEFAULT 0,
  master_score INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  rank_band TEXT NOT NULL DEFAULT 'UNRANKED',
  activity_band TEXT NOT NULL DEFAULT 'NEW',
  deck_snapshot TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  drafted_clan_id INTEGER,
  pick_no INTEGER,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (season_id, user_id),
  UNIQUE (season_id, candidate_key)
);

CREATE TABLE IF NOT EXISTS clan_members (
  season_id INTEGER NOT NULL,
  clan_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  member_role TEXT NOT NULL DEFAULT 'MEMBER',
  preferred_role TEXT NOT NULL DEFAULT 'BALANCED',
  draft_pick_no INTEGER NOT NULL DEFAULT 0,
  contribution_score INTEGER NOT NULL DEFAULT 0,
  battle_wins INTEGER NOT NULL DEFAULT 0,
  battle_losses INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (season_id, user_id),
  UNIQUE (season_id, clan_id, user_id)
);

CREATE TABLE IF NOT EXISTS clan_wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  round_no INTEGER NOT NULL DEFAULT 1,
  clan_a_id INTEGER NOT NULL,
  clan_b_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  battle_count INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  winner_clan_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (season_id, round_no, clan_a_id, clan_b_id)
);

CREATE TABLE IF NOT EXISTS clan_war_battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  season_id INTEGER NOT NULL,
  war_id INTEGER NOT NULL,
  attacker_clan_id INTEGER NOT NULL,
  defender_clan_id INTEGER NOT NULL,
  attacker_user_id INTEGER NOT NULL,
  defender_user_id INTEGER NOT NULL,
  battle_seed INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  winner_clan_id INTEGER,
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clan_season_settlements (
  season_id INTEGER PRIMARY KEY,
  champion_clan_id INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING',
  processing_token TEXT,
  reward_status TEXT NOT NULL DEFAULT 'DISABLED_TEST',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS clan_draft_locks (
  season_id INTEGER PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clan_pool_status ON clan_draft_pool(season_id, status, total_score DESC, user_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_team ON clan_members(season_id, clan_id, draft_pick_no, user_id);
CREATE INDEX IF NOT EXISTS idx_clan_teams_rank ON clan_season_teams(season_id, score DESC, wins DESC, clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_wars_team_a ON clan_wars(season_id, clan_a_id, status);
CREATE INDEX IF NOT EXISTS idx_clan_wars_team_b ON clan_wars(season_id, clan_b_id, status);
CREATE INDEX IF NOT EXISTS idx_clan_battles_cleanup ON clan_war_battles(status, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_clan_settlements_status ON clan_season_settlements(status, updated_at, season_id);

INSERT OR IGNORE INTO app_meta(key, value, updated_at)
VALUES ('clan_settings_v1', '{"mode":"TEST"}', CURRENT_TIMESTAMP);
