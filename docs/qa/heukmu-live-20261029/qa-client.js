(()=>{
 localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
 const panel=document.createElement('div');panel.id='heukmu-qa';panel.style='position:fixed;z-index:2147483647;bottom:0;left:0;right:0;background:#101325;color:white;padding:6px;font:12px monospace;max-height:22vh;overflow:auto';
 panel.innerHTML='<button id="qa-pvp">PVP 검사</button><button id="qa-hunt">PVE 검사</button><button id="qa-run">전체 전투 검사</button><button id="qa-cast">흑룡천겁 정지</button><button id="qa-ult">암월멸검 정지</button><button id="qa-idle">대기 복귀</button><button id="qa-death">사망 검사</button><pre id="qa-status">검사 준비</pre>';document.body.append(panel);
 const status=panel.querySelector('pre'),reports=[],errors=[];let state,field='PVP';
 addEventListener('error',e=>{errors.push(e.message);status.textContent=JSON.stringify({errors},null,2)});
 const check=(value,msg)=>{if(!value)throw Error(msg);};
 const report=extra=>{const e=state?.engine;status.textContent=JSON.stringify({field,ready:!!e,allies:e?.allies.length,enemies:e?.enemies.length,actors:e?[...e.heukmuStates.values()].map(s=>({side:s.actor.team,mode:s.fx.mode,hp:s.actor.hp,handError:s.fx.diagnostics().sword.handError,body:s.fx.diagnostics().bodyRegistration,position:{x:s.actor.root.x,y:s.actor.root.y},auraFixed:s.fx.diagnostics().auraFixed,effects:s.fx.diagnostics().activeEffects})):[],reports,errors,...extra},null,2);};
 const button=(id,fn)=>document.getElementById(id).onclick=()=>Promise.resolve().then(fn).catch(e=>{errors.push(e.stack||e.message);report()});
 async function init(next){
  field=next;status.textContent='실제 메인 렌더러 준비 중';
  if(state){state.renderer?.destroy?.();state.engine?.destroy?.();state=null;}
  API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'흑무 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('buy');await ensureFeatureResources('battleV2');
  if(!document.getElementById('modal'))document.body.insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');document.querySelector('[data-miracle-close]')?.click();
  if(field==='HUNT')await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/preview/sustained-hunt-v2/battle.bundle.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});
  const {deck,data}=await (await fetch('/__qa/data?field='+field)).json();window.cnineCardCatalog=()=>deck;const api=ProjectVPixiBattle,original=api.mountForBattle;let engine;
  api.mountForBattle=async(...args)=>(engine=await original(...args));
  try{const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'흑무 검수',opponentName:'검수 상대'});const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode:field,playerName:'흑무 검수'});await engine.deployCards({instant:true,force:true});state={engine,renderer};}finally{api.mountForBattle=original;}
  for(let i=0;i<500&&engine.heukmuStates?.size!==(field==='HUNT'?1:2);i++)await new Promise(r=>setTimeout(r,50));
  check(engine.heukmuStates?.size===(field==='HUNT'?1:2),'흑무 리소스 로딩');check(engine.enemies.length===(field==='HUNT'?12:5),'적 슬롯 수');
  for(const s of engine.heukmuStates.values()){const d=s.fx.diagnostics();check(d.sword.handError<1e-6,'손잡이 정합');check(d.bodyRegistration.renderedReference===285,'원본 신장');check(s.actor.team==='ALLY'?s.fx.facing()>0:s.fx.facing()<0,'좌우 방향');}
  report({initialized:true,runtime:ProjectVPixiBattle.runtimeVersion});
 }
 button('qa-pvp',()=>init('PVP'));button('qa-hunt',()=>init('HUNT'));
 const idle=()=>{for(const s of state.engine.heukmuStates.values()){s.fx.cancel();s.fx.startAmbient();}report();};button('qa-idle',idle);
 function peak(mode){const e=state.engine,s=[...e.heukmuStates.values()].find(s=>s.actor.team==='ALLY');s.fx.begin(mode,e.enemies);s.fx.render(s.fx.plan.peak);report({peak:mode});}
 button('qa-cast',()=>peak('cast'));button('qa-ult',()=>peak('ultimate'));
 button('qa-death',()=>{for(const s of state.engine.heukmuStates.values()){const hp=s.actor.hp;s.actor.setHp(0);check(!s.fx.rear.visible&&!s.fx.sword.visible&&!s.fx.coilFrontGroup.visible,'사망 효과 제거');s.actor.setHp(hp);check(s.fx.sword.visible,'부활 복구');}report({deathRevivePassed:true});});
 button('qa-run',async()=>{
  const e=state.engine;errors.length=0;reports.length=0;
  for(const s of e.heukmuStates.values()){
   const actor=s.actor,targets=actor.team==='ALLY'?e.enemies:e.allies,home={x:actor.baseX,y:actor.baseY};
   for(let i=0;i<2;i++){let hits=0;await e.normalAttack(0,{attacker:actor,target:targets[0],damage:1,targetHp:90,onImpact:()=>hits++});check(hits===1,'일반 공격 피해 1회');check(Math.abs(actor.root.x-home.x)<1e-6&&Math.abs(actor.root.y-home.y)<1e-6,'원위치 복귀');reports.push({side:actor.team,...e.lastMercenaryPlayback,handError:s.fx.diagnostics().sword.handError});report();}
   if(field==='HUNT')for(const skillId of ['MS-915','MS-916']){
    const applied=[],original=e.syncTargetHp;e.syncTargetHp=function(t,v){applied.push(t.id);return original.call(this,t,v)};
    try{await e.playMercenaryEvent({type:'MERCENARY_HEUKMU_AREA',battleMode:'PVE',actorId:actor.id,skillId,hits:targets.map(t=>({targetId:t.id,damage:10,absorbed:0,targetHpAfter:t.serverMaxHp*.9,targetMaxHp:t.serverMaxHp,targetShieldAfter:0,targetMaxShield:0}))});}finally{e.syncTargetHp=original;}
    check(applied.length===12&&new Set(applied).size===12,'광역 대상당 피해 1회');check(s.fx.mode==='idle'&&s.fx.effectFrames.length===0,'스킬 종료 잔상 제거');reports.push({...e.lastMercenaryPlayback,uniqueApplications:new Set(applied).size});report();
   }
   const f=s.fx,poses=[actor.root.x,actor.root.y,f.auraSprites[0].x,f.auraSprites[0].y];f.renderAura(.1);f.renderAura(1.7);check(JSON.stringify(poses)===JSON.stringify([actor.root.x,actor.root.y,f.auraSprites[0].x,f.auraSprites[0].y]),'대기 발판 고정');
   f.begin('ultimate',targets);f.render(2.6);f.cancel();check(f.effectFrames.length===0&&f.area.blades.every(b=>!b.visible),'중단시 효과 정리');f.startAmbient();
  }
  report({allChecksPassed:true});
 });
})();
