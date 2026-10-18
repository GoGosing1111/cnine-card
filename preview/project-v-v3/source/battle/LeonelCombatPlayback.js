import {gsap} from 'gsap';
import {LEONEL_CODE,LEONEL_ART,LEONEL_AREA_EVENT,LEONEL_COMBAT} from '../../../../shared/mercenary-leonel-v1.mjs';
import {LeonelFX,loadLeonelAssets} from '../../../mercenary-leonel-sss-limited-20261018-v2/source/LeonelFX.js';
import {MODES} from '../../../mercenary-leonel-sss-limited-20261018-v2/motion.mjs';
import {JinmuDialogue} from './JinmuDialogue.js';
import {MERCENARY_DIALOGUE_PROFILES} from './MercenaryDialogueProfiles.js';

const BODY_HEIGHT=333,MANIFEST='/preview/mercenary-leonel-sss-limited-20261018-v2/manifest.json?leonel=20261018-live-v1';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(MANIFEST).then(r=>{if(!r.ok)throw Error('LEONEL_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function leonelBattleArt(code){
 if(code!==LEONEL_CODE)return null;
 return {...LEONEL_ART,spriteUrl:'/'+LEONEL_ART.battleSprite+'?v='+LEONEL_ART.battleSpriteSha256.slice(0,16),
  footAnchor:{x:751/1280,y:949/1280},fullBodyHeight:1280*BODY_HEIGHT/610,bodyHeight:BODY_HEIGHT,originalTextureHeight:1280*BODY_HEIGHT/610};
}
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects,assets.cinematics])for(const frames of Object.values(group))for(const t of frames)t.destroy(false);};

// Live contacts and cancellation belong to V3. The preview's camera, recoil,
// independent clock and HUD changes must not leak into a concurrent battlefield.
class LeonelLiveFX extends LeonelFX{
 constructor(engine,actor,targets,assets,m){
  const hudVisible=actor.hud.visible,visualEngine=Object.assign(Object.create(engine),{camera:{reset(){}}});
  super(visualEngine,actor,targets,assets,m,()=>{},{zoom:false});
  actor.hud.visible=hudVisible;
  this.dialogue=new JinmuDialogue(engine,MERCENARY_DIALOGUE_PROFILES[LEONEL_CODE]);
  this.cancel();
 }
 makeTimeline(){}
 get direction(){return this.merc.team==='ENEMY'?-1:1;}
 targetPoint(actor=this.target,fraction=.64){return this.merc.root.parent.toLocal(actor.root.toGlobal({x:0,y:-(actor.art?.bodyHeight||actor.fullBodyHeight||300)*fraction}));}
 render(t){
  if(this.disposed||this.merc.root.destroyed)return;
  const before=this.targets.filter(a=>!a.root.destroyed).map(a=>({a,x:a.view.x,y:a.view.y}));
  super.render(t);
  for(const {a,x,y}of before)if(!a.root.destroyed)a.view.position.set(x,y);
 }
 begin(mode,targets){
  this.targets=targets;this.mode=mode;this.captureFormation();this.clock.time=0;
  if(['skill','ultimate'].includes(mode))this.dialogue.begin();
  this.render(0);
 }
 cancel(){
  if(this.disposed)return;
  this.removeTimeline();this.clock.time=0;this.mode='idle';
  this.pool.forEach(s=>s.visible=false);this.ghosts.forEach(s=>s.visible=false);
  this.shade.clear();this.screenLayer.visible=false;this.cinemaShade.clear();this.dialogue?.end();
  const a=this.merc;if(a.root.destroyed)return;
  a.restoreNeutralAvatarPose();this.applyPose({bank:'idle',index:0,facing:1});a.fullBodySprite.alpha=1;
  a.root.position.set(a.baseX,a.baseY);a.root.depthSortY=a.baseY;this.captureFormation();
  this.updateAmbient(0,{x:a.baseX,groundY:a.baseY});
  this.aura.visible=this.backgroundAura.visible=a.hp>0;
 }
 diagnostics(){return {...super.diagnostics(),liveEnabled:true,damageAuthority:'SERVER_ONLY',dialogue:this.dialogue?.diagnostics(),motionRate:LEONEL_COMBAT.motionPlaybackRate,effectRate:LEONEL_COMBAT.effectPlaybackRate};}
 destroy(){
  if(this.disposed)return;this.cancel();this.disposed=true;this.dialogue?.destroy();
  this.front.destroy({children:true});this.back.destroy({children:true});this.screenLayer.destroy({children:true});disposeAssets(this.assets);
 }
}
function stopAmbient(s){if(s.ambient){const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.disposed||s.actor.root.destroyed||s.actor.hp<=0)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){
  if(s.busy||s.stopped||s.actor.root.destroyed)return;
  // Do not reset another actor's hit recoil or the formation while idling.
  s.fx.updateAmbient(clock.time,{x:s.actor.root.x,groundY:s.actor.root.y});
  s.fx.aura.visible=s.fx.backgroundAura.visible=s.actor.hp>0&&s.actor.root.visible;
 }}).to(clock,{time:4,duration:4,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupLeonelActor(engine,actor){
 engine.leonelStates||=new Map();engine.leonelLoads||=new Map();
 if(engine.leonelStates.has(actor))return engine.leonelStates.get(actor);
 if(engine.leonelLoads.has(actor))return engine.leonelLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const m=await manifest(),assets=await loadLeonelAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new LeonelLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  engine.leonelStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.leonelLoads.delete(actor));engine.leonelLoads.set(actor,pending);return pending;
}
export function resumeLeonelPlayback(engine){for(const s of engine.leonelStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelLeonelPlayback(engine){for(const s of engine.leonelStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearLeonelActors(engine){for(const s of engine.leonelStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.leonelStates?.clear();}
async function playback(engine,actor,targets,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;const s=await setupLeonelActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 // A three-cut animation still consumes just one server basic receipt.
 if(mode==='basic')mode=++s.basicCount%3===0?'skill':'attack';
 s.fx.begin(mode,targets);
 const duration=MODES[mode].duration,contact=MODES[mode].contacts[0],clock={time:0};let applied=false;
 const targetIds=targets.map(t=>t.id),sameTargets=()=>targets.every((t,i)=>t.id===targetIds[i]);
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate(){if(valid()&&!s.stopped&&sameTargets()){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied&&sameTargets()){applied=true;apply();}},[],contact);
 },()=>{
  s.busy=false;s.fx.cancel();
  if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}
 },engine.reducedMotion?8:LEONEL_COMBAT.effectPlaybackRate,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:LEONEL_CODE,eventType:mode==='ultimate'?LEONEL_AREA_EVENT:'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,motionRate:2,effectRate:1,contactSeconds:contact,durationSeconds:duration};
 return result&&valid();
}
export function playLeonelBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'basic',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playLeonelArea(engine,event){
 const actor=engine.combatantById(event.actorId);if(actor?.cardId!==LEONEL_CODE||event.type!==LEONEL_AREA_EVENT||event.battleMode!=='PVE')return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 return playback(engine,actor,rows.map(r=>r.target),'ultimate',()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }});
}
