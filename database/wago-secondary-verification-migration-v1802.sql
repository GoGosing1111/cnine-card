-- ============================================================
-- V1802 · 와이고수 2차 인증 → PLAY DK 전환
--
--   1단계  명단 스냅샷 (DB 안에 영구 보존)
--   2단계  이벤트 지급용 명단 추출
--   3단계  전환 준비 점검  ★ 반드시 확인
--   4단계  와이고수 인증 일괄 해제
--   5단계  해제 결과 확인
--   6단계  되돌리기 (필요할 때만)
--
-- 실행 방법
--   Cloudflare 대시보드 → D1 → cnine-card-db → Console
--   ※ 한 단계씩 잘라서 붙여넣으세요. 통째로 실행하지 마세요.
--
-- ⚠️ 4단계는 되돌릴 수 있지만, 1단계를 건너뛰면 명단이 사라집니다.
--    반드시 1 → 2 → 3 순서로 확인한 뒤 4단계를 실행하세요.
-- ============================================================


-- ============================================================
-- [1단계] 명단 스냅샷 — 가장 먼저, 딱 한 번만
--
--   해제하면 원본 기록이 지워지므로 별도 표에 먼저 복사해 둡니다.
--   이미 스냅샷이 있으면 아무 일도 하지 않습니다(두 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS wago_verified_snapshot_v1802 (
  user_id          INTEGER PRIMARY KEY,
  game_nickname    TEXT,
  user_status      TEXT,
  user_role        TEXT,
  wago_member_no   TEXT,
  wago_nickname    TEXT,
  verified_at      TEXT,
  wago_row_id      INTEGER,
  snapshot_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO wago_verified_snapshot_v1802
  (user_id,game_nickname,user_status,user_role,wago_member_no,wago_nickname,verified_at,wago_row_id)
SELECT s.user_id, u.nickname, u.status, u.role,
       s.provider_user_id, s.provider_name, s.verified_at, w.id
FROM user_second_verifications s
JOIN users u ON u.id = s.user_id
LEFT JOIN wago_verifications w ON w.user_id = s.user_id AND w.status = 'VERIFIED'
WHERE s.provider = 'WAGO'
  AND NOT EXISTS (SELECT 1 FROM wago_verified_snapshot_v1802);

SELECT '1단계 완료' AS 단계,
       COUNT(*) AS 스냅샷_인원,
       MIN(snapshot_at) AS 스냅샷_시각
FROM wago_verified_snapshot_v1802;


-- ============================================================
-- [2단계] 이벤트 지급용 명단 — 이 결과를 복사해서 보관하세요
-- ============================================================

SELECT user_id        AS 유저ID,
       game_nickname  AS 게임닉네임,
       wago_nickname  AS 와이고수닉네임,
       wago_member_no AS 와이고수회원번호,
       verified_at    AS 인증일시,
       user_status    AS 계정상태
FROM wago_verified_snapshot_v1802
ORDER BY verified_at;


-- 2-1. 요약 (지급 대상 규모 파악)
SELECT '2단계 요약' AS 구분,
       COUNT(*)                                             AS 전체,
       SUM(CASE WHEN user_status='ACTIVE' THEN 1 ELSE 0 END) AS 활성계정,
       SUM(CASE WHEN user_status<>'ACTIVE' THEN 1 ELSE 0 END) AS 비활성계정,
       MIN(verified_at) AS 최초인증, MAX(verified_at) AS 최근인증
FROM wago_verified_snapshot_v1802;


-- ============================================================
-- [3단계] 전환 준비 점검  ★ 여기서 멈추고 반드시 확인하세요
--
--   PLAY DK 인증이 실제로 동작하지 않는 상태에서 해제하면
--   유저들이 어느 쪽으로도 인증할 수 없게 됩니다.
-- ============================================================

-- 3-1. PLAY DK 로 인증한 사람이 이미 있는가?
--      0 명이면 아직 아무도 성공한 적이 없다는 뜻입니다.
--      이 경우 운영자 계정으로 PLAY DK 인증을 한 번 성공시킨 뒤에 4단계로 가세요.
--      (PLAY DK 인증은 Pages 환경변수 PLAYDK_ACCESS_KEY / PLAYDK_SECRET_KEY 가
--       설정되어 있어야 동작합니다. 없으면 503 으로 막힙니다.)
SELECT '3단계 점검' AS 구분,
       SUM(CASE WHEN provider='PLAYDK' THEN 1 ELSE 0 END) AS PLAYDK_인증자,
       SUM(CASE WHEN provider='WAGO'   THEN 1 ELSE 0 END) AS 와이고수_인증자
FROM user_second_verifications;


-- ============================================================
-- [4단계] 와이고수 인증 일괄 해제
--
--   게임의 "관리자 연결 해제" 와 완전히 같은 방식입니다.
--   · wago_verifications 를 PENDING 으로 되돌리고
--   · 트리거가 user_second_verifications 의 WAGO 연결을 자동으로 제거합니다.
--   스냅샷이 비어 있으면 아무 것도 실행되지 않습니다(안전장치).
-- ============================================================

UPDATE wago_verifications
   SET status      = 'PENDING',
       verified_at = NULL,
       review_note = 'PLAY DK 전환 · 와이고수 인증 일괄 해제 (v1802)',
       updated_at  = CURRENT_TIMESTAMP
 WHERE status = 'VERIFIED'
   AND EXISTS (SELECT 1 FROM wago_verified_snapshot_v1802);

-- 트리거가 없는 환경을 대비한 마무리 정리 (있어도 중복 실행 안전)
DELETE FROM user_second_verifications
 WHERE provider = 'WAGO'
   AND EXISTS (SELECT 1 FROM wago_verified_snapshot_v1802);


-- ============================================================
-- [5단계] 해제 결과 확인
--   와이고수_잔여 와 VERIFIED_잔여 가 모두 0 이어야 정상입니다.
-- ============================================================

SELECT '5단계 결과' AS 구분,
       (SELECT COUNT(*) FROM user_second_verifications WHERE provider='WAGO')   AS 와이고수_잔여,
       (SELECT COUNT(*) FROM user_second_verifications WHERE provider='PLAYDK') AS PLAYDK_인증자,
       (SELECT COUNT(*) FROM wago_verifications WHERE status='VERIFIED')        AS VERIFIED_잔여,
       (SELECT COUNT(*) FROM wago_verified_snapshot_v1802)                      AS 보존된_명단;


-- ============================================================
-- [6단계] 되돌리기 — 문제가 생겼을 때만 (기본은 주석 처리)
--
--   스냅샷 기준으로 와이고수 인증을 복구합니다.
--   그 사이 PLAY DK 로 인증한 사람은 트리거가 막으므로 건너뜁니다.
-- ============================================================

-- UPDATE wago_verifications
--    SET status      = 'VERIFIED',
--        verified_at = COALESCE((SELECT s.verified_at FROM wago_verified_snapshot_v1802 s
--                                 WHERE s.user_id = wago_verifications.user_id), CURRENT_TIMESTAMP),
--        review_note = 'v1802 전환 되돌리기',
--        updated_at  = CURRENT_TIMESTAMP
--  WHERE status = 'PENDING'
--    AND user_id IN (SELECT user_id FROM wago_verified_snapshot_v1802)
--    AND user_id NOT IN (SELECT user_id FROM user_second_verifications WHERE provider='PLAYDK');


-- ============================================================
-- 참고
--   · 스냅샷 표(wago_verified_snapshot_v1802)는 이벤트 지급이 끝난 뒤에도
--     남겨두시길 권합니다. 용량이 거의 없고, 나중에 문의가 들어왔을 때 근거가 됩니다.
--   · 해제된 유저는 인증자 전용 혜택(메시지 보상·쿠폰·게시글 일일퀘스트)에서
--     빠집니다. PLAY DK 로 다시 인증하면 복구됩니다.
-- ============================================================
