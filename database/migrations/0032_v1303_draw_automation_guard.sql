-- v1303 card draw automation guard
CREATE TABLE IF NOT EXISTS draw_automation_guard_v1303 (
  user_id INTEGER PRIMARY KEY,
  last_request_at_ms INTEGER NOT NULL DEFAULT 0,
  short_window_started_at_ms INTEGER NOT NULL DEFAULT 0,
  short_request_count INTEGER NOT NULL DEFAULT 0,
  long_window_started_at_ms INTEGER NOT NULL DEFAULT 0,
  long_request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1303_draw_automation_guard','1',CURRENT_TIMESTAMP);
