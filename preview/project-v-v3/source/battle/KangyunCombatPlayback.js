import {KANGYUN_CODE,KANGYUN_SOURCE_ART,KANGYUN_BATTLE_SPRITE} from '../../../../shared/mercenary-kangyun-v1.mjs';
const KANGYUN_VOLLEY_EVENT='MERCENARY_IMPERIAL_ARROW_VOLLEY',KANGYUN_AREA_EVENT='MERCENARY_IMPERIAL_ARROW_RAIN';
const KANGYUN_BATTLE_SPRITE_SHA256='A29250EFE5CA79E057C7E5C9724D9ADE8F2446416586F495EADD09C8C660CFD8';
const kangyunPlaybackRate=engine=>engine.reducedMotion?8:1.3*Math.max(.25,Number(engine.paceScale)||1)*1.5;
import {ImperialArcherFX,loadArcherAssets} from '../../../mercenary-imperial-archer-sss-v1/source/ImperialArcherFX.js';
import {makePlan} from '../../../mercenary-imperial-archer-sss-v1/skill.mjs';
const BODY_HEIGHT=300,POSE_SCALE=BODY_HEIGHT/360;
let manifestPromise;
const manifest=()=>manifestPromise||=fetch('/preview/mercenary-imperial-archer-sss-v1/manifest.json?kangyun=20261018-live-v1').then(r=>{if(!r.ok)throw Error('KANGYUN_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function kangyunBattleArt(code){return code===KANGYUN_CODE?{code,name:'신궁 강윤',sourceArt:KANGYUN_SOURCE_ART,battleSprite:KANGYUN_BATTLE_SPRITE,battleSpriteSha256:KANGYUN_BATTLE_SPRITE_SHA256,spriteUrl:'/'+KANGYUN_BATTLE_SPRITE,footAnchor:{x:350/768,y:650/768},fullBodyHeight:768*POSE_SCALE,bodyHeight:BODY_HEIGHT,originalTextureHeight:768*POSE_SCALE}:null;}
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};

// The live engine owns the clock, camera and HP. Authored preview assets provide
// poses and light only; their target recoil cannot overwrite another actor.
class KangyunLiveFX extends ImperialArcherFX{
 constructor(engine,actor,assets,m){
  const visualEngine=Object.assign(Object.create(engine),{camera:{reset(){}}});
  super(visualEngine,actor,[],assets,m,makePlan({mode:'idle'}));
 }
 makeTimeline(){}
 applyPose(pose){super.applyPose(pose);this.merc.view.position.set(0,0);this.merc.view.scale.set(this.merc.team==='ENEMY'?-1:1,1);}
 point(a,f=.43){return this.engine.effectLayer.toLocal(a.root.toGlobal({x:0,y:-(a.art?.bodyHeight||a.fullBodyHeight)*f}));}
 render(t){
  if(this.destroyed||this.merc.root.destroyed||this.targets.some(a=>a.root.destroyed))return;
  const saved=this.targets.map(a=>({a,x:a.view.x,tint:a.fullBodySprite.tint}));super.render(t);
  for(const {a,x,tint}of saved){a.view.x=x;a.fullBodySprite.tint=tint;}
 }
 begin(mode,targets=[]){
  this.targets=targets;this.targetsBase=targets.map(a=>({x:a.view.x,tint:a.fullBodySprite.tint}));this.plan=makePlan({mode});
  this.captureFormation();this.clock.time=0;this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.pool.forEach(s=>s.visible=false);this.activeFrames=[];
  this.bowString.clear();
  if(!this.merc.root.destroyed){this.merc.restoreNeutralAvatarPose();this.applyPose({key:'idle',frame:0});this.merc.root.position.set(this.merc.baseX,this.merc.baseY);this.merc.root.depthSortY=this.merc.baseY;}
 }
 diagnostics(){return {...super.diagnostics(),damageAuthority:'SERVER_RECEIPT',stationary:true};}
}
function restoreIdle(s){if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;s.actor.animationController.kill();s.fx.begin('idle');}
export async function setupKangyunActor(engine,actor){
 engine.kangyunStates||=new Map();engine.kangyunLoads||=new Map();
 if(engine.kangyunStates.has(actor))return engine.kangyunStates.get(actor);if(engine.kangyunLoads.has(actor))return engine.kangyunLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{const m=await manifest(),assets=await loadArcherAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const fx=new KangyunLiveFX(engine,actor,assets,m),state={engine,actor,fx,busy:false,stopped:false};engine.kangyunStates.set(actor,state);restoreIdle(state);return state;
 })().finally(()=>engine.kangyunLoads.delete(actor));engine.kangyunLoads.set(actor,pending);return pending;
}
export function resumeKangyunPlayback(engine){for(const s of engine.kangyunStates?.values()||[]){if(s.busy||s.fx.destroyed||s.actor.hp<=0)continue;s.stopped=false;restoreIdle(s);}}
export function cancelKangyunPlayback(engine){for(const s of engine.kangyunStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearKangyunActors(engine){for(const s of engine.kangyunStates?.values()||[]){s.fx.destroy();}engine.kangyunStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupKangyunActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const plan=s.fx.plan,duration=plan.duration,contact=plan.contacts.at(-1),rate=kangyunPlaybackRate(engine),clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact/rate);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0)restoreIdle(s);},null,{releaseAt:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:KANGYUN_CODE,eventType:mode==='attack'?'ATTACK':mode==='skill'?KANGYUN_VOLLEY_EVENT:KANGYUN_AREA_EVENT,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contact/rate,durationSeconds:duration/rate};
 return result&&valid();
}
export function playKangyunBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'attack',()=>{if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});});
}
export function playKangyunSkill(engine,event){
 const actor=engine.combatantById(event.actorId),area=event.type===KANGYUN_AREA_EVENT;
 if(actor?.cardId!==KANGYUN_CODE||![KANGYUN_VOLLEY_EVENT,KANGYUN_AREA_EVENT].includes(event.type)||(area?event.battleMode!=='PVE':!['PVE','PVP'].includes(event.battleMode)))return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),area?'ultimate':'skill',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
