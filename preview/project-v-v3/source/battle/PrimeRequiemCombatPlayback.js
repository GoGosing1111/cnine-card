import {gsap} from 'gsap';
import {PRIME_CODE,PRIME_ART,PRIME_BASIC_FORMS,PRIME_AREA_SKILLS,PRIME_AREA_EVENT,PRIME_PLAYBACK_RATE} from '../../../../shared/mercenary-prime-requiem-v1.mjs';
import {PrimeRequiemFX,loadPrimeAssets} from '../../../prime-requiem-blood-skills-20261021-v1/source/PrimeRequiemFX.js';
import {SKILLS} from '../../../prime-requiem-blood-skills-20261021-v1/source/SkillPlan.mjs';
const ROOT='/preview/prime-requiem-blood-skills-20261021-v1/';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'manifest.json?prime=20261021-approved-v7').then(r=>{
 if(!r.ok)throw Error('PRIME_REQUIEM_MOTION_ASSETS');return r.json();
}).catch(e=>{manifestPromise=null;throw e;});
const disposeAssets=assets=>{for(const frames of Object.values(assets))for(const texture of frames)texture.destroy(false);};
export const primeBattleArt=code=>code===PRIME_CODE?{...PRIME_ART,calmIdle:true,spriteUrl:'/'+PRIME_ART.battleSprite,
 footAnchor:{x:151/290,y:503/515},fullBodyHeight:410,bodyHeight:410,originalTextureHeight:515}:null;

// Reuse every approved body/FX frame. Only V3 owns playback and server HP receipts.
class PrimeLiveFX extends PrimeRequiemFX{
 makeIdleTimeline(){this.mode='ambient';this.clock.time=0;}
 makeTimeline(){}
 get facing(){return this.actor.team==='ENEMY'?-1:1;}
 captureFormation(){this.start={x:this.actor.baseX??this.actor.root.x,y:this.actor.baseY??this.actor.root.y};}
 render(time,auraTime=time){
  if(this.destroyed||this.actor.root.destroyed)return;
  if(this.targets.some(t=>t.root.destroyed)){
   const remaining=this.targets.map((t,i)=>({t,defaults:this.targetDefaults[i]})).filter(({t})=>!t.root.destroyed);
   this.targets=remaining.map(({t})=>t);this.targetDefaults=remaining.map(({defaults})=>defaults);
  }
  const saved=this.targets.filter(t=>!t.root.destroyed).map(t=>({t,x:t.view.x,y:t.view.y,tint:t.fullBodySprite.tint}));
  if(!saved.length){this.targets=[this.actor];this.targetDefaults=[{x:this.actor.view.x,y:this.actor.view.y,tint:this.actor.fullBodySprite.tint}];}
  const background=this.engine.parallaxLayers.map(p=>({sprite:p.sprite,tint:p.sprite.tint}));
  try{super.render(time,auraTime);}
  finally{
   for(const {t,x,y,tint}of saved)if(!t.root.destroyed){t.view.position.set(x,y);t.fullBodySprite.tint=tint;}
   for(const {sprite,tint}of background)if(!sprite.destroyed)sprite.tint=tint;
  }
  if(this.facing<0)for(const sprite of this.pool)if(sprite.visible&&sprite.fxKey!=='sword-afterimage'){
   sprite.scale.x*=-1;sprite.rotation*=-1;
  }
 }
 updateIdle(time){this.captureFormation();this.render(0,time);}
 begin(mode,targets){
  this.targets=targets;this.targetDefaults=targets.map(t=>({x:t.view.x,y:t.view.y,tint:t.fullBodySprite.tint}));
  this.plan=SKILLS.find(s=>s.id===mode);this.mode='attack';this.captureFormation();this.clock.time=0;this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.mode='ambient';this.clock.time=0;
  for(const sprite of this.pool)sprite.visible=false;
  if(this.actor.root.destroyed)return;
  this.actor.restoreNeutralAvatarPose();this.actor.applyFacing();this.actor.fullBodySprite.alpha=1;
  this.actor.root.position.set(this.actor.baseX,this.actor.baseY);this.actor.root.depthSortY=this.actor.baseY;
  this.updateIdle(0);
 }
 diagnostics(){return {...super.diagnostics(),liveEnabled:true,damageAuthority:'SERVER_ONLY',cameraZoom:false,playbackRate:PRIME_PLAYBACK_RATE};}
}
function stopAmbient(state){
 if(!state.ambient)return;const entry=state.ambient;state.ambient=null;
 state.engine.simpleTimelines.delete(entry);entry.instance.kill();
}
function startAmbient(state){
 stopAmbient(state);if(state.stopped||state.fx.destroyed||state.actor.root.destroyed||state.actor.hp<=0)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){
  if(!state.busy&&!state.stopped&&!state.actor.root.destroyed&&state.actor.hp>0&&state.actor.root.visible)state.fx.updateIdle(clock.time);
 }}).to(clock,{time:6.4,duration:6.4,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(state)};state.ambient=entry;state.engine.simpleTimelines.add(entry);
 if(!state.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupPrimeActor(engine,actor){
 engine.primeStates||=new Map();engine.primeLoads||=new Map();
 if(engine.primeStates.has(actor))return engine.primeStates.get(actor);
 if(engine.primeLoads.has(actor))return engine.primeLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const m=await manifest(),assets=await loadPrimeAssets(m,ROOT);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const target=(actor.team==='ENEMY'?engine.allies:engine.enemies).find(a=>!a.root.destroyed)||actor;
  const fx=new PrimeLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  engine.primeStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.primeLoads.delete(actor));engine.primeLoads.set(actor,pending);return pending;
}
export function resumePrimePlayback(engine){for(const s of engine.primeStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelPrimePlayback(engine){for(const s of engine.primeStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearPrimeActors(engine){for(const s of engine.primeStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.primeStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupPrimeActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 if(mode==='basic')mode=PRIME_BASIC_FORMS[s.basicCount++%PRIME_BASIC_FORMS.length].visualMode;
 s.fx.begin(mode,targets);
 const plan=s.fx.plan,duration=plan.duration,contact=plan.contacts.at(-1),clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},
 engine.reducedMotion?8:PRIME_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:PRIME_CODE,eventType:plan.targetMode==='area'?PRIME_AREA_EVENT:'ATTACK',mode,
  clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,contactSeconds:contact,
  durationSeconds:duration,playbackRate:PRIME_PLAYBACK_RATE,cameraZoom:false};
 return result&&valid();
}
export function playPrimeBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'basic',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playPrimeArea(engine,event){
 const actor=engine.combatantById(event.actorId),skill=PRIME_AREA_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==PRIME_CODE||event.type!==PRIME_AREA_EVENT||event.battleMode!=='PVE'||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),skill.visualMode,()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
