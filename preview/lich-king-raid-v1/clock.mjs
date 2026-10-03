// Presentation of known server deadlines. Inputs remain server-validated.
// Strike/burst spend the same personal opportunity. Other steps are independent.
export const lichInputKey=token=>String(token||'').replace(/:(?:strike|burst)-([^:]+):(\d+)$/,':attack-$1:$2');
export function lichCoopInputState(s,c,a,now,pending=false){
  const waiting=Boolean(a.startsAt&&now<a.startsAt),expired=Boolean(a.deadline&&now>=a.deadline);
  // The server ticks absorption before validating a shatter. Its known deadline
  // can unlock locally too, even when the next status response is still in flight.
  const absorbed=a.action==='SHATTER'&&s.combatRevision===2&&c.hasPrison&&c.sealed&&now>=c.breathAt;
  const blocked=Boolean(a.blocked)&&!absorbed;
  const active=s.status==='ACTIVE',ready=active&&!waiting&&!expired&&!blocked&&!pending;
  const seconds=at=>Math.max(0,Math.ceil((at-now)/1000))+'초';
  const clock=!active?'종료':expired?'시간 종료':waiting
    ?(['STRIKE','BURST'].includes(a.action)?'재사용 '+Math.max(0,(a.startsAt-now)/1000).toFixed(1)+'초':(a.action==='SHATTER'?'엄폐 ':'예고 ')+seconds(a.startsAt))
    :blocked?'대기':pending?'입력 확인 중':a.deadline?(a.action==='SHATTER'?'지금 파쇄 · ':'남은 ')+seconds(a.deadline):'사용 가능';
  return {waiting,expired,blocked,ready,clock};
}
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
