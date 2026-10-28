import {Assets,Container,Graphics,Sprite,Texture,Rectangle,Filter,GlProgram} from 'pixi.js';
import spec from './kamishiro/spec.json' with {type:'json'};
import {KAMISHIRO_CODE,KAMISHIRO_ART,KAMISHIRO_BASIC_FORMS,KAMISHIRO_AREA_SKILLS,KAMISHIRO_AREA_EVENT,KAMISHIRO_PLAYBACK_RATE} from '../../../../shared/mercenary-kamishiro-v1.mjs';
import {DoppelgangerFX,loadAssets,ROOT} from './kamishiro/DoppelgangerFX.js';
import {plan} from './kamishiro/skills.mjs';
const runtime={Assets,Container,Graphics,Sprite,Texture,Rectangle,Filter,GlProgram};
const disposeAssets=assets=>{for(const type of ['motion','effects'])for(const bank of Object.values(assets[type]))for(const t of bank)t.destroy(false);};
export const kamishiroBattleArt=code=>{
 if(code!==KAMISHIRO_CODE)return null;const f=spec.motion.idle.frames[0];
 return {...KAMISHIRO_ART,calmIdle:true,spriteUrl:ROOT+spec.motion.idle.file,footAnchor:{x:f.foot.x/f.width,y:f.foot.y/f.height},bodyHeight:spec.bodyHeight,fullBodyHeight:f.height*spec.bodyHeight/f.bodyPixels,originalTextureHeight:f.height};
};
class KamishiroLiveFX extends DoppelgangerFX{
 captureFormation(){this.merc.applyFacing();super.captureFormation();}
 applyPose(p){super.applyPose(p);this.merc.applyFacing();}
 facing(){const a=this.merc.view.toGlobal({x:0,y:0}),b=this.merc.view.toGlobal({x:1,y:0});return b.x<a.x?-1:1;}
 draw(...args){const first=this.slot;super.draw(...args);if(this.facing()<0)for(let i=first;i<this.slot;i++){this.sprites[i].scale.x*=-1;this.sprites[i].rotation*=-1;}}
 moveToStrike(t){
  const travel=this.plan.travel;if(!travel)return;
  const root=this.merc.root,parent=root.parent,sprite=this.targets[travel.target].fullBodySprite,b=sprite.getLocalBounds();
  const foot=parent.toLocal(sprite.toGlobal({x:b.x+b.width*.5,y:b.y+b.height})),own=parent.toLocal(this.merc.view.toGlobal({x:0,y:0})),head=parent.toLocal(this.merc.view.toGlobal({x:0,y:-this.bodyHeight}));
  const unit=Math.hypot(head.x-own.x,head.y-own.y),direction=this.facing(),destination={x:foot.x-direction*unit*(travel.standoff??.72),y:foot.y};
  const smooth=x=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u)};let progress=0;
  if(t>=travel.depart&&t<travel.arrive)progress=smooth((t-travel.depart)/(travel.arrive-travel.depart));
  else if(t>=travel.arrive&&t<=travel.leave)progress=1;
  else if(t>travel.leave&&t<travel.home)progress=1-smooth((t-travel.leave)/(travel.home-travel.leave));
  root.position.set(this.start.x+(destination.x-this.start.x)*progress,this.start.y+(destination.y-this.start.y)*progress);
  this.travelState={target:travel.target,progress,home:{...this.start},destination,position:{x:root.x,y:root.y}};
 }
 renderSwordFlurry(t,unit,points){super.renderSwordFlurry(t,unit,points);if(this.facing()<0)for(const s of this.swordTraces){if(s.visible){s.scale.x=-Math.abs(s.scale.x);s.rotation*=-1;}}}
 hideEffects(){this.sprites?.forEach(s=>s.visible=false);this.swordTraces?.forEach(s=>s.visible=false);this.auraRear?.forEach(s=>s.visible=false);if(this.floorSeal)this.floorSeal.visible=false;if(this.weaponContainer)this.weaponContainer.visible=false;if(this.gripOverlay)this.gripOverlay.visible=false;}
 renderAura(t){if(this.destroyed||this.merc.root.destroyed||this.merc.hp<=0){this.hideEffects();return;}super.renderAura(t);}
 stopAmbient(){if(this.ambientRegistration)this.engine.simpleTimelines.delete(this.ambientRegistration);this.ambientTimeline?.kill();this.ambientTimeline=null;this.ambientRegistration=null;}
 startAmbient(offset=this.ambientClock?.time||0){
  this.stopAmbient();if(this.destroyed||this.merc.root.destroyed||this.merc.hp<=0)return;
  this.ambientClock={time:offset};this.ambientTimeline=this.timelineFactory({paused:true,repeat:-1,onUpdate:()=>this.renderAura(this.ambientClock.time)}).fromTo(this.ambientClock,{time:offset},{time:offset+4,duration:4,ease:'none',immediateRender:false}).timeScale(KAMISHIRO_PLAYBACK_RATE);
  this.ambientRegistration={instance:this.ambientTimeline,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambientRegistration);
  if(this.engine.visible)this.ambientTimeline.play();else this.ambientRegistration.resumeOnVisible=true;
 }
 removeTimeline(){this.stopAmbient();super.removeTimeline();}
 render(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0||this.targets.some(t=>t.root.destroyed)){this.hideEffects();return;}
  this.weaponContainer.visible=true;this.gripOverlay.visible=true;this.reducedMotion=!!this.engine.reducedMotion;
  this.tints=this.targets.map(t=>t.fullBodySprite.tint);this.captureFormation();super.render(time);
  this.targets.forEach((t,i)=>{if(!t.root.destroyed)t.fullBodySprite.tint=this.tints[i];});
 }
 begin(mode,targets){
  this.removeTimeline();this.targets=targets;this.tints=targets.map(t=>t.fullBodySprite.tint);this.mode=mode;this.plan=structuredClone(plan(mode));
  if(this.plan.hits.length===1){this.plan.hits[0].target=0;this.plan.travel.target=0;}
  else {
   const first=this.plan.hits[0].at,last=this.plan.hits.at(-1).at;
   const origin=this.merc.root.getGlobalPosition(),nearest=targets.reduce((best,t,i)=>{const p=t.root.getGlobalPosition(),q=targets[best].root.getGlobalPosition();return Math.hypot(p.x-origin.x,p.y-origin.y)<Math.hypot(q.x-origin.x,q.y-origin.y)?i:best;},0);
   const order=this.plan.travel?[nearest,...targets.map((_,i)=>i).filter(i=>i!==nearest)]:targets.map((_,i)=>i);
   if(this.plan.travel)this.plan.travel.target=nearest;
   this.plan.hits=order.map((target,i)=>({target,at:first+(last-first)*i/Math.max(1,targets.length-1)}));
  }
  while(this.swordTraces.length<targets.length){const s=new Sprite(this.assets.weapon);s.anchor.set(spec.weapon.grip.x/spec.weapon.width,(spec.weapon.grip.y+spec.weapon.tip.y)*.5/spec.weapon.height);s.visible=false;this.layer.addChild(s);this.swordTraces.push(s);}
  this.clock.time=0;this.captureFormation();this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.hideEffects();if(this.merc.root.destroyed)return;
  this.merc.root.position.set(this.merc.baseX,this.merc.baseY);this.merc.root.depthSortY=this.merc.baseY;this.engine.sortCombatDepth();
  if(this.merc.hp<=0)return;this.targets=[];this.tints=[];this.mode='idle';this.plan=plan('idle');this.clock.time=0;
  this.merc.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0);
 }
 diagnostics(){return {...super.diagnostics(),code:KAMISHIRO_CODE,liveEnabled:true,visualOnly:false,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'SERVER_ONLY',playbackRate:KAMISHIRO_PLAYBACK_RATE,cameraZoom:false};}
}
export async function setupKamishiroActor(engine,actor){
 engine.kamishiroStates||=new Map();engine.kamishiroLoads||=new Map();if(actor.cardId!==KAMISHIRO_CODE)return null;
 if(engine.kamishiroStates.has(actor))return engine.kamishiroStates.get(actor);if(engine.kamishiroLoads.has(actor))return engine.kamishiroLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const assets=await loadAssets(spec,runtime),valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new KamishiroLiveFX(engine,actor,assets,spec,runtime),state={engine,actor,fx,busy:false,stopped:false,basicCount:0},setHp=actor.setHp;
  actor.setHp=function(value){const dead=this.hp<=0,result=setHp.call(this,value);if(this.hp<=0){fx.stopAmbient();fx.hideEffects();}else if(dead&&!state.busy&&!state.stopped&&!fx.destroyed){fx.cancel();fx.startAmbient();}return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};fx.cancel();fx.startAmbient();engine.kamishiroStates.set(actor,state);return state;
 })().finally(()=>engine.kamishiroLoads.delete(actor));engine.kamishiroLoads.set(actor,pending);return pending;
}
export function warmKamishiroActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupKamishiroActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[Kamishiro] 전투 효과 준비 지연',e);});}
export function resumeKamishiroPlayback(engine){for(const s of engine.kamishiroStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();s.fx.startAmbient();}}
export function cancelKamishiroPlayback(engine){for(const s of engine.kamishiroStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearKamishiroActors(engine){for(const s of engine.kamishiroStates?.values()||[]){s.stopped=true;s.restoreHp?.();s.fx.destroy();}engine.kamishiroStates?.clear();}
async function playback(engine,actor,rows,mode,{area=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!valid()||!rows.length)return false;const s=engine.kamishiroStates?.get(actor);if(!s)return false;
 const targets=rows.map(r=>r.target);engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const p=s.fx.plan,clock={time:0},applied=new Set(),contacts=rows.map((_,i)=>p.hits.find(h=>h.target===i).at);
 const result=await engine.timeline(t=>{
  t.to(clock,{time:p.duration,duration:p.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  rows.forEach((row,i)=>t.call(()=>{if(valid()&&!s.stopped&&!applied.has(i)){applied.add(i);row.apply();}},[],contacts[i]));
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');s.fx.startAmbient();}},engine.reducedMotion?8:KAMISHIRO_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:KAMISHIRO_CODE,eventType:area?KAMISHIRO_AREA_EVENT:'ATTACK',mode,authoritative:true,damageApplications:applied.size,contactSeconds:contacts,durationSeconds:p.duration,playbackRate:KAMISHIRO_PLAYBACK_RATE,clockOwner:'V3_REGISTERED_GSAP',cameraZoom:false};
 return result&&valid();
}
export function playKamishiroBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;const s=engine.kamishiroStates?.get(actor);if(!s){warmKamishiroActor(engine,actor);return fallback();}
 const mode=KAMISHIRO_BASIC_FORMS[s.basicCount++%KAMISHIRO_BASIC_FORMS.length].visualMode;
 return playback(engine,actor,[{target,apply(){if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});}}],mode);
}
export function playKamishiroArea(engine,event){
 const actor=engine.combatantById(event.actorId),skill=KAMISHIRO_AREA_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==KAMISHIRO_CODE||event.type!==KAMISHIRO_AREA_EVENT||event.battleMode!=='PVE'||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&r.target.team!==actor.team&&!r.target.root.destroyed).map(({hit,target})=>({target,apply(){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }}));
 if(!rows.length)return true;if(!engine.kamishiroStates?.has(actor)){if(actor.hp>0)warmKamishiroActor(engine,actor);rows.forEach(r=>r.apply());return true;}
 return playback(engine,actor,rows,skill.visualMode,{area:true});
}
