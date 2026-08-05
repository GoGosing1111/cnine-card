-- FUR 최초 2장 보정은 실제 추첨 가능한 활성·공개 FUR만 보유 카드로 인정한다.
-- 과거 비공개/퇴역 카드 때문에 완료 처리된 계정은 다음 대상 팩 개봉에서 확정 보정을 받는다.
UPDATE user_fur_first_pity
SET miss_count=MAX(
      COALESCE(miss_count,0),
      MAX(0,COALESCE(
        CAST(json_extract((SELECT value FROM app_meta WHERE key='fur_first_acquisition_settings_v1'),'$.hard') AS INTEGER),
        100
      )-1)
    ),
    completed_at=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE completed_at IS NOT NULL
  AND (
    SELECT COUNT(DISTINCT uc.card_id)
    FROM user_cards uc
    JOIN cards_effective_v1210 c ON c.id=uc.card_id
    JOIN members m ON m.id=c.member_id
    WHERE uc.user_id=user_fur_first_pity.user_id
      AND UPPER(c.rarity)='FUR'
      AND COALESCE(uc.quantity,0)>0
      AND c.is_active=1
      AND COALESCE(c.card_status,'PUBLIC')='PUBLIC'
      AND m.is_active=1
  )<2;

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1417_fur_first_active_pool_repair','1',CURRENT_TIMESTAMP);
