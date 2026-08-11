-- V1665: advanced magic-card mechanics and matching production art.
-- Actual activation chance is controlled exclusively by enhancement level (0/+1...+9).
INSERT OR IGNORE INTO magic_cards
  (code,name,rarity,image_url,description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,draw_weight,scope_pve,scope_pvp,scope_captain,is_active,sort_order)
VALUES
  ('V2_ARCANE_SEAL','봉인의 칙령','SSR','assets/ui/magic-cards/arcane-seal-768-v1665.webp','공격 후 대상의 다음 마법카드 발동 시도를 1회 봉인합니다.','ARCANE_SEAL','AFTER_ATTACK',1,0,2,0.25,1,1,0,1,166501),
  ('V2_DOOM_MARK','파멸의 낙인','SSR','assets/ui/magic-cards/doom-mark-768-v1665.webp','공격 후 낙인을 부여합니다. 낙인 3중첩 시 대상 최대 HP의 18% 피해로 폭발합니다.','DOOM_MARK','AFTER_ATTACK',18,0,3,0.25,1,1,0,1,166502),
  ('V2_SHIELD_SIPHON','강탈의 성배','SR','assets/ui/magic-cards/shield-siphon-768-v1665.webp','공격 후 대상의 현재 보호막 60%를 빼앗아 자신의 보호막으로 전환합니다.','SHIELD_SIPHON','AFTER_ATTACK',60,0,2,0.65,1,1,0,1,166503),
  ('V2_TIME_DISTORTION','시간의 족쇄','SSR','assets/ui/magic-cards/time-distortion-768-v1665.webp','공격 후 대상의 행동 게이지를 30 감소시켜 다음 행동을 지연합니다.','TIME_DISTORTION','AFTER_ATTACK',30,0,2,0.25,1,1,0,1,166504),
  ('V2_PHOENIX_REVIVE','불사조의 계약','SSR','assets/ui/magic-cards/phoenix-revive-768-v1665.webp','전투 불능 시 1회에 한해 최대 HP의 22%로 부활합니다.','PHOENIX_REVIVE','ON_DEATH',22,0,1,0.25,1,1,0,1,166505),
  ('V2_PURIFY_LIGHT','정화의 성광','SR','assets/ui/magic-cards/purify-light-768-v1665.webp','피격 후 봉인·낙인·시간 왜곡을 모두 해제하고 최대 HP의 12%를 회복합니다.','PURIFY_LIGHT','AFTER_HIT',12,0,2,0.65,1,1,0,1,166506),
  ('V2_CHAIN_ECHO','연쇄의 잔영','SSR','assets/ui/magic-cards/chain-echo-768-v1665.webp','공격 후 직전 실제 피해량의 45%만큼 연쇄 추가 피해를 가합니다.','CHAIN_ECHO','AFTER_ATTACK',45,0,2,0.25,1,1,0,1,166507);
