const api=window.ProjectVPixiBattle,originalMount=api.mountForBattle;
let engine,renderer,payload,epoch=0,playing=false,disposed=false,pauseWanted=false,releasePause,speed=1;
api.mountForBattle=async(...args)=>{engine=await originalMount(...args);return engine;};
async function prepare(next){
  if(disposed)throw Error('전투 화면이 닫혔습니다.');
  cancel();const token=epoch;payload=next;window.cnineCardCatalog=()=>payload.cards;
  const modal=document.getElementById('pve-v3-modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:payload.battlefieldMode||'HUNT',playerName:payload.playerName,opponentName:payload.opponentName,autoText:payload.idleClock?'자동 원정 진행 중':'연속 교전'});
  prepared.stage.querySelector('.battle-v3-canvas-host').style.backgroundImage='none';
  const nextRenderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:payload.battlefieldMode||'HUNT',playerName:payload.playerName,playUltimateCinematics:true});
  if(token!==epoch||disposed){nextRenderer.destroy();return false;}
  renderer=nextRenderer;engine.previewSpeed=speed;
  prepared.stage.querySelector('.battle-v3-header strong').textContent=payload.title||payload.opponentName||'원정 전투';
  prepared.stage.querySelector('#battlePhase').textContent=payload.phaseLabel||(payload.idleClock?'자동 원정 진행 중':'전선 돌파');
  await api.restoreDeployedFormation();return true;
}
async function play(){
  if(playing||!renderer||disposed)return false;
  const token=epoch,runEngine=engine,runPayload=payload,runRenderer=renderer;playing=true;let previousAt=0;
  try{
    runEngine.startAccountBattleUnitSustainedFire();
    for(const event of runPayload.battleV2.result.timeline){
      if(pauseWanted){await runEngine.stopAccountBattleUnitSustainedFire({drain:true});runEngine.settlePendingTails(runEngine.characters);await new Promise(r=>{releasePause=r;if(!pauseWanted)r();});releasePause=null;if(token===epoch)runEngine.startAccountBattleUnitSustainedFire();}
      if(token!==epoch||disposed)return false;
      if(runPayload.idleClock){const at=Number(event.combatAtMs)||0,gap=Math.min(1500,Math.max(0,at-previousAt));previousAt=at;if(gap)await runEngine.timeline(t=>t.to({progress:0},{progress:1,duration:gap/1000}));}
      if(token!==epoch||disposed)return false;
      if(await api.playEvents([event])===false)return false;
    }
    await runEngine.drainGeneration?.();await runEngine.stopAccountBattleUnitSustainedFire({drain:true});
    if(token!==epoch||disposed)return false;
    await api.syncFinalState(runPayload.battleV2.result.final);if(!runPayload.idleClock)runRenderer.showResult();return true;
  }finally{if(token===epoch){playing=false;pauseWanted=false;await runEngine.stopAccountBattleUnitSustainedFire();}}
}
function resume(){pauseWanted=false;releasePause?.();}
function cancel(){++epoch;resume();renderer?.destroy();renderer=null;api.cancelActiveAnimations();playing=false;}
function dispose(){if(disposed)return;disposed=true;cancel();api.mountForBattle=originalMount;api.destroy();}
window.addEventListener('pagehide',dispose,{once:true});
window.PveV3BattleBridge={prepare,play,pause:()=>{pauseWanted=true;},resume,cancel,dispose,
  setSpeed:n=>{speed=n===2?2:1;if(engine)engine.previewSpeed=speed;},
  setSound:async enabled=>{localStorage.setItem('cnine_battle_sound',enabled?'ON':'OFF');engine?.mercenaryAudio?.setEnabled(enabled);if(enabled)await engine?.audio?.unlock();else{engine?.audio?.stopAll();engine?.skillChipPlayback?.audio?.setEnabled(false);}},
  diagnostics:()=>({playing,disposed,epoch,canvasCount:document.querySelectorAll('canvas').length,cards:document.querySelectorAll('[data-v3-roster-card]').length,formation:engine?.gridDiagnostics?.(),engine:api.diagnostics()})};
