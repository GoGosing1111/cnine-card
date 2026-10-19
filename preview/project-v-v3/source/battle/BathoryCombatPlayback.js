import {gsap} from 'gsap';
import {BATHORY_CODE,BATHORY_ART,BATHORY_RESOURCE_ROOT} from '../../../../shared/mercenary-bathory-v1.mjs';
import {BathoryFX,loadBathoryAssets} from '../../../mercenary-bathory-halloween-20261019-v1/source/BathoryFX.js';
import {MODES} from '../../../mercenary-bathory-halloween-20261019-v1/motion.mjs';

let manifestPromise;
const manifest=()=>manifestPromise||=fetch('/'+BATHORY_RESOURCE_ROOT+'manifest.json?v=bathory-20261019-v1').then(r=>{if(!r.ok)throw Error('BATHORY_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
export function bathoryBattleArt(code){
 if(code!==BATHORY_CODE)return null;
 return {...BATHORY_ART,spriteUrl:'/'+BATHORY_ART.battleSprite+'?v=fd33330b76a8381e',footAnchor:{x:.42265625,y:.7325520833333332},fullBodyHeight:768*333/360,bodyHeight:333,originalTextureHeight:768*333/360};
}
const disposeAssets=assets=>{for(const bank of [...Object.values(assets.motion),...Object.values(assets.effects)])for(const texture of bank)texture.destroy(false);};
// V3 owns timing, camera, target recoil and authoritative HP. The standalone
// resource viewer uses the same poses without bringing its UI into battles.
class BathoryLiveFX extends BathoryFX{
 constructor(engine,actor,targets,assets,m){
  const hudVisible=actor.hud.visible;
  super(engine,actor,targets,assets,m,()=>{},{zoom:false,externalClock:true});
  actor.hud.visible=hudVisible;this.cancel();
 }
 makeTimeline(){}
 render(t){
  if(this.disposed||this.merc.root.destroyed)return;
  const before=this.targets.filter(a=>!a.root.destroyed).map(a=>({a,x:a.view.x,y:a.view.y}));
  super.render(t);
  for(const {a,x,y}of before)if(!a.root.destroyed)a.view.position.set(x,y);
 }
 updateIdle(time){
  if(this.disposed||this.merc.root.destroyed||this.merc.hp<=0)return;
  const f=this.manifest.motion.idle.frames[Math.floor(time%2.8/1.4)],s=this.merc.fullBodySprite;
  s.texture=this.assets.motion.idle[f.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(this.bodyHeight/360);
  // Do not reset view/root here: another actor may currently be hitting us.
 }
 begin(mode,targets){this.targets=targets;this.mode=mode;this.captureFormation();this.clock.time=0;this.render(0);}
 cancel(){
  if(this.disposed)return;this.removeTimeline();this.clock.time=0;this.mode='idle';
  this.pool.forEach(s=>s.visible=false);this.ghosts.forEach(s=>s.visible=false);
  const a=this.merc;if(a.root.destroyed)return;
  a.restoreNeutralAvatarPose();this.applyPose({bank:'idle',index:0});a.fullBodySprite.alpha=1;
  a.root.position.set(a.baseX,a.baseY);a.root.depthSortY=a.baseY;this.captureFormation();
 }
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.front.destroy({children:true});this.back.destroy({children:true});disposeAssets(this.assets);}
}
function stopAmbient(s){if(s.ambient){const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.disposed||s.actor.root.destroyed||s.actor.hp<=0)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){if(!s.busy&&!s.stopped)s.fx.updateIdle(clock.time);}}).to(clock,{time:2.8,duration:2.8,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupBathoryActor(engine,actor){
 engine.bathoryStates||=new Map();engine.bathoryLoads||=new Map();
 if(engine.bathoryStates.has(actor))return engine.bathoryStates.get(actor);
 if(engine.bathoryLoads.has(actor))return engine.bathoryLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const m=await manifest(),assets=await loadBathoryAssets(m);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){disposeAssets(assets);return null;}
  const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
  const fx=new BathoryLiveFX(engine,actor,[target],assets,m),state={engine,actor,fx,busy:false,stopped:false};
  engine.bathoryStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.bathoryLoads.delete(actor));engine.bathoryLoads.set(actor,pending);return pending;
}
export function resumeBathoryPlayback(engine){for(const s of engine.bathoryStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelBathoryPlayback(engine){for(const s of engine.bathoryStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearBathoryActors(engine){for(const s of engine.bathoryStates?.values()||[]){stopAmbient(s);s.fx.destroy();}engine.bathoryStates?.clear();}
async function playback(engine,actor,target,mode,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&!target.root.destroyed;
 if(!valid())return false;const s=await setupBathoryActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,target]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,[target]);
 const duration=MODES[mode].duration,contact=MODES[mode].contacts.at(-1),clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate(){if(valid()&&!s.stopped){s.fx.clock.time=clock.time;s.fx.render(clock.time);}}});
  // Two authored slashes are one server hit. Reveal the receipt at the finisher.
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},engine.reducedMotion?8:1,{owners:[actor,target]});
 engine.lastMercenaryPlayback={code:BATHORY_CODE,eventType:mode==='skill'?'MERCENARY_HIT':'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:Number(applied),contactSeconds:contact,durationSeconds:duration};
 return result&&valid();
}
export function playBathoryBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,target,'attack',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playBathorySkill(engine,event){
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);
 if(actor?.cardId!==BATHORY_CODE||event.type!=='MERCENARY_HIT'||!target||target.root.destroyed)return true;
 return playback(engine,actor,target,'skill',()=>{
  if(Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter,event.targetMaxHp));
  if(Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);
  if(event.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(event.damage||0)+(event.absorbed||0)});
 });
}
