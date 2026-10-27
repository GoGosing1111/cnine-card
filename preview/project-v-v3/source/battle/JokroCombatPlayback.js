import {gsap} from 'gsap';
import {JOKRO_CODE,JOKRO_ART,JOKRO_AREA_EVENT,JOKRO_COMBAT} from '../../../../shared/mercenary-jokro-v1.mjs';
import {JokroFX,loadJokroAssets} from '../../../mercenary-jokro-iaido-20261017-v1/source/JokroFX.js';
import {makePlan,MODES} from '../../../mercenary-jokro-iaido-20261017-v1/skill.mjs';
import {JinmuDialogue} from './JinmuDialogue.js';
import {MERCENARY_DIALOGUE_PROFILES} from './MercenaryDialogueProfiles.js';
import jokroMotionManifest from '../../../mercenary-jokro-iaido-20261017-v1/manifest.json' with {type:'json'};

const BODY_HEIGHT=285;
export function jokroBattleArt(code){
 if(code!==JOKRO_CODE)return null;
 return {...JOKRO_ART,spriteUrl:'/'+JOKRO_ART.battleSprite+'?v='+JOKRO_ART.battleSpriteSha256.slice(0,16),
  footAnchor:{x:.4,y:.89},fullBodyHeight:1024*BODY_HEIGHT/609,bodyHeight:BODY_HEIGHT,originalTextureHeight:1024*BODY_HEIGHT/609};
}
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};

// The V3 timeline alone owns contacts, cancellation and time scaling.
// Authored effects may never reset the shared camera or concurrent target recoil.
class JokroLiveFX extends JokroFX{
 constructor(engine,actor,targets,assets,m){
  const visualEngine=Object.assign(Object.create(engine),{camera:{reset(){},addShake(){}}});
  super(visualEngine,actor,targets,assets,m,{...makePlan({mode:'aura'}),damageAuthority:'SERVER_ONLY'});
  this.removeTimeline();this.cancel();
  this.dialogue=new JinmuDialogue(engine,MERCENARY_DIALOGUE_PROFILES[JOKRO_CODE]);
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
  if(['skill','awakening'].includes(mode))this.dialogue?.begin();
  this.captureFormation();this.clock.time=0;this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.audio.stop();this.removeTimeline();this.clock.time=0;
  this.pool?.forEach(s=>s.visible=false);this.ground?.clear();
  this.awakening?.release();if(this.awakening){this.awakening.layer.visible=false;this.awakening.splitVisible=false;}
  this.dialogue?.end();
  const a=this.merc;if(a.root.destroyed)return;
  this.plan={...makePlan({mode:'aura'}),damageAuthority:'SERVER_ONLY'};
  a.restoreNeutralAvatarPose();this.applyPose({key:'idle',frame:0});
  a.root.position.set(a.baseX,a.baseY);a.root.depthSortY=a.baseY;
  this.updateAura({time:0,auraBoost:0,done:false,cancelled:false});
  this.auraBack.visible=this.auraFront.visible=a.hp>0;
 }
 diagnostics(){return {...super.diagnostics(),damageAuthority:'SERVER_ONLY',dialogue:this.dialogue?.diagnostics(),motionRate:2,effectRate:1,neonEnabled:this.neonRim.enabled,auraAlphas:[...this.auraSprites,...this.dragonSprites].map(s=>s.alpha)};}
 destroy(){this.dialogue?.destroy();super.destroy();}
}
function stopAmbient(s){
 if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();
}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){
  if(s.busy||s.stopped||s.actor.root.destroyed)return;
  s.fx.clock.time=clock.time;s.fx.neonRim.strength=s.fx.reducedMotion?1:.93+Math.sin(clock.time*2.1)*.07;
  // Only the aura changes during another combatant's attack/recoil.
  s.fx.updateAura({time:clock.time,auraBoost:0,done:false,cancelled:s.actor.hp<=0});
 }}).to(clock,{time:5.4,duration:5.4,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupJokroActor(engine,actor){
 engine.jokroStates||=new Map();engine.jokroLoads||=new Map();
 if(engine.jokroStates.has(actor))return engine.jokroStates.get(actor);
 if(engine.jokroLoads.has(actor))return engine.jokroLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  // Ship the approved metadata with the engine. A separate manifest request
  // must not abort ranked entry when the already shipped images are available.
  const m=jokroMotionManifest,assets=await loadJokroAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new JokroLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  engine.jokroStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.jokroLoads.delete(actor));engine.jokroLoads.set(actor,pending);return pending;
}
export function resumeJokroPlayback(engine){for(const s of engine.jokroStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelJokroPlayback(engine){for(const s of engine.jokroStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearJokroActors(engine){for(const s of engine.jokroStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.jokroStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupJokroActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 // Every third basic receipt uses the authored dragon skill. It is still one
 // server basic hit, with no extra roll, energy cost or attack-speed change.
 if(mode==='basic')mode=++s.basicCount%3===0?'skill':'attack';
 s.fx.begin(mode,targets);
 const ultimate=mode==='awakening',fullEffect=ultimate||mode==='skill',duration=MODES[mode].duration,contact=MODES[mode].contacts[0],rate=JOKRO_COMBAT.effectPlaybackRate,clock={time:0};let applied=false;
 // The shared field can advance a defeated wave after 340ms. Compress only
 // the opening draw/burst here; keep the authored aftermath at its normal rate.
 // Ordinary PVE retains the complete 5.6s sequence and original contact time.
 const cooperativeDraw=ultimate&&engine.formationCoop,contactAt=cooperativeDraw ? .20 : contact/rate;
 const targetIds=targets.map(t=>t.id),sameTargets=()=>targets.every((t,i)=>t.id===targetIds[i]);
 const result=await engine.timeline(t=>{
  const update=()=>{if(valid()&&!s.stopped&&sameTargets()){s.fx.clock.time=clock.time;s.fx.render(clock.time);}};
  if(cooperativeDraw){
   t.to(clock,{time:1.92,duration:.08,ease:'none',onUpdate:update});
   t.to(clock,{time:contact,duration:.12,ease:'none',onUpdate:update});
   t.to(clock,{time:2.72,duration:.12,ease:'none',onUpdate:update});
   t.to(clock,{time:duration,duration:duration-2.72,ease:'none',onUpdate:update});
  }else t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate:update});
  t.call(()=>{if(valid()&&!s.stopped&&!applied&&sameTargets()){applied=true;apply();}},[],contactAt);
 // Finish the ultimate before advancing the receipt queue. Otherwise the next
 // attack settles its shared targets and erases the dragon immediately on impact.
 // Keep the readable sequence out of automatic battle pacing; reduced motion
 // still uses the user's shortened playback. Dialogue is outside the canvas.
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},fullEffect?(engine.reducedMotion?8:1):null,{releaseAt:fullEffect?null:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:JOKRO_CODE,eventType:mode==='awakening'?JOKRO_AREA_EVENT:'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contactAt,durationSeconds:cooperativeDraw ? .32+duration-2.72 : duration/rate,cooperativeDraw};
 return result&&valid();
}
export function playJokroBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'basic',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playJokroArea(engine,event){
 const actor=engine.combatantById(event.actorId);if(actor?.cardId!==JOKRO_CODE||event.type!==JOKRO_AREA_EVENT||event.battleMode!=='PVE')return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),'awakening',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
