import {gsap} from 'gsap';
import {Assets,Container,Sprite,Graphics,Texture,Rectangle} from 'pixi.js';
import {AWAKENED_OMEGA_CODE,AWAKENED_OMEGA_ART,AWAKENED_OMEGA_EVENT,AWAKENED_OMEGA_SKILLS,AWAKENED_OMEGA_PLAYBACK_RATE} from '../../../../shared/mercenary-awakened-omega-v1.mjs';
import {OmegaEvolvedFX,loadOmegaEvolvedAssets,ROOT} from './awakened-omega/OmegaEvolvedFX.js';
import {SKILLS,posePlan} from './awakened-omega/skills.mjs';
const runtime={Assets,Container,Sprite,Graphics,Texture,Rectangle,timeline:o=>gsap.timeline(o)};
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'motion-manifest.json?v=20261024-awakenedOmega-v1').then(r=>{if(!r.ok)throw Error('AWAKENED_OMEGA_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};
export const awakenedOmegaBattleArt=code=>code===AWAKENED_OMEGA_CODE?{...AWAKENED_OMEGA_ART,calmIdle:true,spriteUrl:'/'+AWAKENED_OMEGA_ART.battleSprite,footAnchor:{x:.5238486842105263,y:.9728618421052632},bodyHeight:330,fullBodyHeight:768*330/661.9021026378372,originalTextureHeight:768}:null;
class AwakenedOmegaLiveFX extends OmegaEvolvedFX{
 hideEffects(){this.effects.forEach(s=>s.visible=false);this.ghosts.forEach(g=>g.holder.visible=false);this.activeFrames=[];this.afterimageSamples=[];}
 render(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0){this.hideEffects();return;}
  this.reducedMotion=!!this.engine.reducedMotion;this.targetTints=new Map(this.targets.map(a=>[a,a.fullBodySprite.tint]));
  super.render(time);this.targets.forEach(a=>{if(!a.root.destroyed)a.fullBodySprite.tint=this.targetTints.get(a);});
 }
 begin(mode,targets){
  this.targets=targets;this.mode='skill:'+mode;this.plan=structuredClone(SKILLS[mode]);
  if(['orbit','rupture'].includes(mode)){
   const start=mode==='orbit'?1.2:1.65,step=mode==='orbit'?.035:.045;
   this.plan.hits=targets.map((_,i)=>({at:start+i*step,target:i}));
   this.plan.duration=Math.max(this.plan.duration,this.plan.hits.at(-1).at+.5);
  }
  this.clock.time=0;this.merc.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.hideEffects();
  if(this.merc.root.destroyed||this.merc.hp<=0)return;
  this.targets=[];this.mode='idle';this.plan=posePlan('idle');this.clock.time=0;this.merc.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0);
 }
 diagnostics(){return {...super.diagnostics(),name:AWAKENED_OMEGA_ART.name,code:AWAKENED_OMEGA_CODE,liveEnabled:true,visualOnly:false,clockOwner:'V3_REGISTERED_GSAP',clockSource:'LIVE_BATTLE_ENGINE',damageAuthority:'SERVER_ONLY',playbackRate:AWAKENED_OMEGA_PLAYBACK_RATE,cameraZoom:false};}
}
export async function setupAwakenedOmegaActor(engine,actor){
 engine.awakenedOmegaStates||=new Map();engine.awakenedOmegaLoads||=new Map();
 if(engine.awakenedOmegaStates.has(actor))return engine.awakenedOmegaStates.get(actor);
 if(engine.awakenedOmegaLoads.has(actor))return engine.awakenedOmegaLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const m=await manifest(),assets=await loadOmegaEvolvedAssets(m,runtime),valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  actor.awakenedOmegaBasicVariant=0;
  const fx=new AwakenedOmegaLiveFX(engine,actor,assets,m,runtime),state={engine,actor,fx,busy:false,stopped:false};
  const setHp=actor.setHp;actor.setHp=function(value){const dead=this.hp<=0,result=setHp.call(this,value);if(this.hp<=0)fx.hideEffects();else if(dead&&!state.busy&&!state.stopped&&!fx.destroyed)fx.cancel();return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};fx.cancel();engine.awakenedOmegaStates.set(actor,state);return state;
 })().finally(()=>engine.awakenedOmegaLoads.delete(actor));engine.awakenedOmegaLoads.set(actor,pending);return pending;
}
export function warmAwakenedOmegaActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupAwakenedOmegaActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[각성 오메가] 전투 효과 준비 지연',e);});}
export function resumeAwakenedOmegaPlayback(engine){for(const s of engine.awakenedOmegaStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();}}
export function cancelAwakenedOmegaPlayback(engine){for(const s of engine.awakenedOmegaStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearAwakenedOmegaActors(engine){for(const s of engine.awakenedOmegaStates?.values()||[]){s.stopped=true;s.restoreHp?.();s.fx.destroy();}engine.awakenedOmegaStates?.clear();}
async function playback(engine,actor,rows,mode,{skill=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!valid()||!rows.length)return false;
 const s=engine.awakenedOmegaStates?.get(actor);if(!s)return false;
 const targets=rows.map(r=>r.target);engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const plan=s.fx.plan,clock={time:0},applied=new Set(),contacts=rows.map((_,i)=>plan.hits.find(e=>e.target===i)?.at??plan.peak);
 const result=await engine.timeline(t=>{
  t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  rows.forEach((row,i)=>t.call(()=>{if(valid()&&!s.stopped&&!applied.has(i)){applied.add(i);row.apply();}},[],contacts[i]));
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0)actor.animationController.setState('IDLE');},engine.reducedMotion?8:AWAKENED_OMEGA_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:AWAKENED_OMEGA_CODE,eventType:skill?AWAKENED_OMEGA_EVENT:'ATTACK',mode,authoritative:true,damageApplications:applied.size,contactSeconds:contacts,durationSeconds:plan.duration,playbackRate:AWAKENED_OMEGA_PLAYBACK_RATE,clockOwner:'V3_REGISTERED_GSAP',cameraZoom:false};
 return result&&valid();
}
export function playAwakenedOmegaBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 if(!engine.awakenedOmegaStates?.has(actor)){warmAwakenedOmegaActor(engine,actor);return fallback();}
 return playback(engine,actor,[{target,apply(){if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});}}],actor.awakenedOmegaBasicVariant++%2?'sever':'cleave');
}
export function playAwakenedOmegaSkill(engine,event){
 const actor=engine.combatantById(event.actorId),skill=AWAKENED_OMEGA_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==AWAKENED_OMEGA_CODE||event.type!==AWAKENED_OMEGA_EVENT||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed).map(({hit,target})=>({target,apply(){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }}));
 if(!rows.length)return true;
 if(!engine.awakenedOmegaStates?.has(actor)){if(actor.hp>0)warmAwakenedOmegaActor(engine,actor);rows.forEach(r=>r.apply());return true;}
 return playback(engine,actor,rows,skill.visualMode,{skill:true});
}
