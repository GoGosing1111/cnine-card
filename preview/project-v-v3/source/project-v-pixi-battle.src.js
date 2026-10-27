import {BattleEngine} from './battle/BattleEngine.js';
import {prepareSealDragon} from './battle/SealDragonPlayback.js';
import {createEffectScene} from './battle/EffectScene.js';
import {BattleEngine as ExpeditionBattleEngine} from '../../../pve-v3/BattleEngine.js';
import {Assets,Container,Graphics,Sprite,Texture,Rectangle} from 'pixi.js';
import {battleAssetMemory,battleWarmupWork} from './battle/BattleAssetMemory.mjs';

let engine=null;
let effectMountPromise=null;
let accountPreviewFirearmHook=null;
let releasePromise=null;
const pendingOperations=new Set();
function trackOperation(promise){
  pendingOperations.add(promise);
  void promise.then(()=>pendingOperations.delete(promise),()=>pendingOperations.delete(promise));
  return promise;
}
const engineType=payload=>typeof __CNINE_NATIVE_CONTINUOUS__!=='undefined'&&__CNINE_NATIVE_CONTINUOUS__&&payload?.continuousEncounter?ExpeditionBattleEngine:BattleEngine;

async function mount(target=document.getElementById('pvPixiBattle')){
  if(releasePromise)await releasePromise;
  if(effectMountPromise)await effectMountPromise.catch(()=>{});
  if(engine?.effectScene)destroy();
  if(engine)return engine;
  const candidate=engine=new BattleEngine({host:target});
  candidate.setAccountBattleUnitPreviewFireHook(accountPreviewFirearmHook);
  await trackOperation(candidate.mount());
  if(engine!==candidate)throw Error('취소된 전투 화면 초기화입니다.');
  return candidate;
}

async function mountForBattle(payload,target=document.getElementById('pvPixiBattle')){
  if(releasePromise)await releasePromise;
  if(effectMountPromise)await effectMountPromise.catch(()=>{});
  if(engine?.effectScene)destroy();
  if(engine)return resetSession(payload,target);
  const Engine=engineType(payload);
  const candidate=engine=new Engine({host:target,battleData:payload});
  candidate.setAccountBattleUnitPreviewFireHook(accountPreviewFirearmHook);
  try{
    await trackOperation(candidate.mount());
    if(engine!==candidate)throw Error('취소된 전투 화면 초기화입니다.');
    return candidate;
  }catch(error){
    // The first attempt may reject after the watchdog started a new renderer.
    // A stale rejection owns only its original instance, never the replacement.
    if(engine===candidate)destroy();
    throw error;
  }
}

async function resetSession(payload,target=document.getElementById('pvPixiBattle')){
  if(releasePromise)await releasePromise;
  if(effectMountPromise)await effectMountPromise.catch(()=>{});
  if(engine?.effectScene)destroy();
  const Engine=engineType(payload);
  if(engine&&(engine.constructor!==Engine||engine.battleData?.title!==payload?.title&&payload?.continuousEncounter))destroy();
  if(!engine)return mountForBattle(payload,target);
  return trackOperation(engine.resetSession(payload,target));
}

async function setVisible(next){
  if(!engine&&next)await mount();
  return engine?.setVisible(next);
}

async function runSequence(){
  if(!engine)await mount();
  return trackOperation(engine.runSequence());
}

function destroy(){
  const previous=engine;engine=null;
  previous?.destroy();
}

// Explicitly leaving a battle differs from a hidden tab or paused replay.
// Finish initialization and authored warm-ups before unloading owned images;
// new mounts must wait so the old release cannot destroy the next battle.
function releaseBattle({onlyIfIdle=false}={}){
  if(releasePromise)return releasePromise;
  if(engine?.effectScene||onlyIfIdle&&(engine?.visible||engine?.playing))return Promise.resolve(false);
  const previous=engine;engine=null;
  const hidden=previous?.setVisible(false);
  releasePromise=(async()=>{
    await Promise.allSettled([hidden,...pendingOperations]);
    const work=battleWarmupWork(previous);
    previous?.destroy();
    await battleAssetMemory.release(work);
    return true;
  })().finally(()=>{releasePromise=null;});
  return releasePromise;
}
function whenReleased(){return releasePromise||Promise.resolve();}

