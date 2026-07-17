-- v1029 session recovery: remove the disruptive per-user unique index.
-- Existing sessions are not deleted. New logins replace prior sessions in application code.
DROP INDEX IF EXISTS idx_sessions_single_user;
INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1029_session_recovery','1',CURRENT_TIMESTAMP);
