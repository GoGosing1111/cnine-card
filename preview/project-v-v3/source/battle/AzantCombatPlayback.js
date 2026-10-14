import {gsap} from 'gsap';
import {AZANT_CODE,AZANT_BATTLE_SPRITE_SHA256,AZANT_SOURCE_ART,AZANT_BATTLE_SPRITE,AZANT_VOLLEY_EVENT,AZANT_AREA_EVENT,azantPlaybackRate} from '../../../../shared/mercenary-azant-v1.mjs';
import {SapphireFX,loadSapphireAssets} from '../../../mercenary-sapphire-archmage-battle-v1/source/SapphireFX.js';
import {makePlan} from '../../../mercenary-sapphire-archmage-battle-v1/skill.mjs';
const BODY_HEIGHT=300,POSE_SCALE=BODY_HEIGHT/360;
let manifestPromise;
const manifest=()=>manifestPromise||=fetch('/preview/mercenary-sapphire-archmage-battle-v1/manifest.json?azant=20261014-live-v1').then(r=>{if(!r.ok)throw Error('AZANT_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function azantBattleArt(code){return code===AZANT_CODE?{code,name:'아잔트',sourceArt:AZANT_SOURCE_ART,battleSprite:AZANT_BATTLE_SPRITE,battleSpriteSha256:AZANT_BATTLE_SPRITE_SHA256,spriteUrl:'/'+AZANT_BATTLE_SPRITE,footAnchor:{x:.5,y:650/768},fullBodyHeight:768*POSE_SCALE,bodyHeight:BODY_HEIGHT,originalTextureHeight:768*POSE_SCALE}:null;}
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};

// The live engine owns the clock, camera and HP. Authored preview assets provide
// poses and light only; their target recoil cannot overwrite another actor.
class AzantLiveFX extends SapphireFX{
 constructor(engine,actor,assets,m){
  const visualEngine=Object.assign(Object.create(engine),{camera:{reset(){}}});
  super(visualEngine,actor,[],assets,m,makePlan({mode:'aura'}));
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
  if(mode==='ultimate')this.plan.contacts=[...targets.map((_,i)=>2.65+.4*i/Math.max(1,targets.length-1)),this.plan.finalAt];
  this.captureFormation();this.clock.time=0;this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.pool.forEach(s=>s.visible=false);this.activeFrames=[];
  this.auraBack.visible=this.staffLight.visible=false;
  if(!this.merc.root.destroyed){this.merc.restoreNeutralAvatarPose();this.applyPose({key:'idle',frame:0});this.merc.root.position.set(this.merc.baseX,this.merc.baseY);this.merc.root.depthSortY=this.merc.baseY;}
 }
 diagnostics(){return {...super.diagnostics(),damageAuthority:'SERVER_RECEIPT',stationary:true};}
}
function stopAmbient(s){if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;
 s.actor.animationController.kill();s.fx.begin('aura');
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){if(s.stopped||s.busy||s.actor.root.destroyed)return;if(s.actor.hp<=0){stopAmbient(s);s.fx.cancel();return;}s.fx.clock.time=clock.time;s.fx.render(clock.time);}}).to(clock,{time:6,duration:6,ease:'none'});
 const entry={instance,settle:()=>{stopAmbient(s);s.fx.cancel();}};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupAzantActor(engine,actor){
 engine.azantStates||=new Map();engine.azantLoads||=new Map();
 if(engine.azantStates.has(actor))return engine.azantStates.get(actor);if(engine.azantLoads.has(actor))return engine.azantLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{const m=await manifest(),assets=await loadSapphireAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const fx=new AzantLiveFX(engine,actor,assets,m),state={engine,actor,fx,busy:false,stopped:false,ambient:null};engine.azantStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.azantLoads.delete(actor));engine.azantLoads.set(actor,pending);return pending;
}
export function resumeAzantPlayback(engine){for(const s of engine.azantStates?.values()||[]){if(s.busy||s.fx.destroyed||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelAzantPlayback(engine){for(const s of engine.azantStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearAzantActors(engine){for(const s of engine.azantStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.azantStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupAzantActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const plan=s.fx.plan,duration=plan.duration,contact=plan.finalAt??plan.contacts[0],rate=azantPlaybackRate(engine),clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact/rate);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0)startAmbient(s);},null,{releaseAt:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:AZANT_CODE,eventType:mode==='attack'?'ATTACK':mode==='skill'?AZANT_VOLLEY_EVENT:AZANT_AREA_EVENT,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contact/rate,durationSeconds:duration/rate};
 return result&&valid();
}
export function playAzantBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'attack',()=>{if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});});
}
export function playAzantSkill(engine,event){
 const actor=engine.combatantById(event.actorId),area=event.type===AZANT_AREA_EVENT;
 if(actor?.cardId!==AZANT_CODE||![AZANT_VOLLEY_EVENT,AZANT_AREA_EVENT].includes(event.type)||(area?event.battleMode!=='PVE':!['PVE','PVP'].includes(event.battleMode)))return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),area?'ultimate':'skill',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
