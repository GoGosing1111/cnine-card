-- V1662: Magic Card V2 production-renderer examples.
-- Idempotent codes keep CMS edits intact when the migration is reapplied.
INSERT OR IGNORE INTO magic_cards
  (code,name,rarity,image_url,description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,draw_weight,scope_pve,scope_pvp,scope_captain,is_active,sort_order)
VALUES
  ('V2_OPENING_ATTACK','선봉의 마력검','MAGIC','assets/ui/magic-cards/opening-attack-768-v1500.webp','전투 시작 시 장착 카드의 공격력이 18% 증가합니다.','OPENING_ATTACK','BATTLE_START',18,100,1,0.25,1,1,0,1,166201),
  ('V2_GUARD_BARRIER','성역의 수호결계','MAGIC','assets/ui/magic-cards/guard-barrier-768-v1500.webp','전투 시작 시 최대 HP의 20%만큼 보호막을 생성합니다.','GUARD_BARRIER','BATTLE_START',20,100,1,0.25,1,1,0,1,166202),
  ('V2_LIFE_AMPLIFY','생명의 근원','MAGIC','assets/ui/magic-cards/life-amplify-768-v1500.webp','전투 시작 시 장착 카드의 최대 HP가 16% 증가합니다.','LIFE_AMPLIFY','BATTLE_START',16,100,1,0.65,1,1,0,1,166203),
  ('V2_CRISIS_HEAL','긴급 치유의 빛','MAGIC','assets/ui/magic-cards/crisis-heal-768-v1500.webp','HP가 30% 이하가 되면 최대 HP의 28%를 회복합니다.','CRISIS_HEAL','LOW_HP',28,100,2,0.25,1,1,0,1,166204),
  ('V2_PUNISH_TRAP','응징의 마법진','MAGIC','assets/ui/magic-cards/punish-trap-768-v1500.webp','피격 시 공격자에게 최대 HP의 14%만큼 피해를 줍니다.','PUNISH_TRAP','AFTER_HIT',14,100,2,0.65,1,1,0,1,166205),
  ('V2_ARCANE_COUNTER','비전 반격','MAGIC','assets/ui/magic-cards/arcane-counter-768-v1500.webp','피격 시 공격력의 16%만큼 마법 반격 피해를 줍니다.','ARCANE_COUNTER','AFTER_HIT',16,100,2,0.25,1,1,0,1,166206),
  ('V2_FOLLOWUP_HASTE','질풍의 연계','MAGIC','assets/ui/magic-cards/followup-haste-768-v1500.webp','공격 후 행동 게이지를 22% 충전합니다.','FOLLOWUP_HASTE','AFTER_ATTACK',22,100,2,0.65,1,1,0,1,166207);