async function mountEffectScene(target){
  if(releasePromise)await releasePromise;
  if(effectMountPromise)await effectMountPromise.catch(()=>{});
  if(engine?.effectScene&&engine.mounted)return engine.attachTo(target);
  // An active personal battle owns the singleton. The territory scene retries
  // after the battle view releases it; it must never create a second renderer.
  if(engine?.visible||engine?.playing)return null;
  if(engine)destroy();
  const candidate=engine=createEffectScene(target);
  effectMountPromise=candidate.mount().then(()=>{
    if(engine!==candidate||candidate.disposed)throw Error('Cancelled territory effect scene');
    return candidate;
  });
  try{return await effectMountPromise;}catch(error){if(engine===candidate)destroy();throw error;}
  finally{effectMountPromise=null;}
}
function releaseEffectScene(scene){if(engine===scene&&engine?.effectScene)destroy();}

async function playEvents(events,options){
  if(!engine)await mount();
  return trackOperation(engine.playEvents(events,options));
}

async function restoreDeployedFormation(){
  if(!engine)return false;
  return engine.deployCards({force:true,instant:true});
}

async function setBattlePayload(payload){
  if(!engine)await mount();
  return engine.setBattlePayload(payload);
}

async function setBattlefield(mode){
  if(!engine)await mount();
  return engine.setBattlefield(mode);
}

async function verifyTargetSwitch(){
  if(!engine)await mount();
  return engine.verifyTargetSwitch();
}

function cancelActiveAnimations(){
  engine?.cancelTimelines?.();
  return true;
}

function completePlayback(){
  return engine?.completePlayback()||false;
}

async function syncFinalState(final){
  if(!engine)await mount();
  return engine.syncFinalState(final);
}
function syncCooperativeState(frame){return engine?.syncCooperativeState(frame);}
function restorePetSupport(beforeMs){return engine?.restorePetSupport(beforeMs)||0;}

function diagnostics(){
  return engine?.diagnostics()||{mounted:false};
}

function setAccountPreviewFirearmHook(handler){
  accountPreviewFirearmHook=typeof handler==='function'?handler:null;
  engine?.setAccountBattleUnitPreviewFireHook?.(accountPreviewFirearmHook);
  return Boolean(accountPreviewFirearmHook);
}

function startAccountBattleUnitSustainedFire(){
  return engine?.startAccountBattleUnitSustainedFire?.()||null;
}

function stopAccountBattleUnitSustainedFire(options){
  return engine?.stopAccountBattleUnitSustainedFire?.(options)||Promise.resolve(0);
}

async function playAccountPreviewShot({onAnticipation,onFire,damage=100000}={}){
  if(!engine)return {played:false,reason:'ENGINE_NOT_MOUNTED'};
  const unit=engine.accountBattleUnit;
  if(!unit||!engine.accountBattleUnitEnabled)return {played:false,reason:'ACCOUNT_UNIT_NOT_AVAILABLE'};
  const originalApply=unit.applyAuthoredFrame;
  let fireAt=null;
  let fired=false;
  const wrappedApply=function(name,...args){
    const result=originalApply.call(this,name,...args);
    if(name==='fire'&&!fired){
      fired=true;
      fireAt=performance.now();
      onFire?.({at:fireAt,frame:name,weaponCode:this.authoredProfile?.weaponCode||''});
    }
    return result;
  };
  unit.applyAuthoredFrame=wrappedApply;
  try{
    onAnticipation?.({at:performance.now(),readyLeadMs:Number(unit.authoredProfile?.durationsMs?.ready||45)});
    const target=engine.accountBattleUnitSustainedTarget?.()||null;
    const targetHp=target?Math.max(1,Number(target.hp||100)-8):null;
    const played=await engine.playAccountBattleUnitShot(target,{damage:Math.max(1,Number(damage)||1),targetHp,authoritative:true});
    return {played:Boolean(played),fireAt,diagnostics:engine.diagnostics().accountBattleUnit};
  }finally{
    if(unit.applyAuthoredFrame===wrappedApply)unit.applyAuthoredFrame=originalApply;
  }
}

