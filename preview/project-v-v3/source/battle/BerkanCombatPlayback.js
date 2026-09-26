import {BerkanFX,loadBerkanAssets} from '../../../mercenary-berkan-sss-v1/source/BerkanFX.js';
import {makePlan,MODES} from '../../../mercenary-berkan-sss-v1/skill.mjs';
import {BERKAN_CODE,BERKAN_SKILL_ID} from '../../../../shared/mercenary-berkan-v1.mjs';
let manifestPromise;
const loadManifest=()=>manifestPromise||=(fetch('/preview/mercenary-berkan-sss-v1/manifest.json?v=20260927-live1')
 .then(r=>{if(!r.ok)throw Error('BERKAN_MANIFEST');return r.json();}).catch(e=>{manifestPromise=null;throw e;}));
const release=assets=>{for(const group of Object.values(assets))for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};
export async function preloadBerkan(){release(await loadBerkanAssets(await loadManifest()));}
export const berkanPlaybackPlan=(mode,dodge=false)=>({...makePlan({mode,dodge}),authoritative:true,damageAuthority:'SERVER_ONLY'});
function ambient(state,mode='aura'){
 const {fx,actor,engine}=state;if(state.busy||state.stopped||fx.destroyed||actor.root.destroyed)return;
 if(actor.hp<=0)mode='defeat';
 if(fx.plan.mode===mode&&fx.playing)return;
 fx.targets=[];fx.targetDefaults=[];fx.setPlan(berkanPlaybackPlan(mode));
 fx.speed=engine.reducedMotion?8:1.3*(engine.paceScale||1);fx.timeline.timeScale(fx.speed);fx.play();
}
export async function setupBerkanActor(engine,actor){
 engine.berkanStates||=new Map();engine.berkanLoads||=new Map();
 if(engine.berkanStates.has(actor))return engine.berkanStates.get(actor);
 if(engine.berkanLoads.has(actor))return engine.berkanLoads.get(actor);
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const pending=(async()=>{
  const manifest=await loadManifest(),assets=await loadBerkanAssets(manifest);
  if(actor.root.destroyed||epoch!==engine.mercenaryEpoch||playbackEpoch!==engine.playbackEpoch||engine.mercenaryDisposed){release(assets);return null;}
  const fx=new BerkanFX(engine,actor,[],assets,manifest,berkanPlaybackPlan('aura'),()=>{},{authoritative:true,useAuthoredPose:actor.cardId===BERKAN_CODE});
  const state={fx,actor,engine,busy:false,stopped:false};engine.berkanStates.set(actor,state);
  if(actor.cardId===BERKAN_CODE){
   actor.setAnimationAdapter({setState(next){
    if(next==='DEAD'){engine.settlePendingTails?.([actor]);state.busy=false;ambient(state,'defeat');}
    else if(next==='HIT')ambient(state,'hit');
    else if(next==='IDLE')ambient(state);
   },destroy(){state.stopped=true;fx.destroy();}});
   ambient(state);
  }
  return state;
 })().finally(()=>engine.berkanLoads.delete(actor));engine.berkanLoads.set(actor,pending);return pending;
}
export function clearBerkanActors(engine){for(const s of engine.berkanStates?.values()||[]){s.stopped=true;s.fx.destroy();}engine.berkanStates?.clear();}
export function cancelBerkanPlayback(engine){for(const s of engine.berkanStates?.values()||[]){s.stopped=true;s.busy=false;s.fx.cancel();}}
async function playback(engine,actor,target,{basic=false,dodge=false,apply}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>actor&&target&&!actor.root.destroyed&&!target.root.destroyed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!engine.mercenaryDisposed;
 if(!valid())return false;
 const state=await setupBerkanActor(engine,actor);if(!state||!valid())return false;
 engine.settlePendingTails?.([actor,target]);state.stopped=false;state.busy=true;
 const {fx}=state,mode=basic?'attack':'ultimate',plan=berkanPlaybackPlan(mode,dodge),clock={time:0},contact=MODES[mode].contacts[0];
 actor.animationController.kill();fx.removeTimeline();fx.resting=false;fx.plan=plan;fx.targets=[target];fx.targetDefaults=[{x:target.view.x,tint:target.fullBodySprite.tint}];fx.render(0);
 let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate:()=>{if(valid()&&!fx.destroyed)fx.render(clock.time);}});
  t.call(()=>{if(!applied&&valid()){applied=true;apply();}},[],contact);
 },()=>{state.busy=false;if(!fx.destroyed){fx.cancel();if(valid())ambient(state);}},null,{releaseAt:contact+.12,owners:[actor,target]});
 engine.lastMercenaryPlayback={skillId:basic?null:BERKAN_SKILL_ID,eventType:basic?'ATTACK':'MERCENARY_HIT',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?1:0};
 return result&&valid();
}
export function playBerkanSkill(engine,event){
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);if(!actor||!target)return true;
 engine.queueBanner(event.skillName,0xedc878,actor.name);
 return playback(engine,actor,target,{dodge:!!event.dodge,apply(){
  if(Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter));
  if(Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);
  if(event.dodge)engine.queueBanner('빗나감',0xedc878,event.skillName);else engine.showAccountBattleUnitDamage(target,{damage:event.damage});
 }});
}
export function playBerkanBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,target,{basic:true,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }});
}
