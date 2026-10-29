import {Assets,Container,Graphics,Sprite,Texture,Rectangle,Filter,GlProgram} from 'pixi.js';
import spec from './heukmu/spec.json' with {type:'json'};
import {HEUKMU_CODE,HEUKMU_ART,HEUKMU_BASIC_FORMS,HEUKMU_AREA_SKILLS,HEUKMU_AREA_EVENT,HEUKMU_PLAYBACK_RATE} from '../../../../shared/mercenary-heukmu-v1.mjs';
import {HeukmuFX,loadAssets,ROOT} from './heukmu/HeukmuFX.js';
import {plan} from './heukmu/skills.mjs';
const runtime={Assets,Container,Graphics,Sprite,Texture,Rectangle,Filter,GlProgram};
const disposeAssets=assets=>{for(const type of ['motion','effects','hands'])for(const bank of Object.values(assets[type]))for(const t of bank)t.destroy(false);assets.idleCoil.forEach(t=>t.destroy(false));};
export const heukmuBattleArt=code=>{
 if(code!==HEUKMU_CODE)return null;const f=spec.motion.idle.frames[0];
 return {...HEUKMU_ART,calmIdle:true,spriteUrl:ROOT+spec.motion.idle.file,footAnchor:{x:f.foot.x/f.width,y:f.foot.y/f.height},bodyHeight:spec.bodyHeight,fullBodyHeight:f.height*spec.bodyHeight/f.bodyPixels,originalTextureHeight:f.height};
};
export class HeukmuLiveFX extends HeukmuFX{
 captureFormation(){this.merc.applyFacing();super.captureFormation();}
 applyPose(p){super.applyPose(p);this.merc.applyFacing();}
 facing(){const a=this.merc.view.toGlobal({x:0,y:0}),b=this.merc.view.toGlobal({x:1,y:0});return b.x<a.x?-1:1;}
 draw(...args){const first=this.slot;super.draw(...args);if(this.facing()<0)for(let i=first;i<this.slot;i++){this.sprites[i].scale.x*=-1;this.sprites[i].rotation*=-1;}}
 hideEffects(){this.sprites?.forEach(s=>s.visible=false);this.area?.reset();for(const name of ['rear','coilFrontGroup','sword','handOverlay'])if(this[name])this[name].visible=false;}
 renderAura(t){if(this.destroyed||this.merc.root.destroyed||this.merc.hp<=0){this.hideEffects();return;}super.renderAura(t);}
 startAmbient(offset=this.auraTime||0){
  this.stopAmbient();if(this.destroyed||this.merc.root.destroyed||this.merc.hp<=0)return;this.renderAura(offset);
  if(this.engine.reducedMotion)return;
  const cycle=this.spec.idleCoil.cycleSeconds,clock={time:offset%cycle};
  this.ambientTimeline=this.timelineFactory({paused:true,repeat:-1,onUpdate:()=>this.renderAura(clock.time)}).to(clock,{time:clock.time+cycle,duration:cycle,ease:'none'});
  this.ambientRegistration={instance:this.ambientTimeline,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambientRegistration);
  if(this.engine.visible)this.ambientTimeline.play();else this.ambientRegistration.resumeOnVisible=true;
 }
 render(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0||this.targets.some(t=>t.root.destroyed)){this.hideEffects();return;}
  this.sword.visible=this.handOverlay.visible=true;this.reducedMotion=!!this.engine.reducedMotion;
  this.tints=this.targets.map(t=>t.fullBodySprite.tint);this.captureFormation();super.render(time);
  this.targets.forEach((t,i)=>{if(!t.root.destroyed)t.fullBodySprite.tint=this.tints[i];});
 }
 begin(mode,targets){
  this.removeTimeline();this.targets=targets;this.tints=targets.map(t=>t.fullBodySprite.tint);this.mode=mode;this.plan=structuredClone(plan(mode,targets.length));
  while(this.area.blades.length<targets.length*2){const s=new Sprite({texture:this.assets.sword});s.visible=false;this.area.front.addChild(s);this.area.blades.push(s);}
  this.clock.time=0;this.captureFormation();this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.hideEffects();if(this.merc.root.destroyed)return;
  this.merc.root.position.set(this.merc.baseX,this.merc.baseY);this.merc.root.depthSortY=this.merc.baseY;this.engine.sortCombatDepth();
  if(this.merc.hp<=0)return;this.targets=[];this.tints=[];this.mode='idle';this.plan=plan('idle',0);this.clock.time=0;
  this.merc.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0);
 }
 diagnostics(){return {...super.diagnostics(),code:HEUKMU_CODE,liveEnabled:true,visualOnly:false,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'SERVER_ONLY',playbackRate:HEUKMU_PLAYBACK_RATE,cameraZoom:false};}
}

