import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
export const FIRST_TIER='gate';
export const DOCKYARD=Object.freeze({id:'clan-dockyard',name:'봉쇄된 물류기지',stage:3,itemMultiplier:1.5,
 art:'/assets/ui/organization/hunts-20261023/',
 combat:Object.freeze({power:1,boss:1,attack:1,defense:100,speed:100,shield:0,repeat:2})});
export const CITADEL_ITEM_MULTIPLIER=1.3;
export const CITADEL_COIN_MULTIPLIER=10;
export const CITADEL_UNIQUE_REWARDS=Object.freeze([5,10,20].map((divisor,index)=>({
 tier:index+1,divisor,family:UNIQUE_MERCENARY_EQUIPMENT.find(item=>item.tier===index+1).family
})));
export const CITADEL_TIERS=Object.freeze([
 {id:'gate',name:'재앙의 성문',stage:1,uniqueScale:0.8,guide:'고레벨 용병과 회복 담당 1명 이상 권장',power:5,boss:12,attack:1.45,defense:115,speed:110,shield:6,repeat:2,barragePercent:8},
 {id:'keep',name:'멸망의 내성',stage:2,uniqueScale:0.9,guide:'성문을 돌파한 파티 · 회복과 방벽 편성 권장',power:16,boss:50,attack:1.8,defense:135,speed:125,shield:15,repeat:3,barragePercent:9.5},
 {id:'throne',name:'종말의 왕좌',stage:3,uniqueScale:1,guide:'최종 돌파 용병 · 강화 장비와 회복 편성 권장',power:48,boss:192,attack:2.3,defense:160,speed:145,shield:26,repeat:4,barragePercent:10.25}
]);
export const tierById=id=>CITADEL_TIERS.find(t=>t.id===id);
export const citadelTierMenu=CITADEL_TIERS.map(({id,name,stage,guide})=>({id,name,stage,guide,
 uniqueFamilies:CITADEL_UNIQUE_REWARDS.map(row=>row.family)}));

