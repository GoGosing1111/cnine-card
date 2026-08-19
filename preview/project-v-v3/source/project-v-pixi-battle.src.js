import {BattleEngine} from './battle/BattleEngine.js';

let engine=null;

async function mount(target=document.getElementById('pvPixiBattle')){
  if(engine)return engine;
  engine=new BattleEngine({host:target});
  await engine.mount();
  return engine;
}

async function mountForBattle(payload,target=document.getElementById('pvPixiBattle')){
  if(engine)return resetSession(payload,target);
  engine=new BattleEngine({host:target,battleData:payload});
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

function diagnostics(){
  return engine?.diagnostics()||{mounted:false};
}

const api={mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,setBattlePayload,setBattlefield,verifyTargetSwitch,diagnostics,destroy};
if(typeof window!=='undefined')window.ProjectVPixiBattle=api;

export {mount,mountForBattle,resetSession,setVisible,runSequence,playEvents,setBattlePayload,setBattlefield,verifyTargetSwitch,diagnostics,destroy};
