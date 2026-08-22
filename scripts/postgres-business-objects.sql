-- cnine-card D1(SQLite) 업무 트리거/뷰의 PostgreSQL 구현
-- 실행 순서: pg-schema.sql -> COPY data -> pg-post-data.sql -> 이 파일 -> FK validate
-- 데이터 적재 뒤에만 실행한다. COPY 중 과거 데이터에 트리거가 재적용되면 안 된다.
\set ON_ERROR_STOP on

BEGIN;

-- SQLite datetime(text)의 운영 포맷을 유지한다.
CREATE OR REPLACE FUNCTION sqlite_datetime_text(value text)
RETURNS text
LANGUAGE sql
STABLE
STRICT
AS $$
  SELECT CASE
    WHEN value ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
      THEN to_char(value::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
    ELSE to_char(value::timestamp without time zone, 'YYYY-MM-DD HH24:MI:SS')
  END
$$;

-- 1) 신규 장비는 공급 드롭 풀에 자동 노출하지 않는다.
CREATE OR REPLACE FUNCTION fn_new_equipment_drop_quarantine_v1490()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.supply_enabled := 0;
  NEW.supply_weight := 0;
  NEW.updated_at := sqlite_now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_new_equipment_drop_quarantine_v1490
  ON character_equipment_items;
CREATE TRIGGER trg_new_equipment_drop_quarantine_v1490
BEFORE INSERT ON character_equipment_items
FOR EACH ROW EXECUTE FUNCTION fn_new_equipment_drop_quarantine_v1490();

-- 2) 경매 시작/종료 시각을 SQLite와 같은 UTC TEXT 형식으로 정규화한다.
CREATE OR REPLACE FUNCTION fn_auctions_v1553_normalize_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.starts_at := sqlite_datetime_text(NEW.starts_at);
  NEW.ends_at := sqlite_datetime_text(NEW.ends_at);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_auctions_v1553_normalize_dates ON auctions_v1553;
CREATE TRIGGER trg_auctions_v1553_normalize_dates
BEFORE INSERT ON auctions_v1553
FOR EACH ROW EXECUTE FUNCTION fn_auctions_v1553_normalize_dates();

-- 3) 운영 코인 지급은 사용자 잔액, 지급 원장, 코인 로그를 한 트랜잭션으로 묶는다.
CREATE OR REPLACE FUNCTION fn_operational_coin_grant_apply_v1721()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance bigint;
BEGIN
  UPDATE users
     SET coin = coin + NEW.amount
   WHERE id = NEW.user_id
   RETURNING coin INTO new_balance;

  IF FOUND THEN
    UPDATE operational_coin_grants_v1721
       SET coin_after = new_balance
     WHERE campaign_key = NEW.campaign_key
       AND user_id = NEW.user_id;

    INSERT INTO coin_logs(user_id, change_amount, balance_after, reason, admin_id)
    VALUES(NEW.user_id, NEW.amount, new_balance, NEW.reason, NULL);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_operational_coin_grant_apply_v1721
  ON operational_coin_grants_v1721;
CREATE TRIGGER trg_operational_coin_grant_apply_v1721
AFTER INSERT ON operational_coin_grants_v1721
FOR EACH ROW EXECUTE FUNCTION fn_operational_coin_grant_apply_v1721();

-- 4) 완료/삭제된 뽑기 요청의 활성 락을 반드시 해제한다.
CREATE OR REPLACE FUNCTION fn_draw_active_lock_release_v1480()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM draw_active_lock_v1480
     WHERE user_id = OLD.user_id AND request_id = OLD.request_id;
    RETURN OLD;
  END IF;

  DELETE FROM draw_active_lock_v1480
   WHERE user_id = NEW.user_id AND request_id = NEW.request_id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_draw_active_lock_release_v1480
  ON draw_request_receipts_v2;
CREATE TRIGGER trg_draw_active_lock_release_v1480
AFTER UPDATE OF status ON draw_request_receipts_v2
FOR EACH ROW
WHEN (NEW.status <> 'PENDING')
EXECUTE FUNCTION fn_draw_active_lock_release_v1480();

DROP TRIGGER IF EXISTS trg_draw_active_lock_delete_v1480
  ON draw_request_receipts_v2;
CREATE TRIGGER trg_draw_active_lock_delete_v1480
AFTER DELETE ON draw_request_receipts_v2
FOR EACH ROW EXECUTE FUNCTION fn_draw_active_lock_release_v1480();

-- 5) 한 계정은 WAGO와 PLAYDK 중 하나의 2차 인증 공급자만 가질 수 있다.
CREATE OR REPLACE FUNCTION fn_wago_secondary_provider_guard_v1780()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM user_second_verifications
     WHERE user_id = NEW.user_id
       AND provider <> 'WAGO'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'SECONDARY_VERIFICATION_PROVIDER_CONFLICT';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_wago_secondary_provider_guard_v1780
  ON wago_verifications;
CREATE TRIGGER trg_wago_secondary_provider_guard_v1780
BEFORE UPDATE OF status ON wago_verifications
FOR EACH ROW
WHEN (NEW.status = 'VERIFIED' AND COALESCE(OLD.status, '') <> 'VERIFIED')
EXECUTE FUNCTION fn_wago_secondary_provider_guard_v1780();

