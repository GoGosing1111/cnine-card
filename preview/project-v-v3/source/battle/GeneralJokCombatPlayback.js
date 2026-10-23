import {gsap} from 'gsap';
import {GENERAL_JOK_CODE,GENERAL_JOK_ART,GENERAL_JOK_BASIC_FORMS,GENERAL_JOK_AREA_SKILLS,GENERAL_JOK_AREA_EVENT,GENERAL_JOK_PLAYBACK_RATE} from '../../../../shared/mercenary-general-jok-v1.mjs';
import {GeneralJokFX,loadGeneralJokAssets,ROOT} from '../../../mercenary-general-jok-battle-20261022-v1/source/GeneralJokFX.js';
import {makePlan} from '../../../mercenary-general-jok-battle-20261022-v1/skill.mjs';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'manifest.json?general-jok=20261023-approved-v15').then(r=>{
 if(!r.ok)throw Error('GENERAL_JOK_MOTION_ASSETS');return r.json();
}).catch(e=>{manifestPromise=null;throw e;});
export const generalJokBattleArt=code=>code===GENERAL_JOK_CODE?{...GENERAL_JOK_ART,calmIdle:true,spriteUrl:'/'+GENERAL_JOK_ART.battleSprite,
 footAnchor:{x:550/1536,y:991/1024},fullBodyHeight:360*1024/980,bodyHeight:360,originalTextureHeight:1024}:null;

