-- 진화 시도 횟수 카운터 복구
-- ============================================================================
-- 확인된 상태: card_evolution_progress.total_attempts 가 실제 기록(card_evolution_logs)
--              보다 크다. 유저는 첫 시도인데 "10번째 도전" 으로 표시된다.
--
-- ⚠ 천장(pity) 진행도는 건드리지 않습니다.
--   failed_attempts 는 천장 계산에 쓰이므로 낮추면 유저가 쌓아둔 진행도를 빼앗습니다.
--   그대로 두고, 화면에 보이는 total_attempts 만 실제 기록 수에 맞춥니다.
--   (total_attempts 가 failed_attempts 보다 작아지면 안 되므로 둘 중 큰 값을 씁니다.)
--
-- 순서대로 ①  → ② 확인 → ③ 실행 하세요.
-- ============================================================================


-- ① 안전 확인 — 로그 자체가 통째로 비어 있지는 않은가
--    이관 때 로그 테이블이 안 넘어왔다면 이 복구를 하면 안 됩니다.
--    (전부 0 으로 밀어버리게 됩니다)
SELECT '① 로그 테이블 상태' AS 확인,
       COUNT(*) AS 전체기록수,
       MIN(created_at) AS 가장오래된기록,
       MAX(created_at) AS 가장최근기록,
       COUNT(*) FILTER (WHERE created_at >= '2026-08-23') AS 이관후_기록수
FROM card_evolution_logs;
-- 전체기록수가 0 이거나 '가장오래된기록' 이 이관일(2026-08-23) 이후면
-- → 로그가 안 넘어온 것이므로 여기서 멈추고 알려주세요. 복구 방식이 달라집니다.


-- ② 무엇이 바뀌는지 미리 보기 (아무것도 바꾸지 않음)
WITH recomputed AS (
  SELECT p.user_id,
         p.source_card_id,
         p.total_attempts AS 지금값,
         p.failed_attempts,
         COUNT(l.id) AS 기록수,
         GREATEST(COUNT(l.id), p.failed_attempts) AS 바뀔값
  FROM card_evolution_progress p
  LEFT JOIN card_evolution_logs l
         ON l.user_id = p.user_id AND l.source_card_id = p.source_card_id
  GROUP BY p.user_id, p.source_card_id, p.total_attempts, p.failed_attempts
)
SELECT '② 변경 미리보기' AS 확인, *
FROM recomputed
WHERE 지금값 <> 바뀔값
ORDER BY (지금값 - 바뀔값) DESC
LIMIT 50;

-- 요약도 같이
WITH recomputed AS (
  SELECT p.user_id, p.source_card_id, p.total_attempts,
         GREATEST(COUNT(l.id), p.failed_attempts) AS fixed
  FROM card_evolution_progress p
  LEFT JOIN card_evolution_logs l
         ON l.user_id = p.user_id AND l.source_card_id = p.source_card_id
  GROUP BY p.user_id, p.source_card_id, p.total_attempts, p.failed_attempts
)
SELECT '② 요약' AS 확인,
       COUNT(*) FILTER (WHERE total_attempts <> fixed) AS 고칠행수,
       COUNT(DISTINCT user_id) FILTER (WHERE total_attempts <> fixed) AS 영향유저수,
       COALESCE(MAX(total_attempts - fixed), 0) AS 최대과다치
FROM recomputed;


-- ③ 실제 복구 — ② 결과가 납득되면 실행하세요
BEGIN;

-- 되돌릴 수 있도록 원본을 남깁니다
CREATE TABLE IF NOT EXISTS card_evolution_progress_backup_v1814 AS
SELECT *, now() AS backed_up_at FROM card_evolution_progress WHERE false;

INSERT INTO card_evolution_progress_backup_v1814
SELECT p.*, now() FROM card_evolution_progress p;

UPDATE card_evolution_progress p
SET total_attempts = r.fixed,
    updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
FROM (
  SELECT p2.user_id, p2.source_card_id,
         GREATEST(COUNT(l.id), p2.failed_attempts) AS fixed
  FROM card_evolution_progress p2
  LEFT JOIN card_evolution_logs l
         ON l.user_id = p2.user_id AND l.source_card_id = p2.source_card_id
  GROUP BY p2.user_id, p2.source_card_id, p2.failed_attempts
) r
WHERE p.user_id = r.user_id
  AND p.source_card_id = r.source_card_id
  AND p.total_attempts <> r.fixed;

-- 결과 확인 후 COMMIT / 이상하면 ROLLBACK
SELECT '③ 복구 결과' AS 확인, COUNT(*) AS 남은불일치
FROM (
  SELECT p.user_id
  FROM card_evolution_progress p
  LEFT JOIN card_evolution_logs l
         ON l.user_id = p.user_id AND l.source_card_id = p.source_card_id
  GROUP BY p.user_id, p.source_card_id, p.total_attempts, p.failed_attempts
  HAVING p.total_attempts <> GREATEST(COUNT(l.id), p.failed_attempts)
) x;

COMMIT;
-- 되돌리려면:
--   UPDATE card_evolution_progress p SET total_attempts = b.total_attempts
--   FROM card_evolution_progress_backup_v1814 b
--   WHERE p.user_id = b.user_id AND p.source_card_id = b.source_card_id;
