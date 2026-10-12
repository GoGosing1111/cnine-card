import {gsap} from 'gsap';
import {JINMU_CODE,JINMU_ART,JINMU_AREA_EVENT,JINMU_COMBAT} from '../../../../shared/mercenary-jinmu-v1.mjs';
import {GoldenDragonFX,loadDragonAssets} from '../../../mercenary-golden-dragon-battle-v1/source/GoldenDragonFX.js';
import {makePlan,MODES,JINMU_ULTIMATE_PLAYBACK_RATE} from '../../../mercenary-golden-dragon-battle-v1/skill.mjs';
import {JinmuDialogue} from './JinmuDialogue.js';

const BODY_HEIGHT=285,MANIFEST='/preview/mercenary-golden-dragon-battle-v1/manifest.json?jinmu=20261012-live-v1';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(MANIFEST).then(r=>{if(!r.ok)throw Error('JINMU_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function jinmuBattleArt(code){
 if(code!==JINMU_CODE)return null;
 return {...JINMU_ART,spriteUrl:'/'+JINMU_ART.battleSprite+'?v='+JINMU_ART.battleSpriteSha256.slice(0,16),
  footAnchor:{x:.5,y:.859375},fullBodyHeight:768*BODY_HEIGHT/496,bodyHeight:BODY_HEIGHT,originalTextureHeight:768*BODY_HEIGHT/496};
}
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};

// The V3 timeline alone owns contacts, cancellation and time scaling.
// Authored effects may never reset the shared camera or concurrent target recoil.
class JinmuLiveFX extends GoldenDragonFX{
 constructor(engine,actor,targets,assets,m){
  const visualEngine=Object.assign(Object.create(engine),{camera:{reset(){},addShake(){}}});
  super(visualEngine,actor,targets,assets,m,{...makePlan({mode:'aura'}),damageAuthority:'SERVER_ONLY'});
  this.removeTimeline();this.cancel();
  this.dialogue=new JinmuDialogue(engine);
 }
 makeTimeline(){} // Never start the independent preview clock.
 get direction(){return this.merc.team==='ENEMY'?-1:1;}
 captureFormation(){this.merc.view.scale.x=this.direction*Math.abs(this.merc.view.scale.x||1);super.captureFormation();}
 applyPose(p){super.applyPose(p);this.merc.view.scale.x=this.direction*Math.abs(this.merc.view.scale.x||1);this.merc.fullBodySprite.alpha=1;}
 point(actor,fraction=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-(actor.art?.bodyHeight||actor.fullBodyHeight)*fraction}));}
 draw(texture,p,size,options={}){
  const s=super.draw(texture,p,size,options);
  if(s&&this.direction<0){s.scale.x=-Math.abs(s.scale.x);s.rotation=-s.rotation;}
  return s;
 }
 render(t){
  if(this.destroyed||this.merc.root.destroyed)return;
  const before=this.targets.filter(a=>!a.root.destroyed).map(a=>({a,x:a.view.x,y:a.view.y,tint:a.fullBodySprite.tint}));
  this.targetsBase=this.targets.map(a=>({x:a.view.x,tint:a.fullBodySprite.tint}));
  super.render(t);
  for(const {a,x,y,tint}of before)if(!a.root.destroyed){a.view.position.set(x,y);a.fullBodySprite.tint=tint;}
 }
 begin(mode,targets){
  this.targets=targets;this.plan={...makePlan({mode}),damageAuthority:'SERVER_ONLY'};
  if(mode==='ultimate')this.dialogue?.begin();
  this.captureFormation();this.clock.time=0;this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.audio.stop();this.removeTimeline();this.clock.time=0;
  this.pool?.forEach(s=>s.visible=false);this.ground?.clear();
  this.dialogue?.end();
  const a=this.merc;if(a.root.destroyed)return;
  this.plan={...makePlan({mode:'aura'}),damageAuthority:'SERVER_ONLY'};
  a.restoreNeutralAvatarPose();this.applyPose({key:'idle',frame:0});
  a.root.position.set(a.baseX,a.baseY);a.root.depthSortY=a.baseY;
  this.updateAura({time:0,auraBoost:0,done:false,cancelled:false});
  this.auraBack.visible=this.auraFront.visible=a.hp>0;
 }
 diagnostics(){return {...super.diagnostics(),damageAuthority:'SERVER_ONLY',dialogue:this.dialogue?.diagnostics(),auraAlphas:[...this.auraSprites,...this.dragonSprites].map(s=>s.alpha)};}
 destroy(){this.dialogue?.destroy();super.destroy();}
}
function stopAmbient(s){
 if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();
}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){
  if(s.busy||s.stopped||s.actor.root.destroyed)return;
  s.fx.clock.time=clock.time;
  // Only the aura changes during another combatant's attack/recoil.
  s.fx.updateAura({time:clock.time,auraBoost:0,done:false,cancelled:s.actor.hp<=0});
 }}).to(clock,{time:5.4,duration:5.4,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupJinmuActor(engine,actor){
 engine.jinmuStates||=new Map();engine.jinmuLoads||=new Map();
 if(engine.jinmuStates.has(actor))return engine.jinmuStates.get(actor);
 if(engine.jinmuLoads.has(actor))return engine.jinmuLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const m=await manifest(),assets=await loadDragonAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new JinmuLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  engine.jinmuStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.jinmuLoads.delete(actor));engine.jinmuLoads.set(actor,pending);return pending;
}
export function resumeJinmuPlayback(engine){for(const s of engine.jinmuStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelJinmuPlayback(engine){for(const s of engine.jinmuStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearJinmuActors(engine){for(const s of engine.jinmuStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.jinmuStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupJinmuActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 // Every third basic receipt uses the authored dragon skill. It is still one
 // server basic hit, with no extra roll, energy cost or attack-speed change.
 if(mode==='basic')mode=++s.basicCount%3===0?'skill':'attack';
 s.fx.begin(mode,targets);
 const ultimate=mode==='ultimate',duration=MODES[mode].duration,contact=MODES[mode].contacts[0],rate=ultimate?JINMU_ULTIMATE_PLAYBACK_RATE:JINMU_COMBAT.motionPlaybackRate,clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact/rate);
 // Finish the ultimate before advancing the receipt queue. Otherwise the next
 // attack settles its shared targets and erases the dragon immediately on impact.
 // Keep the readable sequence out of automatic battle pacing; reduced motion
 // still uses the user's shortened playback. Dialogue is outside the canvas.
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},ultimate?(engine.reducedMotion?8:1):null,{releaseAt:ultimate?null:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:JINMU_CODE,eventType:mode==='ultimate'?JINMU_AREA_EVENT:'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contact/rate,durationSeconds:duration/rate};
 return result&&valid();
}
export function playJinmuBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'basic',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playJinmuArea(engine,event){
 const actor=engine.combatantById(event.actorId);if(actor?.cardId!==JINMU_CODE||event.type!==JINMU_AREA_EVENT||event.battleMode!=='PVE')return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),'ultimate',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
