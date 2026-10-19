import {gsap} from 'gsap';
import {ZERO_CODE,ZERO_ART,ZERO_AREA_EVENT,ZERO_AREA_SKILLS,ZERO_BASIC_FORMS} from '../../../../shared/mercenary-zero-v1.mjs';
import {KnightFX,loadKnightAssets} from '../../../mercenary-cyan-knight-battle-20261020-v1/source/KnightFX.js';
import {MODES,sample} from '../../../mercenary-cyan-knight-battle-20261020-v1/motion.mjs';
import {sampleBody,BODY_PLAYBACK_RATE,EFFECT_PLAYBACK_RATE} from '../../../mercenary-cyan-knight-battle-20261020-v1/source/BodyMotion.mjs';
const BODY_HEIGHT=360,ROOT='/preview/mercenary-cyan-knight-battle-20261020-v1/';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'manifest.json?zero=20261020-wings-live-v1').then(r=>{if(!r.ok)throw Error('ZERO_MOTION_ASSETS');return r.json();}).then(m=>({...m,backdrop:m.backdropVariants.wings})).catch(e=>{manifestPromise=null;throw e;});
const disposeAssets=assets=>{for(const frames of [...Object.values(assets.motion),...Object.values(assets.effects),assets.appearance,assets.summoned,assets.backdropEffects])for(const t of frames)t.destroy(false);};
export function zeroBattleArt(code){return code===ZERO_CODE?{...ZERO_ART,calmIdle:true,spriteUrl:'/'+ZERO_ART.battleSprite,footAnchor:{x:346.6/768,y:563.2/768},fullBodyHeight:768,bodyHeight:BODY_HEIGHT,originalTextureHeight:768}:null;}

