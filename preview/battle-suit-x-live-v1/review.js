/* Runs the actual shipped loader, engine, item resolver and skill factory. */
(async()=>{
 const fixtures=await fetch('fixtures.json').then(r=>r.json());let engine,paused=false,kind='multi',done=null;
 window.cnineCardCatalog=()=>fixtures[kind].cards;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>engine=await mount(...args);
 try{
  const p=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'X-BODY',opponentName:'운영 연결 검수'});
  p.stage.querySelector('.battle-v3-canvas-host').style.backgroundImage='none';
  await window.ProjectVBattleV3Live.createRenderer({...p,modal:document.getElementById('modal'),data:fixtures[kind],mode:'HUNT',playerName:'X-BODY'});
 }finally{api.mountForBattle=mount;}
 engine.accountBattleUnitIsPaused=()=>paused;engine.audio?.stop?.();
 const stop=()=>{paused=false;engine.cancelTimelines();};
 async function reset(next='multi'){
  stop();kind=next;await engine.setBattlePayload(fixtures[kind]);await engine.deployCards({instant:true,force:true});
  engine.accountBattleUnitDamageEventCount=0;engine.accountBattleUnitDamageTotal=0;
 }
 let skillHits=0,skillDamage=0,error=null;
 const after=event=>{if(event.type==='SKILL_CHIP_HIT'){skillHits++;skillDamage+=event.damage+event.absorbed;}};
 async function skill({holdAt=null,full=false}={}){
  await reset(kind);skillHits=skillDamage=0;error=null;
  if(full)engine.startAccountBattleUnitSustainedFire();
  done=engine.playEvents(full?fixtures[kind].battleV2.result.timeline:fixtures[kind].review.castEvents,{isPaused:()=>paused,afterEvent:after});
  done.catch(e=>{error=e.stack;console.error(e);});
  await engine.skillChipPlayback.ready;
  if(holdAt!==null){
   const p=engine.skillChipPlayback;p.timeline.pause();paused=true;
   for(let ms=0;ms<=12000&&p.active;ms+=10){
    p.timeline.time(ms/1000,true);paused=false;p.pump();paused=true;await Promise.resolve();
    const entry=[...p.fx.values()].find(e=>e.started);
    if(entry&&p.clock.time-entry.at>=holdAt-.0001)break;
   }
   p.render();p.timeline?.pause();
  }
 }
 async function normal(mode='attack'){
  await reset(kind);
  const events=fixtures[kind].battleV2.result.timeline.filter(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge).slice(0,6);
  const same=events.filter(e=>e.targetId===events[0].targetId);
  const entries=same.map(event=>({target:engine.combatantById(event.targetId),options:{damage:event.damage+event.absorbed,critical:event.critical,authoritative:true,authoritativeEvent:event,targetHp:engine.eventHpPercent(engine.combatantById(event.targetId),event.targetHpAfter)}}));
  const sword=engine.accountBattleUnit.swordAnimation;sword.actionIndex=mode==='skill'?1:0;
  done=engine.playAccountBattleUnitSwordBatch(sword.takeBatch(entries));done.catch(console.error);return same.reduce((n,e)=>n+e.damage+e.absorbed,0);
 }
 await reset();
 window.XBodyLiveReview={engine,fixtures,reset,stop,skill,normal,get done(){return done;},pause(value){paused=value;engine.skillChipPlayback?.syncPause();},diagnostics(){
  return{kind,skillHits,skillDamage,expectedHits:fixtures[kind].review.expectedHits,expectedDamage:fixtures[kind].review.expectedDamage,error,
   sword:engine.accountBattleUnit?.swordAnimation?.diagnostics(),playback:engine.skillChipPlayback?.diagnostics(),queue:engine.accountBattleUnitDamageQueue?.length||0,timelines:engine.simpleTimelines.size,
   normalHits:engine.accountBattleUnitDamageEventCount,normalDamage:engine.accountBattleUnitDamageTotal,allies:engine.allies.length,enemies:engine.enemies.filter(e=>e.root.visible).length};
 }};
 window.addEventListener('pagehide',()=>{stop();engine.destroy();},{once:true});
})().catch(error=>{document.getElementById('modal').textContent=error.stack;console.error(error);});
