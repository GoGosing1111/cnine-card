import {createServerClock} from '/shared/server-clock-v1.mjs?v=20261015-v1';
// Only the server owns HP/results. One active action plus one latest queued
// action per actor prevents a delayed tab from accumulating seconds of work.
// A live Jokro area receipt supersedes that actor's queued basic animation.
export async function mountCoopBattle(host,payload,{clock:sharedClock}={}){
 const clock=sharedClock||createServerClock(),live=window.ProjectVBattleV3Live;await live.ensureRuntime();
 const prepared=live.prepareLoading({modal:host,mode:'RAID',playerName:'격전지 연합',opponentName:payload.monster.name,autoText:'세 분대가 전장에 집결합니다'});
 host.classList.add('coop-battle-mount');prepared.stage.querySelector('.battle-v3-header strong').textContent='격전지(협동)';prepared.stage.querySelector('.battle-v3-header small').textContent='3인 공동 전투';
 const renderer=await live.createRenderer({...prepared,modal:host,data:payload,mode:'RAID',playUltimateCinematics:false});
 const api=window.ProjectVPixiBattle;await api.restoreDeployedFormation();
 let groups=[],cursor=0,version=0,startsAt=0,active=false,destroyed=false,frame=null,lastSync=0,lastSnapshot=performance.now(),suspended=false,coalesced=0,skipped=0;
 const lanes=new Map();
 function cancel(){version++;lanes.clear();api.cancelActiveAnimations();}
 function sync(){if(frame)api.syncFinalState({A:frame.A.filter(f=>!f.isMercenary),B:frame.B,mercenaries:{A:frame.A.filter(f=>f.isMercenary),B:[]}});}
 function play(group){
  const action=group.events.find(e=>['TURN','ATTACK','COUNTER','SKILL','ULTIMATE','PVE_ULTIMATE','BOSS_ULTIMATE','ICON_SKILL'].includes(e.type))||group.events.find(e=>e.type==='MERCENARY_WINDUP')||group.events.find(e=>e.type.startsWith('MERCENARY_'));
  const key=action?.actorId||'group:'+group.id,existing=lanes.get(key);
  const jokroArea=group.events.some(e=>e.type==='MERCENARY_JOKRO_AREA');
  if(existing){
   if(existing.pending)coalesced++;
   if(!jokroArea){existing.pending=group;return;}
   // The V3 cast settles only its own actor's prior animation. Retire the old
   // lane so its resolved promise cannot start a stale basic over the new cast.
   existing.pending=null;
  }
  const lane={pending:group,epoch:version};lanes.set(key,lane);
  void (async()=>{
   try{while(lane.pending&&!destroyed&&lane.epoch===version){const next=lane.pending;lane.pending=null;
     if(clock.now()-startsAt-next.at>1000){skipped++;continue;}
     await api.playEvents(next.events,{timedInternal:true});
   }}catch{if(lane.epoch===version)sync();}
   finally{if(lanes.get(key)===lane)lanes.delete(key);}
  })();
 }
 function groupEvents(timeline){const result=[];for(const event of timeline.filter(e=>e.type!=='RESULT')){const last=result.at(-1);if(last?.id===event.combatGroup)last.events.push(event);else result.push({id:event.combatGroup,at:Number(event.combatAtMs)||0,events:[event]});}return result.sort((a,b)=>a.at-b.at);}
 function update(value){
  if(!sharedClock)clock.sample(value.serverNow,{sentAt:value.clientSentAt??undefined});lastSnapshot=performance.now();suspended=false;frame=value.state.fighters;
  if(frame)api.syncCooperativeState?.(frame);
  const state=value.state;startsAt=state.startsAt||0;active=state.status==='ACTIVE'&&!state.myResult;
  if(value.payload){groups=groupEvents(value.payload.battleV2.result.timeline);cancel();cursor=0;const elapsed=startsAt?clock.now()-startsAt:0;
   while(cursor<groups.length&&groups[cursor].at<elapsed-300){cursor++;skipped++;}api.restorePetSupport?.(elapsed-300);sync();}
  if(!active&&state.status!=='LOADING'){cancel();sync();}
 }
 function pump(){
  if(destroyed)return;
  if(active&&startsAt&&!document.hidden){
   if(performance.now()-lastSnapshot>15000){if(!suspended){cancel();suspended=true;}}
   else{
    const elapsed=clock.now()-startsAt;
    if(cursor<groups.length&&elapsed-groups[cursor].at>1000){cancel();while(cursor<groups.length&&groups[cursor].at<elapsed-100){cursor++;skipped++;}api.restorePetSupport?.(elapsed-100);sync();lastSync=elapsed;}
    let budget=6;
    while(budget-->0&&cursor<groups.length&&groups[cursor].at<=elapsed){const group=groups[cursor++];if(group.events.some(e=>e.type==='ENEMY_SPAWN'))cancel();play(group);}
    if(cursor>=groups.length&&elapsed-lastSync>5000&&!lanes.size){sync();lastSync=elapsed;}
   }
  }
  raf=requestAnimationFrame(pump);
 }
 let raf=requestAnimationFrame(pump);update({serverNow:Date.now(),state:{status:'LOADING',battleRevision:0},payload});
 return {update,destroy(){destroyed=true;cancelAnimationFrame(raf);cancel();renderer.destroy();},diagnostics:()=>({cursor,groups:groups.length,startsAt,pendingActions:lanes.size,coalesced,skipped,suspended,clock:clock.diagnostics(),engine:api.diagnostics()})};
}
