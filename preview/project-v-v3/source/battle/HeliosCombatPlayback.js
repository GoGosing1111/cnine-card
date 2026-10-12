import {HELIOS_CODE,HELIOS_AREA_EVENT,HELIOS_COMBAT} from '../../../../shared/mercenary-helios-v1.mjs';
import {LIMITED_MERCENARIES} from '../../../../shared/mercenary-limited-catalog-v1.mjs';
import {SolarFX,loadSolarAssets} from '../../../mercenary-limited-solar-sword-20261009-v1/source/SolarFX.js';
import {MODES,mix} from '../../../mercenary-limited-solar-sword-20261009-v1/motion.mjs';
import {JinmuDialogue} from './JinmuDialogue.js';
import {MERCENARY_DIALOGUE_PROFILES} from './MercenaryDialogueProfiles.js';
import {gsap} from 'gsap';
import {HeliosSurroundingAura} from './HeliosSurroundingAura.js';

const BODY_HEIGHT=312.3894230769231,POSE_SCALE=BODY_HEIGHT/330;
const MANIFEST='/preview/mercenary-limited-solar-sword-20261009-v1/manifest.json';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(MANIFEST).then(r=>{if(!r.ok)throw Error('HELIOS_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function heliosBattleArt(code){
 if(code!==HELIOS_CODE)return null;const c=LIMITED_MERCENARIES.find(c=>c.code===code);
 // Approved SD is idle-00's alpha crop with a 30px border; never resample it.
 return {code,name:c.name,sourceArt:c.sourceArt,battleSprite:c.battleSprite,spriteUrl:'/'+c.battleSprite+'?v='+c.battleSpriteSha256.slice(0,16),
  footAnchor:{x:158.7/366,y:360/391},fullBodyHeight:391*POSE_SCALE,bodyHeight:BODY_HEIGHT,originalTextureHeight:391*POSE_SCALE};
}
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};

// Reuse the authored poses, rigid sword and effects. The production renderer owns
// timing, HP, camera and target recoil; the preview's controls cannot alter them.
class HeliosLiveFX extends SolarFX{
 constructor(engine,actor,targets,assets,m){
  const sprite=actor.fullBodySprite,view=actor.view;
  const idle={texture:sprite.texture,anchor:[sprite.anchor.x,sprite.anchor.y],scale:[sprite.scale.x,sprite.scale.y],position:[sprite.x,sprite.y],viewScale:[view.scale.x,view.scale.y]};
  const unit={liveActor:actor,idle,root:actor.root,view,bodySprite:sprite,weaponSprite:{visible:false},nameHud:{visible:false},stopIdle:()=>actor.animationController.kill(),cancelFire:()=>{}};
  const visualEngine=Object.assign(Object.create(engine),{camera:{reset(){}},parallaxLayers:[]});
  super(visualEngine,unit,targets,assets,m,()=>{});this.removeTimeline();this.cancel();
  this.dialogue=new JinmuDialogue(engine,MERCENARY_DIALOGUE_PROFILES[HELIOS_CODE]);
  this.aura=new HeliosSurroundingAura(engine,actor,assets,BODY_HEIGHT);
 }
 // The live aura owns independent rear layers, never the preview's body clock.
 ambient(t){this.aura?.update(t);}
 capture(){this.home={x:this.unit.liveActor.baseX,y:this.unit.liveActor.baseY};this.zoom=false;this.safeFrame=null;}
 get direction(){return this.unit.liveActor.team==='ENEMY'?-1:1;}
 bounds(){const b=super.bounds();b.size=BODY_HEIGHT*Math.abs(this.unit.root.scale.x);return b;}
 targetPoint(target,ratio=0){return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y:-(target.art?.bodyHeight||target.fullBodyHeight||300)*ratio}));}
 rootFor(state,b){
  const target=this.targetPoint(this.target),hit=this.manifest.motion.cut.frames[2],scale=POSE_SCALE*Math.abs(this.unit.root.scale.x),dir=this.direction;
  const offset=((hit.grip.x-hit.pivot.x)+(hit.tip.x-hit.grip.x)*.56)*scale;
  const dest=state.mode==='attack'?{x:target.x-dir*offset,y:target.y}:state.mode==='ultimate'?{x:(dir>0?b.minX:b.maxX)-dir*b.size*1.25,y:b.floor+b.size*.25}:this.home;
  return {x:mix(this.home.x,dest.x,state.entry),y:mix(this.home.y,dest.y,state.entry)};
 }
 applyPose(p){const f=this.pose(p),s=this.unit.bodySprite;s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(POSE_SCALE);s.position.set(0,0);s.tint=0xffffff;s.alpha=1;this.unit.view.position.set(0,0);this.unit.view.scale.set(this.direction*p.facing,1);}
 bladePoints(p,r){const f=this.pose(p),scale=POSE_SCALE*Math.abs(this.unit.root.scale.x),point=a=>({x:r.x+(a.x-f.pivot.x)*scale*p.facing*this.direction,y:r.y+(a.y-f.pivot.y)*scale});return{grip:point(f.grip),tip:point(f.tip),head:point(f.head)};}
 render(t){
  if(this.disposed||this.unit.root.destroyed)return;
  const targets=this.targets.map(a=>({a,x:a.view.x,y:a.view.y}));super.render(t);
  for(const {a,x,y}of targets)if(!a.root.destroyed)a.view.position.set(x,y);
 }
 begin(mode,targets){this.targets=targets;this.target=targets[0];if(mode==='ultimate')this.dialogue?.begin();this.capture();this.mode=mode;this.cancelled=false;this.clock.time=0;this.render(0);}
 cancel(){
  if(this.disposed)return;this.removeTimeline();this.cancelled=true;this.clock.time=0;
  this.dialogue?.end();
  this.aura?.hide();
  this.pool?.forEach(s=>s.visible=false);this.ghosts?.forEach(s=>s.visible=false);this.swords?.forEach(s=>s.visible=false);this.shade?.clear();this.groundLight?.clear();this.groundMask?.clear();
  const u=this.unit,a=u.liveActor;if(a.root.destroyed)return;
  u.bodySprite.texture=u.idle.texture;u.bodySprite.anchor.set(...u.idle.anchor);u.bodySprite.scale.set(...u.idle.scale);u.bodySprite.position.set(...u.idle.position);u.bodySprite.alpha=1;
  a.restoreNeutralAvatarPose();u.view.scale.set(...u.idle.viewScale);u.root.position.set(a.baseX,a.baseY);u.root.depthSortY=a.baseY;
 }
 restoreBackdrop(){}
 diagnostics(){return {...super.diagnostics(),dialogue:this.dialogue?.diagnostics(),surroundingAura:this.aura?.diagnostics()};}
 destroy(){this.aura?.destroy();this.dialogue?.destroy();super.destroy();}
}
function stopAmbient(s){
 if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();
}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.disposed||s.actor.root.destroyed||s.actor.hp<=0)return;
 s.fx.aura.update(0);
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){
  if(s.stopped||s.busy||s.actor.root.destroyed)return;
  s.fx.aura.update(clock.time);
 }}).to(clock,{time:5.6,duration:5.6,ease:'none'});
 const entry={instance,settle:()=>{stopAmbient(s);s.fx.aura.hide();}};
 s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupHeliosActor(engine,actor){
 engine.heliosStates||=new Map();engine.heliosLoads||=new Map();
 if(engine.heliosStates.has(actor))return engine.heliosStates.get(actor);
 if(engine.heliosLoads.has(actor))return engine.heliosLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const m=await manifest(),assets=await loadSolarAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new HeliosLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false,ambient:null};engine.heliosStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.heliosLoads.delete(actor));engine.heliosLoads.set(actor,pending);return pending;
}
export function resumeHeliosPlayback(engine){for(const s of engine.heliosStates?.values()||[]){if(s.busy||s.fx.disposed||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelHeliosPlayback(engine){for(const s of engine.heliosStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearHeliosActors(engine){for(const s of engine.heliosStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.heliosStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupHeliosActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const duration=MODES[mode].duration,contact=MODES[mode].contacts[0],rate=HELIOS_COMBAT.motionPlaybackRate,clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact/rate);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},null,{releaseAt:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:HELIOS_CODE,eventType:mode==='attack'?'ATTACK':HELIOS_AREA_EVENT,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contact/rate,durationSeconds:duration/rate};
 return result&&valid();
}
export function playHeliosBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'attack',()=>{if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});});
}
export function playHeliosArea(engine,event){
 const actor=engine.combatantById(event.actorId);if(actor?.cardId!==HELIOS_CODE||event.type!==HELIOS_AREA_EVENT||event.battleMode!=='PVE')return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),'ultimate',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
