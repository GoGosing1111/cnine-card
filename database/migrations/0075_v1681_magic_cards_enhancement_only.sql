-- v1681: 마법카드는 등급 없이 강화 단계(+0~+9)만 사용한다.
-- 기존 NOT NULL 컬럼은 구버전 DB 호환을 위해 중립값으로만 유지한다.
UPDATE magic_cards
SET rarity = 'MAGIC',
    updated_at = CURRENT_TIMESTAMP
WHERE rarity <> 'MAGIC';

INSERT INTO app_meta(key,value,updated_at)
VALUES(
  'magic_card_model_v2',
  '{"growth":"ENHANCEMENT","maxLevel":9,"rarityEnabled":false}',
  CURRENT_TIMESTAMP
)
ON CONFLICT(key) DO UPDATE SET
  value=excluded.value,
  updated_at=CURRENT_TIMESTAMP;

-- 구버전 설정의 등급별 환급표는 중간값(SR 20)을 공통 환급량으로 승계한다.
UPDATE app_meta
SET value = json_set(
      value,
      '$.duplicateRefund',
      COALESCE(
        json_extract(value,'$.duplicateRefund.SR'),
        json_extract(value,'$.duplicateRefund.R'),
        json_extract(value,'$.duplicateRefund.SSR'),
        json_extract(value,'$.duplicateRefund'),
        20
      )
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE key='magic_card_settings_v1'
  AND json_type(value,'$.duplicateRefund')='object';