// The V15 textures keep their proportions; actual formation and facing supply
// every world anchor. V3 exclusively owns the clock and authoritative HP writes.
class GeneralJokLiveFX extends GeneralJokFX{
 makeTimeline(){}
 get cameraEffectsEnabled(){return false;}
 get facing(){return this.merc.team==='ENEMY'?-1:1;}
 get effectScale(){return Math.max(.25,Math.abs(this.merc.root.scale.x));}
 alive(a){return !!a&&!a.root.destroyed&&(this.castTargets?.has(a)||super.alive(a));}
 stagePoint(x,y){
  const origin=this.actorGround(this.merc),scale=this.effectScale;
  if(x>=900&&this.targets.length){
   const points=this.targets.map(a=>this.actorGround(a)),xs=points.map(p=>p.x),first=Math.min(...xs),last=Math.max(...xs);
   const center=(first+last)/2,span=Math.max(180*scale,last-first),u=(x-1175)/450;
   return {x:center+this.facing*u*span,y:origin.y+(y-640)*scale};
  }
  return {x:origin.x+this.facing*(x-430)*scale,y:origin.y+(y-640)*scale};
 }
 blastWidth(x,opening){return opening?680:790;}
 muzzleAngle(){const a=super.muzzleAngle();return this.facing<0?Math.PI-a:a;}
 drawBatteryMuzzle(p,age,width,rotation=0){return super.drawBatteryMuzzle(p,age,width,this.facing<0?Math.PI-rotation:rotation);}
 draw(texture,p,width,options={}){
  // Bound oversized formation effects to the existing battlefield, never zoom it.
  const size=Math.min(width*this.effectScale,this.engine.scene.width*.70);
  const sprite=super.draw(texture,p,size,options);
  if(sprite&&this.facing<0&&options.rotation==null)sprite.scale.x*=-1;
  return sprite;
 }
 render(t){
  if(this.destroyed||this.merc.root.destroyed)return;
  this.reducedMotion=!!this.engine.reducedMotion;
  super.render(t);
 }
 updateIdle(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  this.targets=[];this.bases=[];this.castTargets=null;this.plan=makePlan({mode:'ready'});
  this.render(0);this.c9Flag.render(time,this.sample);this.renderAura(time,this.sample);
 }
 begin(mode,targets){
  this.restoreTargets();this.targets=targets;this.castTargets=new Set(targets.filter(t=>t.hp>0));
  this.captureFormation();this.plan=makePlan({mode});this.clock.time=0;
  const n=targets.length;
  for(const key of ['battery','naval','fragments'])for(const shot of this.plan[key])shot.target=shot.index%n;
  if(n!==5&&this.plan.area&&this.plan.hitMarks.length){
   const templates=[...this.plan.hitMarks];
   this.plan.hitMarks=targets.map((_,i)=>({...templates[i%templates.length],target:i}));
  }
  this.render(0);
 }
 restoreTargets(){
  this.targets?.forEach((a,i)=>{const base=this.bases?.[i];if(base&&!a.root.destroyed){a.view.position.set(base.x,base.y);a.view.rotation=base.rotation;a.fullBodySprite.tint=base.tint;}});
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.restoreTargets();this.castTargets=null;this.clock.time=0;
  if(this.merc.root.destroyed)return;
  this.merc.applyFacing();this.merc.fullBodySprite.alpha=1;this.updateIdle(0);
 }
 diagnostics(){return {...super.diagnostics(),liveEnabled:true,damageAuthority:'SERVER_ONLY',cameraZoom:false,playbackRate:GENERAL_JOK_PLAYBACK_RATE};}
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
export async function setupGeneralJokActor(engine,actor){
 engine.generalJokStates||=new Map();engine.generalJokLoads||=new Map();
 if(engine.generalJokStates.has(actor))return engine.generalJokStates.get(actor);
 if(engine.generalJokLoads.has(actor))return engine.generalJokLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const m=await manifest(),assets=await loadGeneralJokAssets(m);
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&epoch===engine.mercenaryEpoch;
  // Finishing a download must not replace a body halfway through a normal V3
  // strike. Its pending return tail owns the pose until that action settles.
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE')){
   await new Promise(resolve=>setTimeout(resolve,32));
  }
  if(!valid()){return null;}
  const target=(actor.team==='ENEMY'?engine.allies:engine.enemies).find(a=>engine.isAlive(a))||actor;
  const fx=new GeneralJokLiveFX(engine,actor,[],assets,m,makePlan({mode:'ready'})),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  engine.generalJokStates.set(actor,state);startAmbient(state);
  return state;
 })().finally(()=>engine.generalJokLoads.delete(actor));engine.generalJokLoads.set(actor,pending);return pending;
}
export function warmGeneralJokActor(engine,actor){
 const epoch=engine.mercenaryEpoch;
 void setupGeneralJokActor(engine,actor).catch(error=>{
  if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[GeneralJok Requiem] 효과 준비 지연; 기본 전투를 유지합니다.',error);
 });
}
export function resumeGeneralJokPlayback(engine){for(const s of engine.generalJokStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelGeneralJokPlayback(engine){for(const s of engine.generalJokStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearGeneralJokActors(engine){for(const s of engine.generalJokStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.generalJokStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupGeneralJokActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 if(mode==='basic')mode=GENERAL_JOK_BASIC_FORMS[s.basicCount++%GENERAL_JOK_BASIC_FORMS.length].visualMode;
 s.fx.begin(mode,targets);
 const plan=s.fx.plan,duration=plan.duration,contact=plan.contacts.at(-1),clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},
 engine.reducedMotion?8:GENERAL_JOK_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:GENERAL_JOK_CODE,eventType:plan.area?GENERAL_JOK_AREA_EVENT:'ATTACK',mode,
  clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,contactSeconds:contact,
  durationSeconds:duration,playbackRate:GENERAL_JOK_PLAYBACK_RATE,cameraZoom:false};
 return result&&valid();
}
export function playGeneralJokBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 // Never await cold optional FX inside a server event. The normal V3 strike
 // retains the exact HP/shield receipt while the approved atlases warm up.
 if(!engine.generalJokStates?.has(actor))return fallback();
 return playback(engine,actor,[target],'basic',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playGeneralJokArea(engine,event){
 const actor=engine.combatantById(event.actorId),skill=GENERAL_JOK_AREA_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==GENERAL_JOK_CODE||event.type!==GENERAL_JOK_AREA_EVENT||event.battleMode!=='PVE'||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 const apply=()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }};
 // A delayed/failed image request must not suppress authoritative area damage.
 if(!engine.generalJokStates?.has(actor)){apply();return true;}
 return playback(engine,actor,rows.map(r=>r.target),skill.visualMode,apply);
}
