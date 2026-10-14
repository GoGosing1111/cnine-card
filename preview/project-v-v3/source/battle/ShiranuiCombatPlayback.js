import {gsap} from 'gsap';
import {SHIRANUI_CODE,SHIRANUI_ART,SHIRANUI_AREA_EVENT,SHIRANUI_COMBAT} from '../../../../shared/mercenary-shiranui-v1.mjs';
import {BallisticArtilleryFX,loadBallisticAssets} from '../../../mercenary-monochrome-artillery-battle-v1/source/BallisticArtilleryFX.js';
import {makePlan,MODES} from '../../../mercenary-monochrome-artillery-battle-v1/skill.mjs';

const BODY_HEIGHT=300,MANIFEST='/preview/mercenary-monochrome-artillery-battle-v1/manifest.json?v=20261015-shiranui-live-v1';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(MANIFEST).then(r=>{if(!r.ok)throw Error('SHIRANUI_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function shiranuiBattleArt(code){
 if(code!==SHIRANUI_CODE)return null;
 return {...SHIRANUI_ART,spriteUrl:'/'+SHIRANUI_ART.battleSprite+'?v='+SHIRANUI_ART.battleSpriteSha256.slice(0,16),
  footAnchor:{x:600/1536,y:1300/1536},fullBodyHeight:1536*BODY_HEIGHT/720,bodyHeight:BODY_HEIGHT,originalTextureHeight:1536*BODY_HEIGHT/720};
}
const release=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};

// Reuse the approved visual without its independent clock, camera or target resets.
class ShiranuiLiveFX extends BallisticArtilleryFX{
 constructor(engine,actor,targets,assets,m){
  const visualEngine=Object.assign(Object.create(engine),{camera:{reset(){},addShake(){}}});
  super(visualEngine,actor,targets,assets,m,{...makePlan({mode:'aura'}),damageAuthority:'SERVER_ONLY'});
  this.cancel();
 }
 makeTimeline(){}
 get direction(){return this.merc.team==='ENEMY'?-1:1;}
 applyPose(p){super.applyPose(p);this.merc.view.scale.x=this.direction*Math.abs(this.merc.view.scale.x||1);}
 point(actor,f=.43){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-(actor.art?.bodyHeight||actor.fullBodyHeight)*f}));}
 rifle(t,muzzle,axis,unit){
  const a=this.ownPoint(),b=this.ownPoint(Math.cos(axis),Math.sin(axis));
  super.rifle(t,muzzle,Math.atan2(b.y-a.y,b.x-a.x),unit);
 }
 updateHalo(state){super.updateHalo({...state,cancelled:state.cancelled||this.merc.hp<=0});}
 updateBodyAura(state){super.updateBodyAura({...state,cancelled:state.cancelled||this.merc.hp<=0});}
 render(t){
  if(this.destroyed||this.merc.root.destroyed||this.targets.some(a=>a.root.destroyed))return;
  const before=this.targets.map(a=>({a,x:a.view.x,y:a.view.y,tint:a.fullBodySprite.tint}));
  this.targetsBase=before.map(({x,tint})=>({x,tint}));super.render(t);
  for(const {a,x,y,tint}of before){a.view.position.set(x,y);a.fullBodySprite.tint=tint;}
 }
 begin(mode,targets){this.targets=[...new Set(targets)];this.plan={...makePlan({mode}),damageAuthority:'SERVER_ONLY'};this.captureFormation();this.clock.time=0;this.render(0);}
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.clock.time=0;
  this.pool?.forEach(s=>s.visible=false);this.haloBack.visible=this.bodyAuraBack.visible=this.bodyAuraFront.visible=false;
  const a=this.merc;if(a.root.destroyed)return;
  this.plan={...makePlan({mode:'aura'}),damageAuthority:'SERVER_ONLY'};
  a.restoreNeutralAvatarPose();this.sample={pose:{key:'ar',frame:0}};this.applyPose(this.sample.pose);
  a.root.position.set(a.baseX,a.baseY);a.root.depthSortY=a.baseY;
 }
 diagnostics(){return {...super.diagnostics(),damageAuthority:'SERVER_ONLY',clockOwner:'V3_REGISTERED_GSAP'};}
}
function stopAmbient(s){if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;
 const clock={time:0},update=()=>{
  if(s.busy||s.stopped||s.actor.root.destroyed)return;
  s.fx.clock.time=clock.time;const state={time:clock.time,cancelled:s.actor.hp<=0};
  s.fx.updateBodyAura(state);s.fx.updateHalo(state);
 };update();
 const instance=gsap.timeline({repeat:-1,onUpdate:update}).to(clock,{time:12,duration:12,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupShiranuiActor(engine,actor){
 engine.shiranuiStates||=new Map();engine.shiranuiLoads||=new Map();
 if(engine.shiranuiStates.has(actor))return engine.shiranuiStates.get(actor);
 if(engine.shiranuiLoads.has(actor))return engine.shiranuiLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const m=await manifest(),assets=await loadBallisticAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){release(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new ShiranuiLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  engine.shiranuiStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.shiranuiLoads.delete(actor));engine.shiranuiLoads.set(actor,pending);return pending;
}
export function resumeShiranuiPlayback(engine){for(const s of engine.shiranuiStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelShiranuiPlayback(engine){for(const s of engine.shiranuiStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearShiranuiActors(engine){for(const s of engine.shiranuiStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.shiranuiStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupShiranuiActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 // Third basic uses the approved 30-round skill. All rounds share one server hit.
 if(mode==='basic')mode=++s.basicCount%3===0?'skill':'attack';
 s.fx.begin(mode,targets);
 const ultimate=mode==='ultimate',duration=MODES[mode].duration,contact=MODES[mode].contacts[0],rate=SHIRANUI_COMBAT.motionPlaybackRate,clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact/rate);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0)startAmbient(s);},ultimate?(engine.reducedMotion?8:1):null,{releaseAt:ultimate?null:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:SHIRANUI_CODE,eventType:ultimate?SHIRANUI_AREA_EVENT:'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contact/rate,durationSeconds:duration/rate};
 return result&&valid();
}
export function playShiranuiBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'basic',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playShiranuiArea(engine,event){
 const actor=engine.combatantById(event.actorId);if(actor?.cardId!==SHIRANUI_CODE||event.type!==SHIRANUI_AREA_EVENT||event.battleMode!=='PVE')return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),'ultimate',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