DROP TRIGGER IF EXISTS trg_wago_secondary_provider_insert_guard_v1780
  ON wago_verifications;
CREATE TRIGGER trg_wago_secondary_provider_insert_guard_v1780
BEFORE INSERT ON wago_verifications
FOR EACH ROW
WHEN (NEW.status = 'VERIFIED')
EXECUTE FUNCTION fn_wago_secondary_provider_guard_v1780();

CREATE OR REPLACE FUNCTION fn_wago_secondary_provider_claim_v1780()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_second_verifications(
    user_id, provider, provider_user_id, provider_name, verified_at, updated_at
  ) VALUES (
    NEW.user_id,
    'WAGO',
    CASE
      WHEN trim(COALESCE(NEW.wago_member_no, '')) <> ''
        THEN trim(NEW.wago_member_no)
      ELSE 'LEGACY:' || NEW.user_id::text
    END,
    COALESCE(NEW.wago_nickname, ''),
    COALESCE(NEW.verified_at, sqlite_now()),
    sqlite_now()
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_wago_secondary_provider_claim_v1780
  ON wago_verifications;
CREATE TRIGGER trg_wago_secondary_provider_claim_v1780
AFTER UPDATE OF status ON wago_verifications
FOR EACH ROW
WHEN (NEW.status = 'VERIFIED' AND COALESCE(OLD.status, '') <> 'VERIFIED')
EXECUTE FUNCTION fn_wago_secondary_provider_claim_v1780();

DROP TRIGGER IF EXISTS trg_wago_secondary_provider_insert_claim_v1780
  ON wago_verifications;
CREATE TRIGGER trg_wago_secondary_provider_insert_claim_v1780
AFTER INSERT ON wago_verifications
FOR EACH ROW
WHEN (NEW.status = 'VERIFIED')
EXECUTE FUNCTION fn_wago_secondary_provider_claim_v1780();

CREATE OR REPLACE FUNCTION fn_wago_secondary_provider_release_v1780()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM user_second_verifications
   WHERE user_id = OLD.user_id AND provider = 'WAGO';
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_wago_secondary_provider_release_v1780
  ON wago_verifications;
CREATE TRIGGER trg_wago_secondary_provider_release_v1780
AFTER UPDATE OF status ON wago_verifications
FOR EACH ROW
WHEN (OLD.status = 'VERIFIED' AND COALESCE(NEW.status, '') <> 'VERIFIED')
EXECUTE FUNCTION fn_wago_secondary_provider_release_v1780();

-- 6) 경매 입찰 구간별 BGM 이벤트를 1회 계산해 원자적으로 반영한다.
CREATE OR REPLACE FUNCTION fn_auction_bgm_v1555()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bid_delta bigint;
  selected_url text;
  selected_duration bigint;
BEGIN
  bid_delta := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.total_bid
    ELSE NEW.total_bid - OLD.total_bid
  END;

  SELECT r.bgm_url,
         LEAST(60::bigint, GREATEST(1::bigint, r.bgm_duration))
    INTO selected_url, selected_duration
    FROM auction_bgm_rules_v1554 AS r
   WHERE r.auction_id = 0
     AND bid_delta >= r.min_bid
     AND (r.max_bid = 0 OR bid_delta <= r.max_bid)
   ORDER BY r.sort_order, r.min_bid DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE auctions_v1553
       SET bgm_url = selected_url,
           bgm_duration = selected_duration,
           bgm_event_seq = bgm_event_seq + 1,
           bgm_event_at = sqlite_now(),
           bgm_event_until = sqlite_now(make_interval(secs => selected_duration::double precision)),
           version = version + 1,
           updated_at = sqlite_now()
     WHERE id = NEW.auction_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_auction_bgm_insert_v1555 ON auction_bidders_v1553;
CREATE TRIGGER trg_auction_bgm_insert_v1555
AFTER INSERT ON auction_bidders_v1553
FOR EACH ROW EXECUTE FUNCTION fn_auction_bgm_v1555();

DROP TRIGGER IF EXISTS trg_auction_bgm_update_v1555 ON auction_bidders_v1553;
CREATE TRIGGER trg_auction_bgm_update_v1555
AFTER UPDATE OF total_bid ON auction_bidders_v1553
FOR EACH ROW EXECUTE FUNCTION fn_auction_bgm_v1555();

-- 7) 런타임에서 참조하는 카드 유효 등급 뷰.
CREATE OR REPLACE VIEW cards_effective_v1210 AS
SELECT
  id,
  member_id,
  title,
  COALESCE(NULLIF(rarity_override, ''), rarity) AS rarity,
  image_url,
  focus_x,
  focus_y,
  is_active,
  created_by,
  created_at,
  updated_at,
  power_type,
  base_power,
  draw_weight,
  limited_total,
  issued_count,
  card_status,
  batch_name,
  batch_date,
  rarity AS storage_rarity,
  rarity_override
FROM cards;

COMMIT;
