export const seasonAttackValue=(value,bp)=>Math.max(1,Math.floor(value*(1+Math.max(0,Math.min(5000,Number(bp)||0))/10000)));
// Bonuses are trusted snapshots loaded by the server, never browser fields.
export function applySeasonFighterBonus(fighters,bonus,mode){
 if(!['PVE','PVP'].includes(mode)||!bonus)return fighters;
 const attack=mode==='PVE'?Math.max(0,Math.min(5000,Number(bonus.attackBp)||0)):0;
 const hp=mode==='PVP'?Math.max(0,Math.min(5000,Number(bonus.hpBp)||0)):0;
 for(const f of fighters){if(f.seasonS1Applied||f.actorKind==='BATTLE_SUIT')continue;
  if(attack&&Number.isFinite(f.attack))f.attack=seasonAttackValue(f.attack,attack);
  if(hp&&Number.isFinite(f.maxHp)){const ratio=f.maxHp>0?f.hp/f.maxHp:1;f.maxHp=Math.max(1,Math.floor(f.maxHp*(1+hp/10000)));f.hp=Math.floor(f.maxHp*ratio);}
  if(attack||hp)f.seasonS1Applied={mode,attackBp:attack,hpBp:hp};
 }return fighters;
}

