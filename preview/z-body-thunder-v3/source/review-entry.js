import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {BattleSuitSkillChipPlayback} from '../../project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {ZBodyDashFX} from '../../project-v-v3/source/battle/ZBodyDashFX.mjs';
import {Z_BODY_AREA_SKILL as SKILL} from '../../../shared/z-body-area-skill.mjs';

const doc=parent.document,$=id=>doc.getElementById(id);
let engine,fixtures,playback,paused=false,generation=0,kind='multi',legacy=false,legacyTimeline=null,actualHits=0,actualDamage=0,fullRun=false,action='normal';
const ordinary=()=>fixtures[kind].battleV2.result.timeline.filter(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge).slice(0,1);
const expected=()=>{
  if(fullRun){const hits=fixtures[kind].battleV2.result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT');return{expectedHits:hits.length,expectedDamage:hits.reduce((n,e)=>n+e.damage+e.absorbed,0)};}
  return action==='normal'?{expectedHits:1,expectedDamage:ordinary()[0].damage+ordinary()[0].absorbed}:fixtures[kind].review;
};
const diagnostics=()=>({mode:legacy?'previous':'new',action,targets:kind,paused,expectedHits:expected().expectedHits,actualHits,expectedDamage:expected().expectedDamage,actualDamage,
  playback:playback?.diagnostics(),sword:engine.accountBattleUnit?.swordAnimation?.diagnostics(),activeTimelines:engine.simpleTimelines.size});
function update(){
  if(!fullRun&&(legacy||action==='normal')){actualHits=engine.accountBattleUnitDamageEventCount||0;actualDamage=engine.accountBattleUnitDamageTotal||0;}
  const state=diagnostics(),seconds=(playback?.clock.time||engine.accountBattleUnit?.swordAnimation?.timeMs/1000||0);
  $('time').textContent=seconds.toFixed(2)+'s';
  $('damage').textContent=actualDamage.toLocaleString();
  $('hits').textContent=actualHits+' / '+expected().expectedHits;
  $('state').textContent=paused?'일시정지':(playback?.active||legacyTimeline)?'재생 중':'준비';
  $('health').textContent=JSON.stringify(state,null,2);
}
function install(){
  const sword=engine.accountBattleUnit?.swordAnimation;
  if(!sword?.intrinsicArea||!engine.battleSuitSkillEffectFactories?.has(SKILL.code))throw Error('운영 Z바디 고유 스킬 연결이 없습니다.');
  if(legacy&&!fullRun){sword.dashFX.destroy();sword.dashFX=new ZBodyDashFX(engine,sword.unit,sword.textures);}
}
function stop(){
  generation++;playback?.cancel();playback=null;void engine?.stopAccountBattleUnitSustainedFire();engine?.cancelTimelines();legacyTimeline=null;paused=false;
}
async function play({holdAt=null}={}){
  if(fullRun)return;
  stop();const token=generation;
  await engine.setBattlePayload(fixtures[kind]);await engine.deployCards({instant:true,force:true});
  if(token!==generation)return;
  install();actualHits=0;actualDamage=0;engine.accountBattleUnitDamageEventCount=0;engine.accountBattleUnitDamageTotal=0;
  if(legacy||action==='normal'){
    const events=action==='normal'?ordinary():expected().castEvents.filter(e=>e.type==='SKILL_CHIP_HIT');
    const entries=events.map(event=>({target:engine.combatantById(event.targetId),options:{damage:event.damage+event.absorbed,critical:event.critical,authoritative:true,authoritativeEvent:event,targetHp:engine.eventHpPercent(engine.combatantById(event.targetId),event.targetHpAfter)}}));
    const batch={mode:action==='normal'?'dash':'area',entries,impacts:entries.map((entry,i)=>({entry,atMs:action==='normal'?245:events[i].combatAtMs}))};
    const pending=engine.playAccountBattleUnitSwordBatch(batch);legacyTimeline=engine.accountBattleUnit.swordAnimation.timeline;
    if(holdAt!==null){paused=true;legacyTimeline.pause().totalTime(holdAt,false);}
    void pending.then(()=>{if(token===generation){legacyTimeline=null;update();}});
  }else{
    const rows=fixtures[kind].review.castEvents;
    playback=new BattleSuitSkillChipPlayback(engine,rows,{isPaused:()=>paused,afterEvent:event=>{
      if(event.type==='SKILL_CHIP_HIT'){actualHits++;actualDamage+=event.damage+event.absorbed;}
    }});
    engine.skillChipPlayback=playback;
    const pending=playback.play();
    // start() finishes its cached texture/audio setup on the next microtask.
    await playback.ready;
    if(token!==generation)return;
    if(holdAt!==null){
      paused=true;playback.timeline?.pause();
      // Pump chronologically so earlier contacts retain their true age.
      for(const ms of [0,...SKILL.impactOffsetsMs,holdAt*1000].filter(ms=>ms<=holdAt*1000).sort((a,b)=>a-b)){
        playback.timeline?.time(ms/1000,true);
        const saved=paused;paused=false;playback.pump();paused=saved;
      }
      playback.render();playback.timeline?.pause();
    }
    void pending.then(()=>{if(token===generation)update();}).catch(error=>{$('state').textContent=error.message;console.error(error);});
  }
  update();
}
async function verifyBattle(){
  if(fullRun)return;
  stop();const token=generation;fullRun=true;$('verify').disabled=true;$('verification').textContent='전체 서버 기록 재생 중';
  try{
    await engine.setBattlePayload(fixtures[kind]);await engine.deployCards({instant:true,force:true});install();
    engine.accountBattleUnitDamageEventCount=0;engine.accountBattleUnitDamageTotal=0;actualHits=0;actualDamage=0;
    const events=fixtures[kind].battleV2.result.timeline;
    engine.previewSpeed=2;engine.paceScale=2;engine.startAccountBattleUnitSustainedFire();
    const done=engine.playEvents(events,{isPaused:()=>paused,afterEvent:event=>{if(event.type==='SKILL_CHIP_HIT'){actualHits++;actualDamage+=event.damage+event.absorbed;}}});
    playback=engine.skillChipPlayback;await done;await engine.stopAccountBattleUnitSustainedFire({drain:true});
    if(token!==generation){$('verification').textContent='검증 재생 중단';return;}
    const suitEvents=events.filter(e=>e.actorKind==='BATTLE_SUIT'&&e.type==='TURN'&&!e.dodge);
    const skillEvents=events.filter(e=>e.type==='SKILL_CHIP_HIT');
    const wanted=suitEvents.reduce((n,e)=>n+e.damage+e.absorbed,0),skillWanted=skillEvents.reduce((n,e)=>n+e.damage+e.absorbed,0);
    $('verification').textContent=JSON.stringify({pass:wanted===engine.accountBattleUnitDamageTotal&&skillWanted===actualDamage&&skillEvents.length===actualHits,
      expectedOrdinaryHits:suitEvents.length,actualOrdinaryHits:engine.accountBattleUnitDamageEventCount,
      expectedOrdinaryDamage:wanted,actualOrdinaryDamage:engine.accountBattleUnitDamageTotal,expectedSkillDamage:skillWanted,actualSkillDamage:actualDamage,
      expectedSkillHits:skillEvents.length,actualSkillHits:actualHits,remainingQueue:engine.accountBattleUnitDamageQueue.length,remainingEffects:playback.fx.size},null,2);
  }catch(error){$('verification').textContent=error.stack;console.error(error);}
  finally{fullRun=false;$('verify').disabled=false;engine.previewSpeed=Number($('speed').value);engine.paceScale=engine.previewSpeed;update();}
}
async function main(){
  fixtures=await (await fetch('fixtures.json')).json();
  window.cnineCardCatalog=()=>fixtures[kind].cards;
  await new Promise(resolve=>document.readyState==='complete'?resolve():window.addEventListener('load',resolve,{once:true}));
  const api=window.ProjectVPixiBattle,mount=api.mountForBattle;
  api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
  try{
    const loading=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'Z-BODY',opponentName:'뇌검 집행 · 광역 검수'});
    await window.ProjectVBattleV3Live.createRenderer({...loading,modal:document.getElementById('modal'),data:fixtures[kind],mode:'HUNT',playerName:'Z-BODY'});
  }finally{api.mountForBattle=mount;}
  engine.accountBattleUnitIsPaused=()=>paused;
  install();
  $('play').onclick=()=>void play();
  $('verify').onclick=()=>void verifyBattle();
  $('pause').onclick=()=>{paused=!paused;legacyTimeline?.paused(paused);playback?.syncPause();update();};
  $('stop').onclick=()=>{stop();update();};
  $('speed').onchange=()=>{engine.paceScale=Number($('speed').value);if(legacyTimeline)legacyTimeline.timeScale(engine.paceScale);playback?.pump();};
  $('targets').onchange=()=>{kind=$('targets').value;void play();};
  $('action').onchange=()=>{
    action=$('action').value;$('seek').max=action==='normal'?'640':'3100';
    $('peak').textContent=action==='normal'?'검 궤적':'광역 충돌';void play();
  };
  for(const [id,old] of [['new',false],['old',true]])$(id).onclick=()=>{
    legacy=old;$('new').setAttribute('aria-pressed',String(!legacy));$('old').setAttribute('aria-pressed',String(legacy));void play();
  };
  for(const [id,ms,normalMs] of [['charge',740,130],['contact',1080,245],['peak',1340,275],['tail',2200,510]])$(id).onclick=()=>void play({holdAt:(action==='normal'?normalMs:ms)/1000});
  $('seek').onchange=()=>void play({holdAt:Number($('seek').value)/1000});
  for(const button of doc.querySelectorAll('button'))button.disabled=false;
  engine.app.ticker.add(update);
  window.addEventListener('pagehide',()=>{
    stop();engine.destroy();
  },{once:true});
  // Expose read-only visible diagnostic state for the embedded review panel.
  window.zThunderReview={snapshot:diagnostics};
  await play({holdAt:.245});
}
main().catch(error=>{$('state').textContent='불러오기 실패';$('health').textContent=error.stack;console.error(error);});
