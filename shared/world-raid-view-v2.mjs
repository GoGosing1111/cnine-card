// Presentation only. HP, damage, phases and outcomes always come from raid/status.
const n=value=>Number.isFinite(Number(value))?Number(value):0;
export const raidPercent=(value,max)=>Math.max(0,Math.min(100,n(value)/Math.max(1,n(max))*100));
export function raidAmount(value){
  const amount=Math.max(0,n(value));
  if(amount>=100000000)return `${(amount/100000000).toLocaleString('ko-KR',{maximumFractionDigits:2})}억`;
  if(amount>=10000)return `${(amount/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})}만`;
  return Math.floor(amount).toLocaleString('ko-KR');
}
export function raidClock(seconds){const s=Math.max(0,Math.ceil(n(seconds)));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
export function raidViewModel(data,now=Date.parse(data?.serverNow)||Date.now()){
  const current=data?.current||{},settings=data?.settings||{},rules=current.combatRules||{},rows=(data?.participants||[]).map(row=>({...row,userId:n(row.userId||row.user_id),hpPct:raidPercent(row.currentHp,row.maxHp)}));
  rows.sort((a,b)=>n(b.shownDamage)-n(a.shownDamage)||a.userId-b.userId);
  const totalDamage=rows.reduce((sum,row)=>sum+n(row.shownDamage),0),alive=rows.filter(row=>!row.isDefeated&&n(row.currentHp)>0).length;
  const me=data?.me||null,myId=n(me?.userId||me?.user_id),phase=Math.max(1,Math.min(3,n(current.phase)||1));
  const interval=Math.max(0,n(rules.bossAttackIntervalMs)),start=Date.parse(current.startsAt),elapsed=Number.isFinite(start)?Math.max(0,now-start):0;
  const every=Math.max(2,n(current.ultimate?.everyAttacks)||3),tick=n(current.attackTicks),nextTick=tick+1;
  const nextAttackMs=interval?Math.max(0,nextTick*interval-elapsed):null;
  const nextUltimateTick=(Math.floor(tick/every)+1)*every,nextUltimateMs=interval?Math.max(0,nextUltimateTick*interval-elapsed):null;
  const due=nextAttackMs===0,remaining=Math.max(0,(Date.parse(current.endsAt)-now)/1000)||0;
  const minions=(current.minions||[]).map((row,index)=>({...row,index,hpPct:raidPercent(row.currentHp,row.maxHp)}));
  const guard=Math.round(n(current.bossDamageReduction)*100),shieldActive=phase===2&&!current.shieldBroken&&n(current.shieldHp)>0;
  const instruction=guard>0?`호위병을 처치해 보스 피해 차단 ${guard}%를 해제하세요.`:shieldActive?'방벽을 파괴하면 보스에게 주는 피해가 증가합니다.':phase===3?`광폭화 · 보스 공격 ${n(rules.phase3EnrageMultiplier)||2}배. 남은 체력을 집중 공략하세요.`:'파티 피해를 모아 보스를 압박하세요.';
  return {current,settings,rules,rows:rows.map((row,index)=>({...row,rank:index+1,share:raidPercent(row.shownDamage,totalDamage),mine:row.userId===myId})),me,myId,phase,totalDamage,alive,count:rows.length,hpPct:raidPercent(current.currentHp,current.maxHp),myHpPct:raidPercent(me?.currentHp,me?.maxHp),myRank:rows.findIndex(row=>row.userId===myId)+1,remaining,nextAttackMs,nextUltimateMs,nextIsUltimate:nextTick%every===0,due,charge:interval?Math.max(0,Math.min(100,(1-nextAttackMs/interval)*100)):0,minions,guard,shieldActive,shieldPct:raidPercent(current.shieldHp,current.shieldMaxHp),instruction};
}
export function raidViewEvents(previous,next){
  const a=previous?.current,b=next?.current;if(!b)return[];
  if(!a||Number(a.id)!==Number(b.id))return[{kind:'entry',title:'전장 진입',detail:`${b.bossName||'보스'} 공략 시작`}];
  if(Date.parse(next.serverNow)<Date.parse(previous.serverNow))return[];
  const events=[];
  if(Number(b.phase)!==Number(a.phase))events.push({kind:b.phase===3?'enrage':'phase',title:b.phase===3?'광폭화':b.phase===2?'방벽 전개':'돌입',detail:b.phase===3?'보스의 공격이 강화됩니다.':'방벽을 파괴하고 공격 기회를 확보하세요.'});
  if(b.shieldBroken&&!a.shieldBroken&&Number(a.shieldMaxHp)>0)events.push({kind:'break',title:'방벽 파괴',detail:'공격 기회 · 보스에게 집중 공격'});
  for(const minion of b.minions||[]){const old=(a.minions||[]).find(row=>row.code===minion.code);if(!old)continue;if(minion.defeated&&!old.defeated)events.push({kind:'minion-down',title:'호위병 처치',detail:minion.name});else if(minion.spawned&&!old.spawned)events.push({kind:'minion',title:'호위병 증원',detail:minion.name});}
  const casts=n(b.ultimateCasts)-n(a.ultimateCasts),attacks=n(b.attackTicks)-n(a.attackTicks);
  if(casts>0)events.push({kind:'ultimate',title:b.ultimate?.name||'보스 궁극기',detail:casts>1?`궁극기 ${casts}회 발동`:'전원 피격 · 파티 생존 상태를 확인하세요.',cast:n(b.ultimateCasts)});
  else if(attacks>0)events.push({kind:'attack',title:'보스 공격',detail:attacks>1?`${attacks}회 공격 반영`:'파티 체력 갱신'});
  const defeated=(next.participants||[]).filter(row=>row.isDefeated&&(previous.participants||[]).some(old=>n(old.userId)===n(row.userId)&&!old.isDefeated)).length;
  if(defeated)events.push({kind:'defeat',title:`파티원 ${defeated}명 전투 불능`,detail:'남은 파티원이 공략을 이어갑니다.'});
  return events;
}