const fxRuntime=Object.freeze({Assets,Container,Graphics,Sprite,Texture,Rectangle});
const api={runtimeVersion:'20261005-coop-readable-v4-backdrop-overlord-motion-v3-bg-recovery-apoc-focus-icon-actions-20261006-pet-live-v1-icon-cadence-v1-damage-russo-20261007-v2-sx-2x-v1-ultimate-frame-aura-v3-limited-deployment-20261009-valter-pve-area-2_5x-20261012-helios-deploy-v2-jinmu-dialogue-v4-coop-roster-v3-pet-codex-layout-20261009-jokgak-city-v1-zeus-icon-20261010-pet-fx-20261012-v2-pet-window-v3-coop-camera-20261013-v1-limited-dialogue-20261013-v1-suit-ult-40s-20261013-v1-helios-aura-20261013-v1-original-ip-20261013-v1-gusudaeng-icon-20261013-v1-pve-balance-v1-coop-loading-20261014-v1-azant-live-20261014-v1-balance-v2-kairon-craft-20261014-v1-mercenary-fx-lifecycle-20261015-shiranui-live-v1-azant-berkan-parity-20261015-v1-cheolgu-balance-20261017-v1-ground-runes-pets-20261017-v1-harlequin-v980-20261017-hud-b-20261017-v1-halloween-ready-20261017-v1-jokro-live-20261018-v1-jokro-coop-dialogue-20261018-v1-shiranui-silver-20261018-v2-coop-normal-view-20261018-v1-kangyun-live-20261018-v1-pet-icons-clear-dialogue-v1-leonel-live-20261018-v1-white-crest-20261019-forward-guard-v3-equipment-set-fx-20261019-v1-sahyeon-live-20261019-v1-ss-balance-20261019-v2-sahyeon-cadence-dialogue-20261019-v1-bathory-live-20261019-v1-zero-live-20261020-v1-zero-body-2x-calm-idle-v1-prime-requiem-20261021-v2-valter-helios-parity-20261021-v1-tower-abyss-ui-20261021-v1-seal-dragon-20261022-v1-prime-pve-fx-cadence-20261022-v1-tower-status-expiry-20261022-v1-eunseol-live-20261023-v1-bloodmoon-namsudaeng-20261024-v1-mobile-memory-20261024-v1-octa-contact-20261024-v1-razak-20261024-v1-awakened-omega-20261024-v1-bloodmoon-owned-battle-20261025-v1-bloodmoon-status-playback-20261025-v2-prime-zero-priority-20261026-v1-three-skills-20261026-v1-razak-priority-20261026-v5-jokro-power-2200000-20261025-v1-heukgu-large-head-20261025-v3-jokro-manifest-bundled-20261027-v1-blackcrown-live-20261027-v1-revan-general-jok-20261027-v2-bloodmoon-balance-20261027-v2-classic-colosseum-20261027-v1',prepareSealDragon,fxRuntime,mountEffectScene,releaseEffectScene,mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,restoreDeployedFormation,setBattlePayload,setBattlefield,verifyTargetSwitch,playAccountPreviewShot,setAccountPreviewFirearmHook,startAccountBattleUnitSustainedFire,stopAccountBattleUnitSustainedFire,cancelActiveAnimations,completePlayback,syncFinalState,syncCooperativeState,restorePetSupport,diagnostics,destroy,releaseBattle,whenReleased};
if(typeof window!=='undefined')window.ProjectVPixiBattle=api;

export {mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,restoreDeployedFormation,setBattlePayload,setBattlefield,verifyTargetSwitch,playAccountPreviewShot,setAccountPreviewFirearmHook,startAccountBattleUnitSustainedFire,stopAccountBattleUnitSustainedFire,cancelActiveAnimations,completePlayback,syncFinalState,syncCooperativeState,restorePetSupport,diagnostics,destroy,releaseBattle,whenReleased};
