// Combat overlay only. The host keeps its existing entry and result screens.
export async function playContinuousBattle({modal,data,view=null,mode='PVE',isActive=()=>true}={}){
  if(!data?.continuousEncounter||!Array.isArray(data?.battleV2?.result?.timeline))throw Error('서버의 V3 연속 전투 기록이 없습니다.');
  await globalThis.ensureFeatureResources('battleV2');
  if(!isActive())return null;
  if(!document.querySelector('[data-continuous-live-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/pve-continuous-battle-live.css?v=2094';link.dataset.continuousLiveStyle='';document.head.append(link);}
  const api=globalThis.ProjectVBattleV3Live,tower=mode==='TOWER';
  const title=tower?`${data.floorNo||data.tier}층 · 무한의탑`:'폐차장';
  view||=api.prepareLoading({modal,mode,playerName:data.accountNickname||data.playerName,opponentName:tower?'탑의 수호자':data.difficulty?.name||'기계 군단'});
  modal.classList.add('pve-continuous-live');
  view.stage.querySelector('.battle-v3-header strong').textContent=title;
  view.stage.querySelector('.battle-v3-header small').textContent=tower?'수호자의 성소':'연속 교전 · 부품 회수';
  view.stage.insertAdjacentHTML('beforeend','<div class="pve-continuous-track" aria-hidden="true"><i></i></div><div class="pve-continuous-controls"><button type="button" data-continuous-pause disabled>일시정지</button><button type="button" data-continuous-result disabled>결과 보기</button></div>');
  const pauseButton=view.stage.querySelector('[data-continuous-pause]'),resultButton=view.stage.querySelector('[data-continuous-result]'),track=view.stage.querySelector('.pve-continuous-track i');
  let renderer,paused=false,resumeWait,ended=false,skipped=false,cancelled=false,releaseSkip;
  const skippedPromise=new Promise(resolve=>{releaseSkip=resolve;});
  const resume=()=>{paused=false;resumeWait?.();resumeWait=null;pauseButton.textContent='일시정지';};
  const cancel=()=>{cancelled=true;ended=true;resume();renderer?.destroy();globalThis.ProjectVPixiBattle?.cancelActiveAnimations?.();releaseSkip(false);};
  const background=()=>{if(document.hidden&&!ended){paused=true;pauseButton.textContent='재개';}};
  pauseButton.onclick=()=>{if(paused)resume();else{paused=true;pauseButton.textContent='재개';}};
  const defeated=new Set(),enemies=new Set(data.continuousEncounter.instances.map(row=>row.id));
  try{
    renderer=await api.createRenderer({modal,stage:view.stage,host:view.host,phase:view.phase,data,mode,continuousPlayback:true,playUltimateCinematics:true,
      beforeCombatEvent:async()=>{if(!isActive()){cancel();return;}if(paused){await globalThis.ProjectVPixiBattle.stopAccountBattleUnitSustainedFire({drain:true});await new Promise(resolve=>{resumeWait=resolve;if(!paused)resolve();});if(!ended)globalThis.ProjectVPixiBattle.startAccountBattleUnitSustainedFire();}},
      onCombatEvent:event=>{if(event.type==='KO'&&enemies.has(event.targetId))defeated.add(event.targetId);const progress=tower?Number(event.guardianProgress||0):defeated.size/enemies.size*100;track.style.width=`${Math.min(100,progress)}%`;const seconds=Math.ceil(Math.max(0,Number(event.remainingCombatMs??data.combatLimitMs)||0)/1000);view.phase.textContent=tower?`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')} · ${progress>=100?'수호자 결전':`수호자 소환 ${progress}%`}`:`격파 ${defeated.size} / ${enemies.size}`;}});
    if(!isActive()){cancel();return null;}
    view.host.style.backgroundImage='none';modal.__battleV2Renderer=renderer;
    globalThis.ensureBattleSoundButton?.(view.stage);
    document.addEventListener('visibilitychange',background);addEventListener('cnine:route-will-change',cancel);addEventListener('pagehide',cancel);
    resultButton.onclick=()=>{skipped=true;ended=true;resume();renderer.destroy();globalThis.ProjectVPixiBattle.cancelActiveAnimations();releaseSkip(true);};
    pauseButton.disabled=false;resultButton.disabled=false;
    await Promise.race([renderer.play(),skippedPromise]);
    if(cancelled||!isActive())return null;
    if(skipped)renderer.showResult();
    return renderer;
  }catch(error){
    renderer?.destroy();globalThis.ProjectVPixiBattle?.cancelActiveAnimations?.();throw error;
  }finally{
    ended=true;resume();view.stage.querySelector('.pve-continuous-controls')?.remove();
    document.removeEventListener('visibilitychange',background);removeEventListener('cnine:route-will-change',cancel);removeEventListener('pagehide',cancel);
  }
}
