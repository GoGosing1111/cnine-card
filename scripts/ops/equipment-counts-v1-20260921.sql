-- PIPE-0920: 장비 보유 수량 집계 테이블 (user_equipment_counts_v1)
--
-- 왜: user_equipment_instances 가 3억 2천만 행(178GB)이고 한 계정이 870만 개를 갖고 있다.
--     "장비별 몇 개"를 인스턴스에서 매번 세는 조회(연금술 목록·장비창 수량)가 그 계정에서는
--     수십 초씩 걸리고 그동안 Hyperdrive 풀 자리를 잡았다(30일 누적 DB 시간의 23%).
-- 무엇: 트리거가 INSERT/DELETE/UPDATE 마다 (user_id, equipment_id) 수량을 유지한다.
--     코드(_equipment_counts_v1.js)는 app_meta 마커 'equipment_counts_v1_ready'='1' 이 있을 때만 이 표를 읽는다.
--
-- 실행 순서 (Neon SQL Editor, 역할 neondb_owner):
--   [1] 1절: 표·함수·트리거 생성  → 이 순간부터 새 변동은 전부 반영된다.
--   [2] 2절: 경계 id 확인 후 3절 백필을 계정별로 실행(고래 계정은 1분 안팎, 전체 30~60분).
--   [3] 4절: 검증(표본 계정 몇 개 비교) → 5절: 마커 ON.
--   되돌리기: 6절.
-- 주의: 3절 백필 중에 경계 이전 행이 지워지면 그 장비 수량이 1 적게 남을 수 있다(트리거가 먼저 빼고 백필이 나중에 더한다).
--       4절 검증에서 어긋나면 그 계정만 7절(재계산)로 고친다.

