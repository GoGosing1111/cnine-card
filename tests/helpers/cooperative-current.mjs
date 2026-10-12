import fixture from '../fixtures/cooperative-balance-20261012.json' with {type:'json'};
export {fixture};
export const currentCard=(title,level=13,grade='ICON')=>structuredClone(fixture.cardsByLevel[level].find(c=>c.title===title&&c.grade===grade));
export const currentMerc=code=>structuredClone(fixture.mercenaries.find(c=>c.code===code));
export const CURRENT_DECKS={
 BALANCED:[['강구열','오조은'],['아윤','오리꿍'],['하이희야','오조은']],
 OFFENSE:[['디임','나무늘봉순'],['디임','나무늘봉순'],['디임','나무늘봉순']],
 SUPPORT:[['강구열','오조은'],['강구열','오조은'],['강구열','오조은']],
 SHIELD_BREAK:[['아윤','오리꿍'],['하이희야','오조은'],['하이희야','오조은']],
 CLEANSE:[['강구열','오조은'],['오리꿍','오조은'],['하이희야','오조은']]
};
export function currentSquads({codes=['V-989','V-999','V-996'],deck='BALANCED',gear=2300000,level=13,grade='ICON'}={}){
 return codes.map((code,i)=>({ownerId:i+1,ownerName:'분대 '+(i+1),cards:CURRENT_DECKS[deck][i].map(t=>{const c=currentCard(t,level,grade);if(!c)throw Error(t);return c;}),mercenary:currentMerc(code),equipmentBonus:Array.isArray(gear)?gear[i]:gear,singleHealerBonus:fixture.singleHealerBonus}));
}
