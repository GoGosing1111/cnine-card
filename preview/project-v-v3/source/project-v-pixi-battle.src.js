import {BattleEngine} from './battle/BattleEngine.js';

let engine=null;
let accountPreviewFirearmHook=null;

async function mount(target=document.getElementById('pvPixiBattle')){
  if(engine)return engine;
  engine=new BattleEngine({host:target});
  engine.setAccountBattleUnitPreviewFireHook(accountPreviewFirearmHook);
  await engine.mount();
  return engine;
}

async function mountForBattle(payload,target=document.getElementById('pvPixiBattle')){
  if(engine)return resetSession(payload,target);
  engine=new BattleEngine({host:target,battleData:payload});
  engine.setAccountBattleUnitPreviewFireHook(accountPreviewFirearmHook);
  try{
    await engine.mount();
    return engine;
  }catch(error){
    destroy();
    throw error;
  }
}

async function resetSession(payload,target=document.getElementById('pvPixiBattle')){
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
  engine?.destroy();
  engine=null;
}

async function playEvents(events){
  if(!engine)await mount();
  return engine.playEvents(events);
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

async function playAccountPreviewShot({onAnticipation,onFire}={}){
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
    const played=await engine.playAccountBattleUnitCosmeticShot();
    return {played:Boolean(played),fireAt,diagnostics:engine.diagnostics().accountBattleUnit};
  }finally{
    if(unit.applyAuthoredFrame===wrappedApply)unit.applyAuthoredFrame=originalApply;
  }
}

const api={mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,setBattlePayload,setBattlefield,verifyTargetSwitch,playAccountPreviewShot,setAccountPreviewFirearmHook,cancelActiveAnimations,syncFinalState,diagnostics,destroy};
if(typeof window!=='undefined')window.ProjectVPixiBattle=api;

export {mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,setBattlePayload,setBattlefield,verifyTargetSwitch,playAccountPreviewShot,setAccountPreviewFirearmHook,cancelActiveAnimations,syncFinalState,diagnostics,destroy};
