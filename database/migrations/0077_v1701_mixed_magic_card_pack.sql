-- V1701: inventory magic-card packs use a configurable mixed reward pool.
UPDATE inventory_items
SET name='마법카드팩',
    subtitle='ARCANA MIXED PACK',
    description='마법카드·마법 결정·카드 조각 중 하나를 획득합니다. 동일 마법카드는 강화 재료로 누적됩니다.',
    category='PACK',
    rarity='SPECIAL',
    image_url='assets/cards/magic-card-pack-v2-768.jpg',
    sort_order=40,
    is_active=1,
    updated_at=CURRENT_TIMESTAMP
WHERE code='MAGIC_CARD_PACK';

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1701_mixed_magic_card_pack','1',CURRENT_TIMESTAMP);