export async function setupHeukmuActor(engine,actor){
 engine.heukmuStates||=new Map();engine.heukmuLoads||=new Map();if(actor.cardId!==HEUKMU_CODE)return null;
 if(engine.heukmuStates.has(actor))return engine.heukmuStates.get(actor);if(engine.heukmuLoads.has(actor))return engine.heukmuLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const assets=await loadAssets(spec,runtime),valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new HeukmuLiveFX(engine,actor,assets,spec,runtime),state={engine,actor,fx,busy:false,stopped:false,basicCount:0},setHp=actor.setHp;
  actor.setHp=function(value){const dead=this.hp<=0,result=setHp.call(this,value);if(this.hp<=0){fx.stopAmbient();fx.hideEffects();}else if(dead&&!state.busy&&!state.stopped&&!fx.destroyed){fx.cancel();fx.startAmbient();}return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};fx.cancel();fx.startAmbient();engine.heukmuStates.set(actor,state);return state;
 })().finally(()=>engine.heukmuLoads.delete(actor));engine.heukmuLoads.set(actor,pending);return pending;
}
export function warmHeukmuActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupHeukmuActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[Heukmu] 전투 효과 준비 지연',e);});}
export function resumeHeukmuPlayback(engine){for(const s of engine.heukmuStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();s.fx.startAmbient();}}
export function cancelHeukmuPlayback(engine){for(const s of engine.heukmuStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearHeukmuActors(engine){for(const s of engine.heukmuStates?.values()||[]){s.stopped=true;s.restoreHp?.();s.fx.destroy();}engine.heukmuStates?.clear();}
async function playback(engine,actor,rows,mode,{area=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!valid()||!rows.length)return false;const s=engine.heukmuStates?.get(actor);if(!s)return false;
 const targets=rows.map(r=>r.target);engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const p=s.fx.plan,clock={time:0},applied=new Set(),contacts=rows.map((_,i)=>p.hits.find(h=>h.target===i).at);
 const result=await engine.timeline(t=>{
  t.to(clock,{time:p.duration,duration:p.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  rows.forEach((row,i)=>t.call(()=>{if(valid()&&!s.stopped&&!applied.has(i)){applied.add(i);row.apply();}},[],contacts[i]));
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');s.fx.startAmbient();}},engine.reducedMotion?8:HEUKMU_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:HEUKMU_CODE,eventType:area?HEUKMU_AREA_EVENT:'ATTACK',mode,authoritative:true,damageApplications:applied.size,contactSeconds:contacts,durationSeconds:p.duration,playbackRate:HEUKMU_PLAYBACK_RATE,clockOwner:'V3_REGISTERED_GSAP',cameraZoom:false};
 return result&&valid();
}
export function playHeukmuBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;const s=engine.heukmuStates?.get(actor);if(!s){warmHeukmuActor(engine,actor);return fallback();}
 const mode=HEUKMU_BASIC_FORMS[s.basicCount++%HEUKMU_BASIC_FORMS.length].visualMode;
 return playback(engine,actor,[{target,apply(){if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});}}],mode);
}
export function playHeukmuArea(engine,event){
 const actor=engine.combatantById(event.actorId),skill=HEUKMU_AREA_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==HEUKMU_CODE||event.type!==HEUKMU_AREA_EVENT||event.battleMode!=='PVE'||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&r.target.team!==actor.team&&!r.target.root.destroyed).map(({hit,target})=>({target,apply(){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }}));
 if(!rows.length)return true;if(!engine.heukmuStates?.has(actor)){if(actor.hp>0)warmHeukmuActor(engine,actor);rows.forEach(r=>r.apply());return true;}
 return playback(engine,actor,rows,skill.visualMode,{area:true});
}
