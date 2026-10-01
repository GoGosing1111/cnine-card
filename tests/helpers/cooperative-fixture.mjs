import fixture from '../fixtures/cooperative-balance-20261001.json' with {type:'json'};
export {fixture};
export const COOP_COMPOSITIONS={
 BALANCED:[['CR7','나무늘봉순'],['철구','박삐삐'],['Son Heung min','박세라']],
 OFFENSE:[['CR7','철구'],['Shohei Ohtani','구수댕'],['Stephen Curry','디임']],
 SPEED:[['Son Heung min','토마토'],['Lionel Messi','치타구'],['Son Heung min','빵귤이']],
 DEFENSE:[['철와대 킴성태','나무늘봉순'],['박세라','박삐삐'],['킹봉준','하이희야']]
};
export const COOP_MERCENARIES={SS:['V-004','V-048','V-051'],MIXED:['V-049','V-048','V-051'],TWO_SSS:['V-055','V-049','V-051'],SSS:['V-055','V-049','V-046']};
export function coopSquads({mercenaries=COOP_MERCENARIES.SS,composition='BALANCED',equipment=2000000,level=13}={}){
 return mercenaries.map((code,i)=>({ownerId:i+1,ownerName:['선봉 분대','지원 분대','돌파 분대'][i],
  cards:COOP_COMPOSITIONS[composition][i].map(title=>{const card=fixture.cardsByLevel[level].find(c=>c.title===title);if(!card)throw Error(title);return structuredClone(card);}),
  mercenary:structuredClone(fixture.mercenaries.find(m=>m.code===code)),equipmentBonus:equipment,singleHealerBonus:fixture.singleHealerBonus}));
}
