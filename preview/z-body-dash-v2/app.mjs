import {DASH_V2_SEQUENCE} from './source/DashProfile.mjs';
const controls=parent.document,$=id=>controls.getElementById(id);
let engine,paused=false,mode='dash',profile='v2',loop=false,playing=false,replay=false,playGeneration=0;
const manifest=await(await fetch('/assets/ui/project-v/account-battle-suits/z-sword-v1/manifest.json')).json();
// This is the existing local account/server snapshot, with the live art adapters.
const payload=await(await fetch('../z-body-live-v1/fixture.json')).json();
window.cnineCardCatalog=()=>payload.cards;
try{
  await new Promise(resolve=>document.readyState==='complete'?resolve():window.addEventListener('load',resolve,{once:true}));
  const api=window.ProjectVPixiBattle,mount=api.mountForBattle;
  api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'Z-BODY 검수',opponentName:payload.monster.name});
  await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:'Z-BODY 검수'});
  api.mountForBattle=mount;await engine.deployCards({instant:true,force:true});
  engine.accountBattleUnitIsPaused=()=>paused;
  const receipts=payload.battleV2.result.timeline.filter(e=>e.actorKind==='BATTLE_SUIT'&&e.type==='TURN');
  const snapshot=()=>{
    const sword=engine.accountBattleUnit?.swordAnimation,u=engine.accountBattleUnit;
    return{...sword?.diagnostics(),paused,activeTimelines:engine.simpleTimelines.size,events:engine.accountBattleUnitDamageEventCount,damage:engine.accountBattleUnitDamageTotal,
      queue:engine.accountBattleUnitDamageQueue.length,unitPosition:u?{x:u.root.x,y:u.root.y,baseX:u.root.baseX,baseY:u.root.baseY}:null,
      unitScale:u?{root:u.root.scale.x,bodyX:u.bodySprite.scale.x,bodyY:u.bodySprite.scale.y}:null};
  };
  let last='';
  function update(){
    const s=snapshot(),text=JSON.stringify(s);
    if(text!==last){$('health').textContent=text;last=text;}
    $('state').textContent=(profile==='v2'?'개선 모션':'기존 모션')+' · '+(paused?'일시정지':s.mode==='ready'?'준비':s.mode==='area'?'광역기':'돌진 검격');
  }
  function entries(){
    const first=receipts[0]?.targetId;
    return receipts.filter(event=>mode==='area'||event.targetId===first).slice(0,15).map(event=>({
      target:engine.combatantById(event.targetId),options:{damage:Number(event.damage||0)+Number(event.absorbed||0),critical:event.critical,
        targetHp:engine.eventHpPercent(engine.combatantById(event.targetId),event.targetHpAfter),authoritative:!event.dodge,monotonicHp:true,authoritativeEvent:event}
    })).filter(e=>e.target);
  }
  async function play(next='dash',{holdAt=null}={}){
    if(replay)return;
    const generation=++playGeneration;
    engine.resetVisualSession({preserveTargets:true});mode=next;paused=false;playing=true;
    await engine.deployCards({instant:true,force:true});
    if(generation!==playGeneration)return;
    engine.accountBattleUnit.swordAnimation.dashProfile=profile;
    const rows=entries(),impacts=next==='area'?manifest.impactsMs:[manifest.attack.sequences.dash.contactAtMs];
    const pending=engine.playAccountBattleUnitSwordBatch({mode:next,entries:rows,
      impacts:rows.map((entry,i)=>({entry,atMs:impacts[Math.min(impacts.length-1,Math.floor(i*impacts.length/rows.length))]}))});
    if(holdAt!==null){
      paused=true;const timeline=engine.accountBattleUnit.swordAnimation.timeline;
      timeline?.pause();timeline?.totalTime(holdAt/1000,false);
    }
    await pending;if(generation===playGeneration)playing=false;update();
  }
  const stopLoop=()=>{loop=false;$('repeat').setAttribute('aria-pressed','false');};
  const cancel=()=>{playGeneration++;stopLoop();engine.cancelTimelines();paused=false;playing=false;update();};
  $('dash').onclick=()=>{stopLoop();void play('dash');};$('area').onclick=()=>{stopLoop();void play('area');};
  for(const [id,value] of [['new','v2'],['old','legacy']])$(id).onclick=()=>{
    cancel();profile=value;
    $('new').setAttribute('aria-pressed',String(profile==='v2'));$('old').setAttribute('aria-pressed',String(profile==='legacy'));
    $('seek').max=profile==='v2'?639:1694;void play('dash');
  };
  $('pause').onclick=()=>{paused=true;update();};$('resume').onclick=()=>{paused=false;update();};
  $('cancel').onclick=cancel;$('speed').onchange=()=>{engine.paceScale=Number($('speed').value);};
  $('repeat').onclick=()=>{
    loop=!loop;$('repeat').setAttribute('aria-pressed',String(loop));paused=false;
    if(loop&&!playing)void play('dash');
  };
  $('travel').onclick=()=>{stopLoop();void play('dash',{holdAt:profile==='v2'?135:485});};
  $('contact').onclick=()=>{stopLoop();void play('dash',{holdAt:profile==='v2'?DASH_V2_SEQUENCE.contactAtMs:manifest.attack.sequences.dash.contactAtMs});};
  $('seek').oninput=()=>{
    stopLoop();const ms=Number($('seek').value),sword=engine.accountBattleUnit.swordAnimation;
    if(!sword.timeline||mode!=='dash')void play('dash',{holdAt:ms});
    else{paused=true;sword.timeline.pause();sword.timeline.totalTime(ms/1000,false);update();}
  };
  $('run').onclick=async()=>{
    cancel();replay=true;$('run').disabled=true;$('result').textContent='서버 영수증 전체 재생 중';
    try{
      await engine.setBattlePayload(payload);await engine.deployCards({instant:true,force:true});
      engine.accountBattleUnit.swordAnimation.dashProfile=profile;
      engine.startAccountBattleUnitSustainedFire();
      await engine.playEvents(payload.battleV2.result.timeline,{isPaused:()=>paused});
      await engine.stopAccountBattleUnitSustainedFire({drain:true});
      const expectedEvents=receipts.filter(e=>!e.dodge).length,expectedDamage=receipts.filter(e=>!e.dodge).reduce((n,e)=>n+Number(e.damage||0)+Number(e.absorbed||0),0);
      const actualEvents=engine.accountBattleUnitDamageEventCount,actualDamage=engine.accountBattleUnitDamageTotal;
      $('result').textContent=JSON.stringify({pass:expectedEvents===actualEvents&&expectedDamage===actualDamage,expectedEvents,actualEvents,expectedDamage,actualDamage,sword:snapshot()});
    }catch(error){$('result').textContent=error.stack;console.error(error);}
    finally{replay=false;$('run').disabled=false;update();}
  };
  for(const b of controls.querySelectorAll('button'))b.disabled=false;
  let gap=0;
  engine.app.ticker.add(t=>{
    update();
    if(loop&&!paused&&!playing&&!replay){gap+=t.deltaMS;if(gap>=260){gap=0;void play('dash');}}else gap=0;
  });
  window.addEventListener('pagehide',()=>{loop=false;engine.destroy();},{once:true});
  update();
}catch(error){$('health').textContent=error.stack;$('state').textContent='불러오기 실패';console.error(error);}
