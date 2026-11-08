export const FIRST_TIER='gate';
export const CITADEL_TIERS=Object.freeze([
 {id:'gate',name:'재앙의 성문',stage:1,guide:'권장 SS 리미티드 Lv.16 또는 SSS 리미티드 Lv.10 이상',power:1,boss:1,attack:1,defense:100,speed:100,shield:0,repeat:2},
 {id:'keep',name:'멸망의 내성',stage:2,guide:'성문 성주를 처치한 숙련 파티 권장',power:2.4,boss:2.15,attack:1.35,defense:115,speed:110,shield:8,repeat:2},
 {id:'throne',name:'종말의 왕좌',stage:3,guide:'최종 돌파 용병과 강화 장비를 갖춘 파티 권장',power:4.3,boss:3.7,attack:1.65,defense:130,speed:125,shield:16,repeat:3}
]);
export const tierById=id=>CITADEL_TIERS.find(t=>t.id===id);
export const citadelTierMenu=CITADEL_TIERS.map(({id,name,stage,guide})=>({id,name,stage,guide}));

