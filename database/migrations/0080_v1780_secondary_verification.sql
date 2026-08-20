-- V1780: mutually-exclusive WAGO / PLAYDK secondary verification.
CREATE TABLE IF NOT EXISTS user_second_verifications (
  user_id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('WAGO','PLAYDK')),
  provider_user_id TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_second_verifications_provider
  ON user_second_verifications(provider, verified_at);

INSERT OR IGNORE INTO user_second_verifications(user_id,provider,provider_user_id,provider_name,verified_at,updated_at)
SELECT user_id,
       'WAGO',
       CASE WHEN TRIM(COALESCE(wago_member_no,''))<>'' THEN TRIM(wago_member_no) ELSE 'LEGACY:'||user_id END,
       COALESCE(wago_nickname,''),
       COALESCE(verified_at,CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP
  FROM wago_verifications
 WHERE status='VERIFIED';

CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_guard_v1780
BEFORE UPDATE OF status ON wago_verifications
FOR EACH ROW
WHEN NEW.status='VERIFIED' AND COALESCE(OLD.status,'')<>'VERIFIED'
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM user_second_verifications
     WHERE user_id=NEW.user_id AND provider<>'WAGO'
  ) THEN RAISE(ABORT,'SECONDARY_VERIFICATION_PROVIDER_CONFLICT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_insert_guard_v1780
BEFORE INSERT ON wago_verifications
FOR EACH ROW
WHEN NEW.status='VERIFIED'
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM user_second_verifications
     WHERE user_id=NEW.user_id AND provider<>'WAGO'
  ) THEN RAISE(ABORT,'SECONDARY_VERIFICATION_PROVIDER_CONFLICT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_claim_v1780
AFTER UPDATE OF status ON wago_verifications
FOR EACH ROW
WHEN NEW.status='VERIFIED' AND COALESCE(OLD.status,'')<>'VERIFIED'
BEGIN
  INSERT INTO user_second_verifications(user_id,provider,provider_user_id,provider_name,verified_at,updated_at)
  VALUES(
    NEW.user_id,
    'WAGO',
    CASE WHEN TRIM(COALESCE(NEW.wago_member_no,''))<>'' THEN TRIM(NEW.wago_member_no) ELSE 'LEGACY:'||NEW.user_id END,
    COALESCE(NEW.wago_nickname,''),
    COALESCE(NEW.verified_at,CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_insert_claim_v1780
AFTER INSERT ON wago_verifications
FOR EACH ROW
WHEN NEW.status='VERIFIED'
BEGIN
  INSERT INTO user_second_verifications(user_id,provider,provider_user_id,provider_name,verified_at,updated_at)
  VALUES(
    NEW.user_id,
    'WAGO',
    CASE WHEN TRIM(COALESCE(NEW.wago_member_no,''))<>'' THEN TRIM(NEW.wago_member_no) ELSE 'LEGACY:'||NEW.user_id END,
    COALESCE(NEW.wago_nickname,''),
    COALESCE(NEW.verified_at,CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_release_v1780
AFTER UPDATE OF status ON wago_verifications
FOR EACH ROW
WHEN OLD.status='VERIFIED' AND COALESCE(NEW.status,'')<>'VERIFIED'
BEGIN
  DELETE FROM user_second_verifications WHERE user_id=OLD.user_id AND provider='WAGO';
END;
