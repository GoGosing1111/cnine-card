-- V1830: OWNER 테스트용 5구간 PVE 호송작전.
-- 전투 타임라인은 저장하지 않고 구간 요약과 지급 영수증만 보존한다.
CREATE TABLE IF NOT EXISTS pve_escort_runs_v1830 (
  run_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  week_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  sector_index INTEGER NOT NULL DEFAULT 0,
  vehicle_hp INTEGER NOT NULL,
  vehicle_max_hp INTEGER NOT NULL,
  deck_snapshot TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  reward_coin INTEGER NOT NULL DEFAULT 0,
  reward_shards INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  claimed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pve_escort_active_user_v1830
  ON pve_escort_runs_v1830(user_id)
  WHERE status IN ('ACTIVE','COMPLETED_PENDING','CLAIMING');
CREATE INDEX IF NOT EXISTS idx_pve_escort_runs_user_v1830
  ON pve_escort_runs_v1830(user_id,started_at DESC);

CREATE TABLE IF NOT EXISTS pve_escort_weekly_v1830 (
  user_id INTEGER NOT NULL,
  week_key TEXT NOT NULL,
  started_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  reward_count INTEGER NOT NULL DEFAULT 0,
  best_vehicle_hp_percent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,week_key),
  FOREIGN KEY(user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS pve_escort_action_receipts_v1830 (
  request_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  run_id TEXT,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  response_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(run_id) REFERENCES pve_escort_runs_v1830(run_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_pve_escort_receipts_user_v1830
  ON pve_escort_action_receipts_v1830(user_id,created_at DESC);

INSERT INTO app_meta(key,value)
VALUES('escort_operation_settings_v1830','{"mode":"TEST","title":"철벽 호송작전","description":"5개 전선을 돌파해 장갑 수송차를 목적지까지 호위하십시오.","vehicleMaxHp":10000,"weeklyRunLimit":10,"weeklyRewardLimit":3,"baseCoin":2500000,"baseShards":250,"repairPercent":20}')
ON CONFLICT(key) DO NOTHING;
