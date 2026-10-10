import {REVIEW_DECK} from '../lich-king-raid-v1/fixture.mjs';

// Real catalog art/SD identities; powers are local review fixtures only.
export function madaraReviewDeck(strength='NORMAL') {
  return {cards:structuredClone(REVIEW_DECK).map(card=>({...card,power:Math.round(card.power*(strength==='LOW'?.01:1.4))}))};
}
export const MADARA_REVIEW_BOSS={
  id:'MADARA_LOCAL_REVIEW',name:'마다라',isBoss:true,is_boss:1,
  battle_power:440000,pve_hp_percent:250,pve_attack_percent:100,
  pve_defense_percent:100,pve_speed_percent:100,pve_forced_action_every:5,
  image:'/preview/madara-raid-v1/assets/madara-source-reference.png',
  battleSprite:'/preview/madara-raid-v1/assets/madara-battle-v1.png',
  spiritSprite:'/preview/madara-raid-v1/assets/azure-spirit-v1.png'
};
