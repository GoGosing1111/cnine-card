import {gsap} from 'gsap';
import {KAIRON_CODE,KAIRON_ART,KAIRON_AREA_EVENT,KAIRON_COMBAT} from '../../../../shared/mercenary-kairon-v1.mjs';
import {UziBarrageFX,loadAssets} from '../../../mercenary-black-uniform-dual-uzi-v1/source/UziBarrageFX.js';
import {PLANS} from '../../../mercenary-black-uniform-dual-uzi-v1/skill.mjs';
import {BULLET} from '../../../mercenary-black-uniform-dual-uzi-v1/bullet-flight.mjs';

const ROOT='/preview/mercenary-black-uniform-dual-uzi-v1/',BODY_HEIGHT=285;
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'manifest.json?kairon=20261014-craft-v1').then(r=>{if(!r.ok)throw Error('KAIRON_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function kaironBattleArt(code){
 if(code!==KAIRON_CODE)return null;
 return {...KAIRON_ART,spriteUrl:'/'+KAIRON_ART.battleSprite,footAnchor:{x:530/1024,y:1478/1536},
  fullBodyHeight:1536*BODY_HEIGHT/1404,bodyHeight:BODY_HEIGHT,originalTextureHeight:1536*BODY_HEIGHT/1404};
}
const release=assets=>{for(const frames of Object.values(assets))for(const texture of frames)texture.destroy(false);};
class KaironLiveFX extends UziBarrageFX{
 makeTimeline(){} // The canonical V3 timeline exclusively advances this effect.
 restoreTargets(){} // Preview fades must never replace live HP/KO presentation.
 applyPose(index){
  this.bodyHeight=BODY_HEIGHT;
  const frame=super.applyPose(index);
  this.actor.view.scale.x=(this.actor.team==='ENEMY'?-1:1)*Math.abs(this.actor.view.scale.x||1);return frame;
 }
 updateAura(time){super.updateAura(time);this.aura.visible=this.auraEnabled&&this.actor.hp>0;}
 updateRim(state){super.updateRim(state);this.rim.visible=this.rimEnabled&&this.actor.hp>0;}
 draw(key,index,point,width,options){const sprite=super.draw(key,index,point,width,options);if(key==='muzzle'&&this.actor.team==='ENEMY')sprite.scale.x=-Math.abs(sprite.scale.x);return sprite;}
 scopes(points,time,until){super.scopes(this.mode==='quantum'&&this.realTargets?this.realTargets.map(t=>this.targetPoint(t)):points,time,until);}
 quantum(state,points){
  super.quantum(state,points);
  for(const [i,target]of (this.realTargets||[]).filter(t=>!this.targets.includes(t)).entries()){
   const age=state.time-(3.65+(i%5)*.18);
   if(age>=0&&age<1.7)this.sequence('impact',8+Math.min(7,age/1.7*7),this.targetPoint(target),280,{alpha:Math.min(1,(1.7-age)*2)});
  }
 }
 render(time){
  if(this.destroyed||this.actor.root.destroyed||this.targets.some(t=>t.root.destroyed))return;
  const before=[...new Set(this.targets)].map(a=>({a,alpha:a.view.alpha,x:a.view.x,tint:a.fullBodySprite.tint}));
  super.render(time);
  for(const {a,alpha,x,tint}of before){a.view.alpha=alpha;a.view.x=x;a.fullBodySprite.tint=tint;}
 }
 begin(mode,targets){
  this.mode=mode;this.plan=PLANS[mode];
  this.realTargets=[...new Set(targets)];
  // The authored visual addresses five slots; short enemy teams reuse the
  // existing target positions. Server receipts remain deduplicated below.
  this.targets=Array.from({length:5},(_,i)=>targets.length>5?targets[Math.floor(i*targets.length/5)]:targets[i%targets.length]);
  this.targetDefaults=this.targets.map(t=>({alpha:t.view.alpha,x:t.view.x,tint:t.fullBodySprite.tint}));
  this.clock.time=0;this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.clock.time=0;this.render(0);
  if(this.actor.root.destroyed)return;
  // Generic idle restores the original SD's scale. Restore its texture and
  // anchor as well, or the smaller firing-atlas cell shrinks under that scale.
  const s=this.actor.fullBodySprite,idle=this.original;
  s.texture=idle.texture;s.anchor.set(idle.anchor.x,idle.anchor.y);s.width=idle.width;s.height=idle.height;
  this.actor.restoreNeutralAvatarPose();this.updateRim({time:0});
 }
 diagnostics(){return {...super.diagnostics(),damageAuthority:'SERVER_ONLY',clockOwner:'V3_REGISTERED_GSAP'};}
}
function stopAmbient(s){if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){
  if(s.busy||s.stopped||s.actor.root.destroyed)return;
  s.fx.updateAura(clock.time);s.fx.updateRim({time:clock.time});
 }}).to(clock,{time:6,duration:6,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupKaironActor(engine,actor){
 engine.kaironStates||=new Map();engine.kaironLoads||=new Map();
 if(engine.kaironStates.has(actor))return engine.kaironStates.get(actor);
 if(engine.kaironLoads.has(actor))return engine.kaironLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const m=await manifest(),assets=await loadAssets(m,ROOT);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){release(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new KaironLiveFX(engine,actor,Array(5).fill(target),assets,m),state={engine,actor,fx,busy:false,stopped:false};
  engine.kaironStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.kaironLoads.delete(actor));engine.kaironLoads.set(actor,pending);return pending;
}
export function resumeKaironPlayback(engine){for(const s of engine.kaironStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelKaironPlayback(engine){for(const s of engine.kaironStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearKaironActors(engine){for(const s of engine.kaironStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.kaironStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupKaironActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const ultimate=mode==='quantum',duration=PLANS[mode].duration,contact=ultimate?PLANS.quantum.detonation:PLANS.barrage.release+BULLET.flight,rate=KAIRON_COMBAT.motionPlaybackRate,clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact/rate);
 // The next receipt must not settle the shared targets while the missile
 // explosion is still expanding. Keep the full visual out of automatic pacing.
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},ultimate?(engine.reducedMotion?8:1):null,{releaseAt:ultimate?null:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:KAIRON_CODE,eventType:ultimate?KAIRON_AREA_EVENT:'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contact/rate,durationSeconds:duration/rate};
 return result&&valid();
}
export function playKaironBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'barrage',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playKaironArea(engine,event){
 const actor=engine.combatantById(event.actorId);if(actor?.cardId!==KAIRON_CODE||event.type!==KAIRON_AREA_EVENT||event.battleMode!=='PVE')return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),'quantum',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
