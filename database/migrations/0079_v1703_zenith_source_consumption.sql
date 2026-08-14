ALTER TABLE card_evolution_logs ADD COLUMN source_quantity_before INTEGER;
ALTER TABLE card_evolution_logs ADD COLUMN source_quantity_after INTEGER;

CREATE TABLE IF NOT EXISTS card_evolution_source_repairs_v1703 (
  user_id INTEGER NOT NULL,
  source_card_id TEXT NOT NULL,
  evolution_log_id INTEGER NOT NULL,
  quantity_before_repair INTEGER NOT NULL,
  breakthrough_level_before_repair INTEGER NOT NULL,
  last_obtained_at_before_repair TEXT,
  repaired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, source_card_id)
);

INSERT OR IGNORE INTO card_evolution_source_repairs_v1703(
  user_id,source_card_id,evolution_log_id,quantity_before_repair,
  breakthrough_level_before_repair,last_obtained_at_before_repair
)
WITH latest_success AS (
  SELECT user_id,source_card_id,MAX(id) AS evolution_log_id,MAX(created_at) AS success_at
  FROM card_evolution_logs
  WHERE evolution_type='LIMITED_TO_ZENITH' AND is_success=1 AND source_consumed=1
  GROUP BY user_id,source_card_id
)
SELECT ls.user_id,ls.source_card_id,ls.evolution_log_id,uc.quantity,
       uc.breakthrough_level,uc.last_obtained_at
FROM latest_success ls
JOIN user_cards uc ON uc.user_id=ls.user_id AND uc.card_id=ls.source_card_id
WHERE uc.quantity>0
  AND uc.breakthrough_level>=13
  AND uc.last_obtained_at<=ls.success_at
  AND NOT EXISTS (
    SELECT 1 FROM draw_logs d
    WHERE d.user_id=ls.user_id AND d.card_id=ls.source_card_id AND d.created_at>ls.success_at
  );

UPDATE pve_decks
SET card_ids=COALESCE((
      SELECT json_group_array(j.value)
      FROM json_each(pve_decks.card_ids) j
      WHERE CAST(j.value AS TEXT) NOT IN (
        SELECT r.source_card_id FROM card_evolution_source_repairs_v1703 r
        WHERE r.user_id=pve_decks.user_id
      )
    ),'[]'),
    updated_at=CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM card_evolution_source_repairs_v1703 r,json_each(pve_decks.card_ids) j
  WHERE r.user_id=pve_decks.user_id AND CAST(j.value AS TEXT)=r.source_card_id
);

UPDATE pvp_decks
SET card_ids=COALESCE((
      SELECT json_group_array(j.value)
      FROM json_each(pvp_decks.card_ids) j
      WHERE CAST(j.value AS TEXT) NOT IN (
        SELECT r.source_card_id FROM card_evolution_source_repairs_v1703 r
        WHERE r.user_id=pvp_decks.user_id
      )
    ),'[]'),
    updated_at=CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM card_evolution_source_repairs_v1703 r,json_each(pvp_decks.card_ids) j
  WHERE r.user_id=pvp_decks.user_id AND CAST(j.value AS TEXT)=r.source_card_id
);

UPDATE pvp_deck_presets
SET card_ids=COALESCE((
      SELECT json_group_array(j.value)
      FROM json_each(pvp_deck_presets.card_ids) j
      WHERE CAST(j.value AS TEXT) NOT IN (
        SELECT r.source_card_id FROM card_evolution_source_repairs_v1703 r
        WHERE r.user_id=pvp_deck_presets.user_id
      )
    ),'[]'),
    updated_at=CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM card_evolution_source_repairs_v1703 r,json_each(pvp_deck_presets.card_ids) j
  WHERE r.user_id=pvp_deck_presets.user_id AND CAST(j.value AS TEXT)=r.source_card_id
);

UPDATE user_cards
SET quantity=0,breakthrough_level=0,last_obtained_at=CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM card_evolution_source_repairs_v1703 r
  WHERE r.user_id=user_cards.user_id AND r.source_card_id=user_cards.card_id
);

UPDATE card_evolution_logs
SET source_quantity_before=COALESCE((
      SELECT r.quantity_before_repair+1
      FROM card_evolution_source_repairs_v1703 r
      WHERE r.evolution_log_id=card_evolution_logs.id
    ),source_quantity_before),
    source_quantity_after=0
WHERE evolution_type='LIMITED_TO_ZENITH' AND is_success=1 AND source_consumed=1;

INSERT INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1703_evolution_source_consumption','1',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP;