-- ============================== 1. 표 · 트리거 ==============================
CREATE TABLE IF NOT EXISTS user_equipment_counts_v1(
  user_id BIGINT NOT NULL,
  equipment_id BIGINT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,equipment_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_equipment_counts_v1 TO cnine_migrator;

CREATE OR REPLACE FUNCTION fn_user_equipment_counts_ins_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_equipment_counts_v1(user_id,equipment_id,quantity)
  SELECT user_id,equipment_id,COUNT(*) FROM new_rows GROUP BY 1,2
  ON CONFLICT(user_id,equipment_id) DO UPDATE
    SET quantity=user_equipment_counts_v1.quantity+EXCLUDED.quantity,updated_at=now();
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION fn_user_equipment_counts_del_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_equipment_counts_v1(user_id,equipment_id,quantity)
  SELECT user_id,equipment_id,0 FROM old_rows GROUP BY 1,2
  ON CONFLICT(user_id,equipment_id) DO NOTHING;
  UPDATE user_equipment_counts_v1 c
    SET quantity=GREATEST(0,c.quantity-d.cnt),updated_at=now()
    FROM (SELECT user_id,equipment_id,COUNT(*) cnt FROM old_rows GROUP BY 1,2) d
    WHERE c.user_id=d.user_id AND c.equipment_id=d.equipment_id;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION fn_user_equipment_counts_upd_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- (전이 테이블 트리거는 컬럼 목록을 못 받는다) user_id/equipment_id 가 바뀐 행만 옛 키에서 빼고 새 키에 더한다.
  -- 다른 컬럼만 바뀐 UPDATE 는 아래 두 문장이 0행을 만진다.
  UPDATE user_equipment_counts_v1 c
    SET quantity=GREATEST(0,c.quantity-d.cnt),updated_at=now()
    FROM (SELECT o.user_id,o.equipment_id,COUNT(*) cnt FROM old_rows o JOIN new_rows n ON n.id=o.id
          WHERE o.user_id<>n.user_id OR o.equipment_id<>n.equipment_id GROUP BY 1,2) d
    WHERE c.user_id=d.user_id AND c.equipment_id=d.equipment_id;
  INSERT INTO user_equipment_counts_v1(user_id,equipment_id,quantity)
  SELECT n.user_id,n.equipment_id,COUNT(*) FROM new_rows n JOIN old_rows o ON o.id=n.id
    WHERE o.user_id<>n.user_id OR o.equipment_id<>n.equipment_id GROUP BY 1,2
  ON CONFLICT(user_id,equipment_id) DO UPDATE
    SET quantity=user_equipment_counts_v1.quantity+EXCLUDED.quantity,updated_at=now();
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_user_equipment_counts_ins_v1 ON user_equipment_instances;
CREATE TRIGGER trg_user_equipment_counts_ins_v1
  AFTER INSERT ON user_equipment_instances
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_user_equipment_counts_ins_v1();

DROP TRIGGER IF EXISTS trg_user_equipment_counts_del_v1 ON user_equipment_instances;
CREATE TRIGGER trg_user_equipment_counts_del_v1
  AFTER DELETE ON user_equipment_instances
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_user_equipment_counts_del_v1();

DROP TRIGGER IF EXISTS trg_user_equipment_counts_upd_v1 ON user_equipment_instances;
CREATE TRIGGER trg_user_equipment_counts_upd_v1
  AFTER UPDATE ON user_equipment_instances
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION fn_user_equipment_counts_upd_v1();

-- ============================== 2. 경계 id ==============================
-- 트리거가 생긴 "뒤"에 들어온 행은 트리거가 이미 셌다. 백필은 이 값 이하만 센다.
-- 결과를 적어 두고 3절의 :boundary 자리에 넣는다.
SELECT COALESCE(MAX(id),0) AS boundary FROM user_equipment_instances;

-- ============================== 3. 백필 (계정별) ==============================
-- 인스턴스를 가진 계정은 268개 정도다. 한 번에 한 계정씩 실행한다(고래 계정은 1분 안팎).
-- 아래 DO 블록은 users 표 순서대로 전부 돈다. 중간에 끊겨도 다시 실행하면 이어서 한다
-- (완료한 계정은 app_meta 'equipment_counts_v1_backfill:<user_id>' 로 표시).
--   :boundary 를 2절 값으로 바꾼 뒤 실행.
DO $$
DECLARE
  boundary BIGINT := :boundary;
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM users ORDER BY id LOOP
    IF EXISTS (SELECT 1 FROM app_meta WHERE key='equipment_counts_v1_backfill:'||u.id) THEN CONTINUE; END IF;
    INSERT INTO user_equipment_counts_v1(user_id,equipment_id,quantity)
    SELECT user_id,equipment_id,COUNT(*) FROM user_equipment_instances
    WHERE user_id=u.id AND id<=boundary GROUP BY 1,2
    ON CONFLICT(user_id,equipment_id) DO UPDATE
      SET quantity=user_equipment_counts_v1.quantity+EXCLUDED.quantity,updated_at=now();
    INSERT INTO app_meta(key,value,updated_at) VALUES('equipment_counts_v1_backfill:'||u.id,'1',now()::text)
    ON CONFLICT(key) DO UPDATE SET value='1';
    COMMIT;
  END LOOP;
END $$;

-- ============================== 4. 검증 ==============================
-- 표본 계정(예: 1, 4774, 4965)에서 실제 집계와 표를 비교한다. 0행이 나와야 한다.
-- SELECT * FROM (
--   SELECT user_id,equipment_id,COUNT(*) real_qty FROM user_equipment_instances WHERE user_id IN (1,4774,4965) GROUP BY 1,2
-- ) r FULL JOIN user_equipment_counts_v1 c USING (user_id,equipment_id)
-- WHERE c.user_id IN (1,4774,4965) AND COALESCE(r.real_qty,0)<>COALESCE(c.quantity,0);

-- ============================== 5. 마커 ON ==============================
-- INSERT INTO app_meta(key,value,updated_at) VALUES('equipment_counts_v1_ready','1',now()::text)
-- ON CONFLICT(key) DO UPDATE SET value='1',updated_at=now()::text;
-- 코드는 마커를 최대 15초 캐시하므로 그 뒤부터 집계 표를 읽는다.

-- ============================== 6. 되돌리기 ==============================
-- UPDATE app_meta SET value='0' WHERE key='equipment_counts_v1_ready';   -- 코드가 60초 안에 예전 쿼리로 돌아간다
-- DROP TRIGGER IF EXISTS trg_user_equipment_counts_ins_v1 ON user_equipment_instances;
-- DROP TRIGGER IF EXISTS trg_user_equipment_counts_del_v1 ON user_equipment_instances;
-- DROP TRIGGER IF EXISTS trg_user_equipment_counts_upd_v1 ON user_equipment_instances;

-- ============================== 7. 한 계정 재계산 ==============================
-- DELETE FROM user_equipment_counts_v1 WHERE user_id=:u;
-- INSERT INTO user_equipment_counts_v1(user_id,equipment_id,quantity)
-- SELECT user_id,equipment_id,COUNT(*) FROM user_equipment_instances WHERE user_id=:u GROUP BY 1,2;
