-- Previously granted titles keep the same ID, ownership, equipped slot and bonuses.
-- Only replace the precise placeholder used by the first S1 common-title migration.
UPDATE character_titles
SET image_url='/assets/ui/titles/immortal-heir-emblem-v1.webp',style_preset='IMMORTAL_HEIR'
WHERE code='COMMON_S1_TITLE' AND style_preset='DEFAULT'
  AND image_url='/assets/items/season-s1-immortal-king/immortal-seal-v3.webp';
