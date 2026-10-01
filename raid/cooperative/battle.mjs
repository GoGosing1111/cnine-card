// Authoritative shared time drives the existing V3 renderer and GSAP animations.
// No combat is calculated here. A late tab restores the server HP snapshot.
export async function mountCoopBattle(host,payload){
 const live=window.ProjectVBattleV3Live;await live.ensureRuntime();
 const prepared=live.prepareLoading({modal:host,mode:'RAID',playerName:'격전지 연합',opponentName:'리치왕',autoText:'세 분대가 전장에 집결합니다'});
 // prepareLoading assigns the common modal classes; restore this overlay host.
 host.classList.add('coop-battle-mount');
 prepared.stage.querySelector('.battle-v3-header strong').textContent='격전지(협동)';
 prepared.stage.querySelector('.battle-v3-header small').textContent='3인 공동 전투';
 const renderer=await live.createRenderer({...prepared,modal:host,data:payload,mode:'RAID',playUltimateCinematics:false});
 const api=window.ProjectVPixiBattle;await api.restoreDeployedFormation();
 let groups=[],cursor=0,version=0,startsAt=0,offset=0,active=false,destroyed=false,frame=null,lastSync=0;
 const groupEvents=timeline=>{
  const result=[];
  for(const event of timeline.filter(e=>e.type!=='RESULT')){
   const last=result.at(-1);
   if(last?.id===event.combatGroup)last.events.push(event);
   else result.push({id:event.combatGroup,at:Number(event.combatAtMs)||0,events:[event]});
  }return result.sort((a,b)=>a.at-b.at);
 };
 function sync(){
  if(!frame)return;
  api.syncFinalState({A:frame.A.filter(f=>!f.isMercenary),B:frame.B,mercenaries:{A:frame.A.filter(f=>f.isMercenary),B:[]}});
 }
 function update(value){
  offset=value.serverNow-Date.now();frame=value.state.fighters;
  const state=value.state;startsAt=state.startsAt||0;active=state.status==='ACTIVE'&&!state.myResult;
  if(value.payload){groups=groupEvents(value.payload.battleV2.result.timeline);version++;api.cancelActiveAnimations();cursor=0;
   const elapsed=startsAt?Date.now()+offset-startsAt:0;while(cursor<groups.length&&groups[cursor].at<elapsed-300)cursor++;sync();}
  if(!active&&state.status!=='LOADING'){api.cancelActiveAnimations();sync();}
 }
 function pump(){
  if(destroyed)return;
  if(active&&startsAt){
   const elapsed=Date.now()+offset-startsAt;
   if(cursor<groups.length&&elapsed-groups[cursor].at>1200){version++;api.cancelActiveAnimations();while(cursor<groups.length&&groups[cursor].at<elapsed-100)cursor++;sync();lastSync=elapsed;}
   while(cursor<groups.length&&groups[cursor].at<=elapsed){
    const group=groups[cursor++],epoch=version;
    void api.playEvents(group.events,{timedInternal:true}).catch(()=>{if(epoch===version)sync();});
   }
   if(elapsed-lastSync>5000&&cursor>=groups.length){sync();lastSync=elapsed;}
  }
  raf=requestAnimationFrame(pump);
 }
 let raf=requestAnimationFrame(pump);
 update({serverNow:Date.now(),state:{status:'LOADING',battleRevision:0},payload});
 return {update,destroy(){destroyed=true;cancelAnimationFrame(raf);version++;api.cancelActiveAnimations();renderer.destroy();},diagnostics:()=>({cursor,groups:groups.length,startsAt,engine:api.diagnostics()})};
}