// Adapt the approved suit-sized preview to an ordinary mercenary actor. V3 owns
// the clock and damage; the preview must never reset another actor or camera.
class ZeroLiveFX extends KnightFX{
 constructor(engine,actor,targets,assets,m){
  const unit=Object.assign(Object.create(actor),{bodySprite:actor.fullBodySprite,weaponSprite:{visible:false},nameHud:actor.hud,cancelFire(){},stopIdle(){}});
  const hudVisible=actor.hud.visible;
  actor.fullBodySprite.zIndex=10;
  super(Object.assign(Object.create(engine),{camera:{reset(){}}}),unit,targets,assets,m,()=>{});
  actor.hud.visible=hudVisible;this.actor=actor;this.cancel();
 }
 makeTimeline(){}
 capture(){this.home={x:this.unit.baseX??this.unit.root.x,y:this.unit.baseY??this.unit.root.y};}
 get direction(){return this.unit.team==='ENEMY'?-1:1;}
 contact(target=this.targets[0]){const h=target.art?.bodyHeight||target.fullBodyHeight||300;return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y:-h*.52}));}
 rootFor(state){
  const home=this.home,feet=this.targetFeet(),dir=this.direction;
  this.home={x:feet.x+(home.x-feet.x)*dir,y:home.y};
  try{const r=super.rootFor(state);return {...r,x:feet.x+(r.x-feet.x)*dir};}finally{this.home=home;}
 }
 applyPose(p){super.applyPose(p);this.unit.view.scale.x*=this.direction;}
 bladePoints(state,root){const f=this.pose(state.pose),scale=this.unit.root.scale.x,dir=state.pose.facing*this.direction,point=p=>({x:root.x+(p.x-f.pivot.x)*scale*dir,y:root.y+(p.y-f.pivot.y)*scale});return {grip:point(f.grip),tip:point(f.tip)};}
 drawGhosts(state){super.drawGhosts(state);if(this.direction<0)for(const s of this.ghostPool)s.scale.x*=-1;}
 render(t){
  if(this.disposed||this.unit.root.destroyed)return;
  const poses=this.targets.filter(a=>!a.root.destroyed).map(a=>({a,x:a.view.x,y:a.view.y}));
  super.render(t);
  for(const {a,x,y}of poses)if(!a.root.destroyed)a.view.position.set(x,y);
  if(this.direction<0)for(const s of this.pool)if(s.visible){s.scale.x*=-1;s.rotation*=-1;}
 }
 updateIdle(t){
  if(this.disposed||this.unit.root.destroyed)return;
  this.clock.time=t%MODES.idle.duration;this.state=sample('idle',this.clock.time);
  this.bodyState=sampleBody('idle',this.clock.time);
  const p=this.bodyState.pose,x=this.unit.view.x,y=this.unit.view.y;
  this.applyPose(p);this.unit.view.position.set(x,y);
  this.appearance?.update(t,p,this.pose(p),this.effectsEnabled,this.engine.reducedMotion);
  this.backdrop?.update(t,p,this.pose(p),this.effectsEnabled,this.engine.reducedMotion);
  this.backdrop?.fitToViewport(this.engine.app.screen);
 }
 begin(mode,targets){this.targets=targets;this.mode=mode;this.capture();this.clock.time=0;this.render(0);}
 cancel(){
  if(this.disposed)return;this.removeTimeline();this.mode='idle';this.clock.time=0;
  this.pool.forEach(s=>s.visible=false);this.ghostPool.forEach(s=>s.visible=false);this.shade.clear();
  this.array.draw(sample('idle',0),BODY_HEIGHT*this.unit.root.scale.x);
  if(this.unit.root.destroyed)return;
  const a=this.unit;a.restoreNeutralAvatarPose();a.root.position.set(a.baseX,a.baseY);a.root.depthSortY=a.baseY;a.fullBodySprite.alpha=1;
  this.capture();this.updateIdle(0);
 }
 diagnostics(){return {...super.diagnostics(),liveEnabled:true,damageAuthority:'SERVER_ONLY',backdropId:this.manifest.backdrop.id,cameraZoom:false};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.backdrop?.destroy();this.appearance?.destroy();this.array.destroy();this.front.destroy({children:true});this.back.destroy({children:true});disposeAssets(this.assets);}
}
function stopAmbient(s){if(s.ambient){const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.disposed||s.actor.root.destroyed||s.actor.hp<=0)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){if(!s.busy&&!s.stopped&&!s.actor.root.destroyed&&s.actor.hp>0&&s.actor.root.visible)s.fx.updateIdle(clock.time);}}).to(clock,{time:4.8,duration:4.8,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupZeroActor(engine,actor){
 engine.zeroStates||=new Map();engine.zeroLoads||=new Map();
 if(engine.zeroStates.has(actor))return engine.zeroStates.get(actor);
 if(engine.zeroLoads.has(actor))return engine.zeroLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const m=await manifest(),assets=await loadKnightAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new ZeroLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};engine.zeroStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.zeroLoads.delete(actor));engine.zeroLoads.set(actor,pending);return pending;
}
export function resumeZeroPlayback(engine){for(const s of engine.zeroStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelZeroPlayback(engine){for(const s of engine.zeroStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearZeroActors(engine){for(const s of engine.zeroStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.zeroStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupZeroActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 if(mode==='basic')mode=ZERO_BASIC_FORMS[s.basicCount++%ZERO_BASIC_FORMS.length].visualMode;
 s.fx.begin(mode,targets);
 const duration=MODES[mode].duration,contact=MODES[mode].contacts.at(-1),clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},engine.reducedMotion?8:1,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:ZERO_CODE,eventType:MODES[mode].type==='area'?ZERO_AREA_EVENT:'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,contactSeconds:contact,durationSeconds:duration,motionPlaybackRate:BODY_PLAYBACK_RATE,effectPlaybackRate:EFFECT_PLAYBACK_RATE,cameraZoom:false};
 return result&&valid();
}
export function playZeroBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'basic',()=>{if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});});
}
export function playZeroArea(engine,event){
 const actor=engine.combatantById(event.actorId),skill=ZERO_AREA_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==ZERO_CODE||event.type!==ZERO_AREA_EVENT||event.battleMode!=='PVE'||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),skill.visualMode,()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
