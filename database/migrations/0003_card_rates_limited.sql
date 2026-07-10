-- CNINE Card v3: MA/FUR, per-card weight, limited editions
PRAGMA foreign_keys=OFF;
PRAGMA legacy_alter_table=ON;
ALTER TABLE cards RENAME TO cards_legacy;
CREATE TABLE cards (
 id TEXT PRIMARY KEY, member_id INTEGER NOT NULL, title TEXT NOT NULL,
 rarity TEXT NOT NULL CHECK (rarity IN ('C','U','R','SR','HR','UR','SSR','MA','FUR')),
 image_url TEXT NOT NULL, focus_x INTEGER NOT NULL DEFAULT 50, focus_y INTEGER NOT NULL DEFAULT 50,
 is_active INTEGER NOT NULL DEFAULT 1, draw_weight REAL NOT NULL DEFAULT 1,
 limited_total INTEGER, issued_count INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(member_id) REFERENCES members(id)
);
INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,created_by,created_at,updated_at)
SELECT id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,created_by,created_at,updated_at FROM cards_legacy;
DROP TABLE cards_legacy;
CREATE INDEX IF NOT EXISTS idx_cards_member ON cards(member_id,rarity);
PRAGMA legacy_alter_table=OFF;
PRAGMA foreign_keys=ON;
