// Stable monster identities; no name-based matching or client damage authority.
export const APOCALYPSE_SIGNATURE_SKILLS=Object.freeze({
  73:Object.freeze({code:'NIGHT_GUY',monsterId:73,name:'팔문둔갑 · 야가이',defaultDamagePercent:80,description:'붉은 용의 형상으로 돌진해 모든 출전 카드에 방어막을 관통하는 피해를 가합니다.',asset:'night-guy',color:0xff573e,hitTint:0xffb39a,impactAt:.96,shake:40,hitStopMs:155,scale:1.8,trajectory:'CHARGE'}),
  74:Object.freeze({code:'WOOD_DRAGON',monsterId:74,name:'목둔 · 목룡 강림',defaultDamagePercent:90,description:'거대한 목룡과 뿌리가 솟구쳐 모든 출전 카드에 방어막을 관통하는 피해를 가합니다.',asset:'wood-dragon',color:0x62e8a4,hitTint:0xb2ffcd,impactAt:1.12,shake:36,hitStopMs:165,scale:1.94,trajectory:'ERUPT'})
});
export function apocalypseSignatureSkill(monster={}){
  const identities=monster&&typeof monster==='object'?[monster.monsterId,monster.id,monster.cardId]:[monster];
  for(const identity of identities){
    const id=String(identity??'').match(/(?:^|:)(73|74)$/)?.[1];
    if(id)return APOCALYPSE_SIGNATURE_SKILLS[id];
  }
  return null;
}
