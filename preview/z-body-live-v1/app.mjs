const controls=parent.document,$=id=>controls.getElementById(id);
let engine,paused=false,pending,mode='dash';
const manifest=await (await fetch('/assets/ui/project-v/account-battle-suits/z-sword-v1/manifest.json')).json();
const payload=await (await fetch('fixture.json')).json();
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
  function update(){const s=engine.accountBattleUnit?.swordAnimation?.diagnostics();$('health').textContent=JSON.stringify({mode:s?.mode,frame:s?.frame,time:s?.timeMs,bodyScale:s?.bodyScale,events:engine.accountBattleUnitDamageEventCount,damage:engine.accountBattleUnitDamageTotal,queue:engine.accountBattleUnitDamageQueue.length,paused,activeTimelines:engine.simpleTimelines.size});}
  function entries(){return receipts.slice(0,15).map(event=>({target:engine.combatantById(event.targetId),options:{damage:Number(event.damage||0)+Number(event.absorbed||0),critical:event.critical,targetHp:engine.eventHpPercent(engine.combatantById(event.targetId),event.targetHpAfter),authoritative:!event.dodge,monotonicHp:true,authoritativeEvent:event}})).filter(e=>e.target);}
  async function play(next){
    engine.accountBattleUnit.cancelFire();mode=next;paused=false;
    await engine.deployCards({instant:true,force:true});
    const rows=entries(),impacts=next==='area'?manifest.impactsMs:[manifest.attack.sequences.dash.contactAtMs];
    pending=engine.playAccountBattleUnitSwordBatch({mode:next,entries:rows,impacts:rows.map((entry,i)=>({entry,atMs:impacts[Math.min(impacts.length-1,Math.floor(i*impacts.length/rows.length))]}))});
    await pending;update();
  }
  $('dash').onclick=()=>void play('dash');$('area').onclick=()=>void play('area');
  $('pause').onclick=()=>{paused=true;update();};$('resume').onclick=()=>{paused=false;update();};
  $('cancel').onclick=()=>{engine.cancelTimelines();paused=false;update();};
  $('contact').onclick=()=>{paused=true;const t=engine.accountBattleUnit.swordAnimation?.timeline;t?.pause();t?.totalTime(mode==='area'?1.21:.245);update();};
  $('speed').onchange=()=>{engine.paceScale=Number($('speed').value);};
  $('run').onclick=async()=>{
    $('run').disabled=true;paused=false;$('result').textContent='서버 영수증 전체 재생 중';
    try{
      engine.cancelTimelines();await engine.setBattlePayload(payload);await engine.deployCards({instant:true,force:true});
      engine.startAccountBattleUnitSustainedFire();
      await engine.playEvents(payload.battleV2.result.timeline,{isPaused:()=>paused});
      await engine.stopAccountBattleUnitSustainedFire({drain:true});
      const expectedEvents=receipts.filter(e=>!e.dodge).length,expectedDamage=receipts.filter(e=>!e.dodge).reduce((n,e)=>n+Number(e.damage||0)+Number(e.absorbed||0),0);
      const actualEvents=engine.accountBattleUnitDamageEventCount,actualDamage=engine.accountBattleUnitDamageTotal;
      const result={pass:expectedEvents===actualEvents&&expectedDamage===actualDamage,expectedEvents,actualEvents,expectedDamage,actualDamage,sword:engine.accountBattleUnit.swordAnimation.diagnostics()};
      for(const code of ['BATTLE_SUIT_H_BODY','BATTLE_SUIT_S_BODY']){
        await engine.configureAccountBattleUnit({...payload,equippedBattleSuit:{...payload.equippedBattleSuit,code}});
        const u=engine.accountBattleUnit,p=u.authoredProfile;
        result[code]={gun:!u.swordAnimation&&u.hasAuthoredAnimation(),height:u.bodySprite.height*(p.contentBottom-p.nameHud.contentTop)};
      }
      await engine.configureAccountBattleUnit({...payload,mode:'PVP',v3RenderContext:{accountBattleUnitPve:false}});
      result.pvpExcluded=!engine.accountBattleUnitEnabled;
      await engine.configureAccountBattleUnit(payload);await engine.deployCards({instant:true,force:true});
      $('result').textContent=JSON.stringify(result);update();
    }catch(error){$('result').textContent=error.stack;console.error(error);}
    finally{$('run').disabled=false;}
  };
  for(const b of controls.querySelectorAll('button'))b.disabled=false;
  engine.app.ticker.add(update);update();
  window.addEventListener('pagehide',()=>engine.destroy(),{once:true});
}catch(error){$('health').textContent=error.stack;console.error(error);}
