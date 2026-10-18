const modal=document.getElementById('modal');
let engine,fx,paused=false,enabled=true,round=0,epoch=0,disposed=false,playbackRate=1;
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function waitPlayable(run){while(!disposed&&run===epoch&&(paused||document.hidden))await nextFrame();return !disposed&&run===epoch;}
try{
 while(!window.ProjectVPixiBattle||!window.ProjectVBattleV3Live)await nextFrame();
 const payload=await fetch('./fixture-'+(['pve','coop'].includes(new URLSearchParams(location.search).get('mode'))?new URLSearchParams(location.search).get('mode'):'pvp')+'.json').then(r=>{if(!r.ok)throw Error('시연 전투를 읽지 못했습니다.');return r.json();});
 window.cnineCardCatalog=()=>payload.cards;
 const api=window.ProjectVPixiBattle,originalMount=api.mountForBattle;
 api.mountForBattle=async(...args)=>engine=await originalMount(...args);
 const prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:payload.mode,playerName:'아르덴 +10',opponentName:payload.mode==='PVP'?'엠퍼러 +10':'시연 전투'});
 try{await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:payload.mode,playerName:'아르덴 +10',opponentName:payload.mode==='PVP'?'엠퍼러 +10':'시연 전투'});}finally{api.mountForBattle=originalMount;}
 modal.classList.add('emperor-preview');
 const header=prepared.stage.querySelector('.battle-v3-header');
 header.querySelector('small').textContent='유저 장비 세트 · 전투 화면 시연';
 header.querySelector('strong').textContent='아르덴 · 엠퍼러 +10 전투 효과';
 const phase=header.querySelector('#battlePhase');phase.hidden=true;
 const tools=document.createElement('nav');tools.className='preview-tools';tools.setAttribute('aria-label','전투 효과 시연 조작');
 tools.innerHTML='<button type="button" data-effect aria-pressed="true">효과 끄기</button><button type="button" data-pause aria-pressed="false">일시정지</button><button type="button" data-speed>1배속</button><button type="button" data-replay>다시 재생</button>';
 header.append(tools);
 const hint=document.createElement('p');hint.className='preview-hint';hint.textContent=payload.mode==='RAID'?'분대 1 아르덴 · 분대 2 엠퍼러 · 분대 3 없음':payload.mode==='PVP'?'4부위 모두 +10 · 왼쪽 아르덴 / 오른쪽 엠퍼러':'상의·하의·신발·장신구 모두 +10 · 아군 진영 적용';
 header.querySelector('div').append(hint);
 engine.audio?.stop?.();
 document.removeEventListener('visibilitychange',engine.onVisibility);
 const heldTimelines=new Set();
 const originalTimeline=engine.timeline.bind(engine);
 engine.timeline=(build,...rest)=>originalTimeline(t=>{build(t);queueMicrotask(()=>{if(!disposed&&(paused||document.hidden)&&!t.paused()){heldTimelines.add(t);t.pause();}});},...rest);
 const originalSpeed=engine.actionPlaybackSpeed.bind(engine);
 engine.actionPlaybackSpeed=(...args)=>originalSpeed(...args)*playbackRate;
 const effectButton=tools.querySelector('[data-effect]'),pauseButton=tools.querySelector('[data-pause]'),speedButton=tools.querySelector('[data-speed]');
 function syncPause(){
  const hold=paused||document.hidden;
  const timelines=[...engine.simpleTimelines].map(row=>row.instance);
  for(const actor of engine.characters)for(const animation of new Set([actor.animationAdapter,actor.animationController]))if(animation?.timeline)timelines.push(animation.timeline);
  if(hold){for(const timeline of timelines)if(!timeline.paused()){heldTimelines.add(timeline);timeline.pause();}}
  else{for(const timeline of heldTimelines)timeline.resume();heldTimelines.clear();}
 }
 function setPaused(value){
  paused=Boolean(value);pauseButton.textContent=paused?'재생':'일시정지';pauseButton.setAttribute('aria-pressed',String(paused));
  syncPause();
 }
 effectButton.onclick=()=>{enabled=!enabled;void replay().catch(fail);effectButton.textContent=enabled?'효과 끄기':'효과 켜기';effectButton.setAttribute('aria-pressed',String(enabled));};
 pauseButton.onclick=()=>setPaused(!paused);
 speedButton.onclick=()=>{const old=playbackRate;playbackRate=playbackRate===1?.5:playbackRate===.5?2:1;speedButton.textContent=playbackRate+'배속';for(const row of engine.simpleTimelines)row.instance.timeScale(row.instance.timeScale()*playbackRate/old);};
 const events=payload.battleV2.result.timeline.filter(e=>!['DEPLOY','RESULT','FINISH'].includes(e.type));
 async function replay(){
  const run=++epoch;setPaused(false);fx?.destroy();engine.cancelTimelines();round++;
  const next=structuredClone(payload);
  if(!enabled)for(const team of Object.values(next.battleV2.teams)){delete team.equipmentSetVisual;for(const m of team.members||[])delete m.equipmentSetVisual;}
  await engine.resetSession(next);if(run!==epoch||disposed)return;
  await engine.setVisible(true);if(run!==epoch||disposed)return;
  await engine.deployCards({instant:true,force:true});
  if(run!==epoch||disposed)return;
  fx=engine.equipmentSetFX;fx?.clock?.timeScale(playbackRate);
  engine.updateStatus('유저 장비 세트 · 전투 연출 시연');
  const opening={v:0};await engine.timeline(t=>t.to(opening,{v:1,duration:1.6}),()=>{},playbackRate);
  for(const event of events){
   if(!await waitPlayable(run))return;
   await engine.playEvents([event],{isPaused:()=>paused||document.hidden});
  }
  if(run!==epoch||disposed)return;
  const gap={v:0};await engine.timeline(t=>t.to(gap,{v:1,duration:1.6}),()=>{},playbackRate);
  if(run===epoch&&!disposed)void replay();
 }
 tools.querySelector('[data-replay]').onclick=()=>void replay().catch(fail);
 const onVisibility=()=>{engine.visible=!document.hidden;syncPause();if(document.hidden){engine.audio?.stop?.();engine.app.stop();}else engine.app.start();};
 document.addEventListener('visibilitychange',onVisibility);
 function dispose(){disposed=true;epoch++;fx?.destroy();engine.cancelTimelines();heldTimelines.clear();document.removeEventListener('visibilitychange',onVisibility);api.destroy();}
 window.addEventListener('pagehide',dispose,{once:true});
 window.EquipmentSetPreview={engine,get fx(){return fx;},get payload(){return payload;},pause:setPaused,replay,dispose,diagnostics:()=>({round,paused,enabled,playbackRate,accountAvatarEnabled:engine.accountBattleUnitEnabled,canvases:document.querySelectorAll('canvas').length,allies:engine.allies.filter(c=>c.battleActive!==false).length,enemies:engine.enemies.filter(c=>c.battleActive!==false).length,fx:fx?.diagnostics(),source:'CANONICAL_'+payload.mode+'_SIMULATION_LOCAL_FIXTURE',usesProductionRenderer:true,liveAccountWrites:false})};
 void replay().catch(fail);
}catch(error){fail(error);}
function fail(error){console.error(error);const status=modal.querySelector('#pvBattleStatus')||modal;status.textContent='프리뷰를 불러오지 못했습니다: '+error.message;}
