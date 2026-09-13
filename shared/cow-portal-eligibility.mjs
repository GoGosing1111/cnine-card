// Both the server and the result presenter use an explicit PVE allowlist.
export function cowPortalBattleEligible({sourceType,battleMode,isApocalypse=false}={}){
  return ['PVE','APOCALYPSE'].includes(battleMode)&&['HUNT','SWEEP'].includes(sourceType)
    && !(sourceType==='SWEEP'&&(isApocalypse===true||battleMode==='APOCALYPSE'));
}
export function cowPortalNoticeEligible(portal,mode){
  return ['PVE','APOCALYPSE'].includes(mode)&&portal?.state==='OPEN'
    && typeof portal.id==='string'&&['STANDARD','APOCALYPSE'].includes(portal.difficulty)
    && cowPortalBattleEligible({sourceType:portal.sourceType,battleMode:portal.difficulty==='APOCALYPSE'?'APOCALYPSE':'PVE'});
}
