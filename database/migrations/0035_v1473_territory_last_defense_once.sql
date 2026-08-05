CREATE TABLE IF NOT EXISTS territory_war_v3_last_defense_uses (
  round_id INTEGER NOT NULL,
  side TEXT NOT NULL,
  front_id INTEGER,
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(round_id,side)
);

-- 진행 중이거나 과거인 회차의 최초 발동 기록을 복구해 재방문 발동을 방지한다.
INSERT OR IGNORE INTO territory_war_v3_last_defense_uses(round_id,side,front_id,activated_at)
SELECT round_id,last_defense_side,id,COALESCE(started_at,created_at,CURRENT_TIMESTAMP)
FROM territory_war_v3_fronts
WHERE last_defense_side IN ('A','B')
ORDER BY sequence ASC;

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1473_territory_last_defense_once','1',CURRENT_TIMESTAMP);
