-- CNINE Card v8.2: 한정판 독립 등급 및 전체 발행량 5장
PRAGMA foreign_keys=OFF;
PRAGMA legacy_alter_table=ON;
ALTER TABLE cards RENAME TO cards_legacy;
CREATE TABLE cards (
 id TEXT PRIMARY KEY, member_id INTEGER NOT NULL, title TEXT NOT NULL,
 rarity TEXT NOT NULL CHECK (rarity IN ('C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED')),
 image_url TEXT NOT NULL, focus_x INTEGER NOT NULL DEFAULT 50, focus_y INTEGER NOT NULL DEFAULT 50,
 is_active INTEGER NOT NULL DEFAULT 1, draw_weight REAL NOT NULL DEFAULT 1,
 limited_total INTEGER, issued_count INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(member_id) REFERENCES members(id)
);
INSERT INTO cards SELECT * FROM cards_legacy;
DROP TABLE cards_legacy;
CREATE INDEX IF NOT EXISTS idx_cards_member ON cards(member_id,rarity);
UPDATE cards SET rarity='LIMITED', limited_total=CASE WHEN issued_count>5 THEN issued_count ELSE 5 END
WHERE id BETWEEN 'card-0416' AND 'card-0433';
PRAGMA legacy_alter_table=OFF;
PRAGMA foreign_keys=ON;
