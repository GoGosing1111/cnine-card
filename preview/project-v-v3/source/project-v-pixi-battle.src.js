import {BattleEngine} from './battle/BattleEngine.js';
import {BattleEngine as ExpeditionBattleEngine} from '../../../pve-v3/BattleEngine.js';

let engine=null;
let accountPreviewFirearmHook=null;
const engineType=payload=>typeof __CNINE_NATIVE_CONTINUOUS__!=='undefined'&&__CNINE_NATIVE_CONTINUOUS__&&payload?.continuousEncounter?ExpeditionBattleEngine:BattleEngine;

async function mount(target=document.getElementById('pvPixiBattle')){
  if(engine)return engine;
  const candidate=engine=new BattleEngine({host:target});
  candidate.setAccountBattleUnitPreviewFireHook(accountPreviewFirearmHook);
  await candidate.mount();
  if(engine!==candidate)throw Error('취소된 전투 화면 초기화입니다.');
  return candidate;
}

async function mountForBattle(payload,target=document.getElementById('pvPixiBattle')){
  if(engine)return resetSession(payload,target);
  const Engine=engineType(payload);
  const candidate=engine=new Engine({host:target,battleData:payload});
  candidate.setAccountBattleUnitPreviewFireHook(accountPreviewFirearmHook);
  try{
    await candidate.mount();
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
  const Engine=engineType(payload);
  if(engine&&(engine.constructor!==Engine||engine.battleData?.title!==payload?.title&&payload?.continuousEncounter))destroy();
  if(!engine)return mountForBattle(payload,target);
  return engine.resetSession(payload,target);
}

async function setVisible(next){
  if(!engine&&next)await mount();
  return engine?.setVisible(next);
}

async function runSequence(){
  if(!engine)await mount();
  return engine.runSequence();
}

function destroy(){
  const previous=engine;engine=null;
  previous?.destroy();
}

async function playEvents(events,options){
  if(!engine)await mount();
  return engine.playEvents(events,options);
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

async function syncFinalState(final){
  if(!engine)await mount();
  return engine.syncFinalState(final);
}

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

const api={runtimeVersion:'2126-fluid-combat-z-sword-20260918',mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,restoreDeployedFormation,setBattlePayload,setBattlefield,verifyTargetSwitch,playAccountPreviewShot,setAccountPreviewFirearmHook,startAccountBattleUnitSustainedFire,stopAccountBattleUnitSustainedFire,cancelActiveAnimations,syncFinalState,diagnostics,destroy};
if(typeof window!=='undefined')window.ProjectVPixiBattle=api;

export {mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,restoreDeployedFormation,setBattlePayload,setBattlefield,verifyTargetSwitch,playAccountPreviewShot,setAccountPreviewFirearmHook,startAccountBattleUnitSustainedFire,stopAccountBattleUnitSustainedFire,cancelActiveAnimations,syncFinalState,diagnostics,destroy};
