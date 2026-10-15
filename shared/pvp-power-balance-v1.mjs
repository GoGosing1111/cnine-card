// 2026-10-15 correction: bonus only. Mercenary base stats, links, immunity,
// action credit and prepared level/XP policy keep their existing values.
// Frozen from authoritative opening fighters. Never read a client power claim,
// live HP, winner, rating or mercenary name to award a power advantage.
// 2026-10-16: jointly released with mercenary levels at the approved 30/10 rate.
// JSON requests cannot supply
// this symbol; only an explicitly imported, local review harness can opt in.
export const PVP_POWER_BALANCE_RELEASED=true;
export const PVP_POWER_BALANCE_REVIEW=Symbol('PVP_POWER_BALANCE_REVIEW');
export const PVP_POWER_BALANCE=Object.freeze({
 version:'pvp-power-bonus-20261016-v3',damagePerDoubling:.30,maxDamageBonus:.60,
 tempoPerDoubling:.10,maxTempoBonus:.20,
});
export function pvpPowerEnabled(options={}){
 const version=options.pvpBalanceVersion;
 if(version==='LEGACY')return false;
 if(version!==undefined&&version!==PVP_POWER_BALANCE.version)throw Error('UNKNOWN_PVP_BALANCE_VERSION');
 // An explicit server-only false preserves already saved battles after release.
 return options[PVP_POWER_BALANCE_REVIEW]===false?false:PVP_POWER_BALANCE_RELEASED||options[PVP_POWER_BALANCE_REVIEW]===true;
}
export const pvpPolicySnapshot=(options={})=>pvpPowerEnabled(options)?{pvpBalanceVersion:PVP_POWER_BALANCE.version}:{};
// Only call with immutable server-owned stored input, never a request body.
// Replays keep their saved rule even if a later release/rollback flips the flag.
export const pvpReplayInput=input=>({...input,[PVP_POWER_BALANCE_REVIEW]:input.pvpBalanceVersion===PVP_POWER_BALANCE.version});
export function pvpPowerBonuses(ownPower,opponentPower){
 if(!Number.isFinite(ownPower)||!Number.isFinite(opponentPower)||ownPower<=0||opponentPower<=0)throw Error('INVALID_PVP_FORMATION_POWER');
 const ratio=ownPower/opponentPower,gap=Math.max(0,Math.log2(ratio));
 return {ratio,damageMultiplier:1+Math.min(PVP_POWER_BALANCE.maxDamageBonus,gap*PVP_POWER_BALANCE.damagePerDoubling),
  tempoMultiplier:1+Math.min(PVP_POWER_BALANCE.maxTempoBonus,gap*PVP_POWER_BALANCE.tempoPerDoubling)};
}
export function applyPvpPowerBalance(teams){
 const all=teams.flat();
 if(!all.length||all.some(a=>a.battleMode!=='PVP'||a.isMonster||a.isBattleSuit))return null;
 // The bonus belongs to complete five-card formations. Legacy single-card
 // duels and partial preview teams keep working without this formation bonus.
 if(teams.some(team=>!team.length||[...new Set(team.map(a=>a.ownerId??null))].some(ownerId=>team.filter(a=>(a.ownerId??null)===ownerId&&!a.isMercenary).length!==5)))return null;
 const groups=teams.map(team=>[...new Set(team.map(a=>a.ownerId??null))].map(ownerId=>{
  const actors=team.filter(a=>(a.ownerId??null)===ownerId);
  const power=actors.reduce((sum,a)=>sum+Number(a.power||0),0);
  if(!Number.isSafeInteger(power)||power<=0)throw Error('INVALID_PVP_FORMATION_POWER');
  return {ownerId,actors,power};
 }));
 if(groups.some(side=>!side.length))throw Error('INVALID_PVP_POWER_FORMATION');
 const summaries=groups.map((side,index)=>{
  const opponents=groups[1-index],opponentPower=opponents.reduce((sum,g)=>sum+g.power,0)/opponents.length;
  return side.map(group=>{
   const effect={version:PVP_POWER_BALANCE.version,formationPower:group.power,opponentPower,...pvpPowerBonuses(group.power,opponentPower)};
   for(const actor of group.actors){
    if(actor.pvpPowerBalance)throw Error('PVP_POWER_ALREADY_APPLIED');
    actor.speed=Math.max(1,Math.round(actor.speed*effect.tempoMultiplier));
    if(actor.stats)actor.stats={...actor.stats,speed:actor.speed};
    actor.pvpPowerBalance={...effect};
   }
   return {ownerId:group.ownerId,...effect};
  });
 });
 return {version:PVP_POWER_BALANCE.version,A:summaries[0],B:summaries[1]};
}
export const pvpPowerDamageMultiplier=actor=>actor?.battleMode==='PVP'&&actor.pvpPowerBalance?.version===PVP_POWER_BALANCE.version
 ?Math.max(1,Math.min(1+PVP_POWER_BALANCE.maxDamageBonus,Number(actor.pvpPowerBalance.damageMultiplier)||1)):1;
