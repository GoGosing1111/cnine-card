// Presentation of known server deadlines. Inputs remain server-validated.
export function projectLichChallenge(challenge,now,step='MECHANIC'){
  const c={...challenge};
  if(c.coop)return c;
  if(step!=='MECHANIC')return c;
  const prisonKind=['PRISON','CONVERGENCE'].includes(c.kind),breathAt=c.startedAt+6000;
  if(prisonKind&&!c.breathResolved&&now>=breathAt){
    c.breathResolved=true;c.prison=false;
  }
  if(c.plague&&!c.prison){
    const start=prisonKind?breathAt:c.startedAt;
    c.plagueStacks=Math.min(5,(c.kind==='PLAGUE'?1:2)+Math.floor(Math.max(0,now-start)/2000));
  }
  if(c.kind!=='FINALE'&&!c.interrupted&&now>=c.startedAt+(c.kind==='PLAGUE'?7000:10000))c.cast='SOUL_ANNIHILATION';
  if(c.rescueAt&&now>=c.rescueAt){c.rescueAt=0;c.rescued++;}
  return c;
}
export function lichControlKey(s,c){
  if(s.rulesVersion===2){
    const {plagueStacks,lastStrikes,...fixed}=c;
    return JSON.stringify([s.status,s.step,fixed,s.controls,s.resources,s.souls,s.doom,s.partyFighters?.map(f=>Math.ceil(f.hp/f.maxHp*100))]);
  }
  // HP/clock/stack/cooldown updates must not replace a button under a pointer.
  const {plagueStacks,lastStrikeAt,...controls}=c;
  return JSON.stringify([s.status,s.step,controls,c.plagueStacks>=2,s.resources,s.souls,s.doom,s.me.role,(s.partyFighters||s.fighters).filter(f=>f.hp<=0).map(f=>f.id)]);
}
