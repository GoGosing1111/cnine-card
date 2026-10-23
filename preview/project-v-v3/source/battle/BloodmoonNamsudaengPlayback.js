import {gsap} from 'gsap';
import {Assets,Container,Sprite,Graphics,Texture,Rectangle} from 'pixi.js';
import {NAMSUDAENG_CODE,NAMSUDAENG_ART,NAMSUDAENG_EVENT,NAMSUDAENG_SKILLS,NAMSUDAENG_PLAYBACK_RATE} from '../../../../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
import {BloodmoonFX,loadBloodmoonAssets,ROOT} from './bloodmoon-namsudaeng/BloodmoonFX.js';
import {SKILLS,posePlan} from './bloodmoon-namsudaeng/skills.mjs';
const runtime={Assets,Container,Sprite,Graphics,Texture,Rectangle,timeline:options=>gsap.timeline(options)};
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'motion-manifest.json?v=20261024-approved').then(r=>{if(!r.ok)throw Error('NAMSUDAENG_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};
export const namsudaengBattleArt=code=>code===NAMSUDAENG_CODE?{...NAMSUDAENG_ART,calmIdle:true,
 spriteUrl:'/'+NAMSUDAENG_ART.battleSprite,footAnchor:{x:350/768,y:650/768},bodyHeight:285,
 fullBodyHeight:768*285/360,originalTextureHeight:768}:null;

class NamsudaengLiveFX extends BloodmoonFX{
 captureFormation(){this.merc.applyFacing();super.captureFormation();}
 applyPose(p){super.applyPose(p);this.merc.applyFacing();}
 hideEffects(){this.projectiles?.forEach(s=>s.visible=false);this.impacts?.forEach(s=>s.visible=false);if(this.charge)this.charge.visible=false;if(this.nockedArrow)this.nockedArrow.visible=false;if(this.string)this.string.visible=false;}
 render(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0){this.hideEffects();return;}
  this.reducedMotion=!!this.engine.reducedMotion;this.string.visible=true;
  this.targetTints=this.targets.map(a=>a.fullBodySprite.tint);
  super.render(time);
  this.targets.forEach((a,i)=>{if(!a.root.destroyed)a.fullBodySprite.tint=this.targetTints[i];});
 }
 begin(mode,targets){
  this.targets=targets;this.targetTints=targets.map(a=>a.fullBodySprite.tint);this.mode='skill:'+mode;
  this.plan=structuredClone(SKILLS[mode]);
  if(mode==='rain'){
   const count=Math.max(10,targets.length);
   this.plan.shots=[this.plan.shots[0],...Array.from({length:count},(_,i)=>({release:2.55+i*.09,hit:2.95+i*.09,target:i%targets.length,variant:'rain',sky:false}))];
   this.plan.duration=Math.max(this.plan.duration,3.65+(count-1)*.09);
  }
  while(this.projectiles.length<this.plan.shots.length){const s=new Sprite(this.assets.arrow);s.anchor.set(1,.5);s.visible=false;this.layer.addChild(s);this.projectiles.push(s);}
  while(this.impacts.length<this.plan.shots.length){const s=new Sprite();s.visible=false;this.layer.addChild(s);this.impacts.push(s);}
  this.clock.time=0;this.captureFormation();this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.hideEffects();
  if(this.merc.root.destroyed||this.merc.hp<=0)return;
  this.targets=[];this.targetTints=[];this.mode='idle';this.plan=posePlan('idle');this.clock.time=0;
  this.merc.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0);
 }
 diagnostics(){return {...super.diagnostics(),name:NAMSUDAENG_ART.name,code:NAMSUDAENG_CODE,liveEnabled:true,visualOnly:false,
  clockOwner:'V3_REGISTERED_GSAP',clockSource:'LIVE_BATTLE_ENGINE',damageAuthority:'SERVER_ONLY',playbackRate:NAMSUDAENG_PLAYBACK_RATE,cameraZoom:false};}
 destroy(){if(this.destroyed)return;const assets=this.assets;super.destroy();disposeAssets(assets);}
}
export async function setupNamsudaengActor(engine,actor){
 engine.namsudaengStates||=new Map();engine.namsudaengLoads||=new Map();
 if(engine.namsudaengStates.has(actor))return engine.namsudaengStates.get(actor);
 if(engine.namsudaengLoads.has(actor))return engine.namsudaengLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const m=await manifest(),assets=await loadBloodmoonAssets(m,runtime);
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new NamsudaengLiveFX(engine,actor,assets,m,runtime),state={engine,actor,fx,busy:false,stopped:false};
  const setHp=actor.setHp;
  actor.setHp=function(value){const dead=this.hp<=0,result=setHp.call(this,value);if(this.hp<=0)fx.hideEffects();else if(dead&&!state.busy&&!state.stopped&&!fx.destroyed)fx.cancel();return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};fx.cancel();engine.namsudaengStates.set(actor,state);return state;
 })().finally(()=>engine.namsudaengLoads.delete(actor));engine.namsudaengLoads.set(actor,pending);return pending;
}
export function warmNamsudaengActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupNamsudaengActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[Bloodmoon] 승인 효과 준비 지연; 서버 판정 유지',e);});}
export function resumeNamsudaengPlayback(engine){for(const s of engine.namsudaengStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();}}
export function cancelNamsudaengPlayback(engine){for(const s of engine.namsudaengStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearNamsudaengActors(engine){for(const s of engine.namsudaengStates?.values()||[]){s.stopped=true;s.restoreHp?.();s.fx.destroy();}engine.namsudaengStates?.clear();}
async function playback(engine,actor,rows,mode,{area=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!valid()||!rows.length)return false;
 const s=engine.namsudaengStates?.get(actor);if(!s)return false;
 const targets=rows.map(r=>r.target);engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const plan=s.fx.plan,clock={time:0},applied=new Set();
 const contacts=rows.map((_,i)=>plan.shots.find(e=>!e.sky&&e.target%rows.length===i)?.hit??plan.peak);
 const result=await engine.timeline(t=>{
  t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  rows.forEach((row,i)=>t.call(()=>{if(valid()&&!s.stopped&&!applied.has(i)){applied.add(i);row.apply();}},[],contacts[i]));
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0)actor.animationController.setState('IDLE');},
 engine.reducedMotion?8:NAMSUDAENG_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:NAMSUDAENG_CODE,eventType:area?NAMSUDAENG_EVENT:'ATTACK',mode,authoritative:true,
  damageApplications:applied.size,contactSeconds:contacts,durationSeconds:plan.duration,playbackRate:NAMSUDAENG_PLAYBACK_RATE,clockOwner:'V3_REGISTERED_GSAP',cameraZoom:false};
 return result&&valid();
}
export function playNamsudaengBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 if(!engine.namsudaengStates?.has(actor)){warmNamsudaengActor(engine,actor);return fallback();}
 return playback(engine,actor,[{target,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }}],'pierce');
}
export function playNamsudaengSkill(engine,event){
 const actor=engine.combatantById(event.actorId),skill=NAMSUDAENG_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==NAMSUDAENG_CODE||event.type!==NAMSUDAENG_EVENT||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed).map(({hit,target})=>({target,apply(){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:(event.hits||[]).length>1});
 }}));
 if(!rows.length)return true;
 if(!engine.namsudaengStates?.has(actor)){if(actor.hp>0)warmNamsudaengActor(engine,actor);rows.forEach(r=>r.apply());return true;}
 return playback(engine,actor,rows,skill.visualMode,{area:true});
}
