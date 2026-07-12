-- v9.0.8 PvE deck save (Safe Migration)
CREATE TABLE IF NOT EXISTS pve_decks (
  user_id INTEGER PRIMARY KEY,
  card_ids TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pve_decks_updated ON pve_decks(updated_at);
