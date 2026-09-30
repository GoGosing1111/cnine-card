import {readFileSync} from 'node:fs';
import {REVIEW_DECK} from '../../preview/lich-king-raid-v1/fixture.mjs';
import {MERCENARY_COMBAT_DRAFT} from '../../shared/mercenary-combat-policy-v1.mjs';
const roster=JSON.parse(readFileSync(new URL('../../assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json',import.meta.url)));
export function accountDeck(userId){
  const cards=[...REVIEW_DECK.slice(userId-1),...REVIEW_DECK.slice(0,userId-1)];
  const art=roster.cards.find(m=>m.code==='V-004');
  return {cards,ids:cards.map(c=>c.id),mercenary:{...art,rank:'A',statMode:'RANK_FIXED',role:'SNIPER',position:'BACK',level:1,basePower:40000,
    stats:{hp:100000,attack:12000,defense:1000,speed:110},skills:[],combat:MERCENARY_COMBAT_DRAFT},
    characterBonus:{pve:100000,battleSuitPve:100000,equippedBattleSuit:{code:'BATTLE_SUIT_H_BODY',name:'H-BODY',pvePower:100000,image:'/assets/items/h-body-v2066.png'},
      equippedWeapon:{code:'WEAPON_M4A1_CHROMATIC',name:'M4A1'}}};
}
