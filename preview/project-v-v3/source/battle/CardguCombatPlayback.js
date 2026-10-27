import {Assets,Container,Graphics,Sprite,Texture,Rectangle,Filter,GlProgram} from 'pixi.js';
import manifest from './cardgu/manifest.json' with {type:'json'};
import {CARDGU_CODE,CARDGU_ART,CARDGU_BASIC_FORMS,CARDGU_AREA_SKILLS,CARDGU_AREA_EVENT,CARDGU_PLAYBACK_RATE} from '../../../../shared/mercenary-cardgu-v1.mjs';
import {CardguFX,loadAssets,ROOT} from './cardgu/CardguFX.js';
import {plan} from './cardgu/skills.mjs';
const runtime={Assets,Container,Graphics,Sprite,Texture,Rectangle,Filter,GlProgram},spec=manifest.character;
const disposeAssets=assets=>{for(const t of [...Object.values(assets.motion).flat(),...Object.values(assets.effects).flat(),...assets.particles])t.destroy(false);};
export const cardguBattleArt=code=>{
 if(code!==CARDGU_CODE)return null;const f=spec.motion.idle.frames[0];
 return {...CARDGU_ART,calmIdle:true,spriteUrl:ROOT+spec.motion.idle.file,footAnchor:{x:f.foot.x/f.width,y:f.foot.y/f.height},
  bodyHeight:spec.bodyHeight,fullBodyHeight:f.height*spec.bodyHeight/f.bodyPixels,originalTextureHeight:f.height};
};
class CardguLiveFX extends CardguFX{
 captureFormation(){this.merc.applyFacing();super.captureFormation();}
 applyPose(p){super.applyPose(p);this.merc.applyFacing();}
 hideEffects(){this.sprites?.forEach(s=>s.visible=false);if(this.aura){this.aura.rear.visible=false;this.aura.front.visible=false;this.aura.neon.enabled=false;}}
 renderAura(t){if(this.destroyed||this.merc.root.destroyed||this.merc.hp<=0){this.hideEffects();return;}super.renderAura(t);}
 startAmbient(offset=this.aura.time){
  if(this.destroyed||this.merc.root.destroyed||this.merc.hp<=0)return;
  super.startAmbient(offset);if(!this.engine.visible){this.ambientRegistration.resumeOnVisible=true;this.ambientTimeline.pause();}
 }
 render(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0||this.targets.some(t=>t.root.destroyed)){this.hideEffects();return;}
  this.reducedMotion=!!this.engine.reducedMotion;this.tints=this.targets.map(t=>t.fullBodySprite.tint);this.captureFormation();super.render(time);
  this.targets.forEach((t,i)=>{if(!t.root.destroyed)t.fullBodySprite.tint=this.tints[i];});
 }
 begin(mode,targets){
  this.auraOffset=this.aura.time||0;this.removeTimeline();this.targets=targets;this.tints=targets.map(t=>t.fullBodySprite.tint);
  this.mode=mode;this.plan=structuredClone(plan(mode));
  if(this.plan.hits.length===1)this.plan.hits[0].target=0;
  else {const first=this.plan.hits[0].at,last=this.plan.hits.at(-1).at;this.plan.hits=targets.map((_,target)=>({target,at:first+(last-first)*target/Math.max(1,targets.length-1)}));}
  this.clock.time=0;this.captureFormation();this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.hideEffects();
  if(this.merc.root.destroyed||this.merc.hp<=0)return;
  this.targets=[];this.tints=[];this.mode='idle';this.plan=plan('idle');this.clock.time=0;
  this.merc.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0);
 }
 diagnostics(){return {...super.diagnostics(),code:CARDGU_CODE,liveEnabled:true,visualOnly:false,
  clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'SERVER_ONLY',playbackRate:CARDGU_PLAYBACK_RATE,cameraZoom:false};}
}
export async function setupCardguActor(engine,actor){
 engine.cardguStates||=new Map();engine.cardguLoads||=new Map();
 if(actor.cardId!==CARDGU_CODE)return null;
 if(engine.cardguStates.has(actor))return engine.cardguStates.get(actor);
 if(engine.cardguLoads.has(actor))return engine.cardguLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const assets=await loadAssets(spec,runtime),valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new CardguLiveFX(engine,actor,assets,spec,runtime),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  const setHp=actor.setHp;
  actor.setHp=function(value){const dead=this.hp<=0,result=setHp.call(this,value);if(this.hp<=0){fx.stopAmbient();fx.hideEffects();}else if(dead&&!state.busy&&!state.stopped&&!fx.destroyed){fx.cancel();fx.startAmbient();}return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};fx.cancel();fx.startAmbient();engine.cardguStates.set(actor,state);return state;
 })().finally(()=>engine.cardguLoads.delete(actor));engine.cardguLoads.set(actor,pending);return pending;
}
export function warmCardguActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupCardguActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[Cardgu] 전투 효과 준비 지연',e);});}
export function resumeCardguPlayback(engine){for(const s of engine.cardguStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();s.fx.startAmbient();}}
export function cancelCardguPlayback(engine){for(const s of engine.cardguStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearCardguActors(engine){for(const s of engine.cardguStates?.values()||[]){s.stopped=true;s.restoreHp?.();s.fx.destroy();}engine.cardguStates?.clear();}
async function playback(engine,actor,rows,mode,{area=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!valid()||!rows.length)return false;const s=engine.cardguStates?.get(actor);if(!s)return false;
 const targets=rows.map(r=>r.target);engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const p=s.fx.plan,clock={time:0},applied=new Set(),contacts=rows.map((_,i)=>p.hits.find(h=>h.target===i).at);
 const result=await engine.timeline(t=>{
  t.to(clock,{time:p.duration,duration:p.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  rows.forEach((row,i)=>t.call(()=>{if(valid()&&!s.stopped&&!applied.has(i)){applied.add(i);row.apply();}},[],contacts[i]));
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');s.fx.startAmbient();}},
 engine.reducedMotion?8:CARDGU_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:CARDGU_CODE,eventType:area?CARDGU_AREA_EVENT:'ATTACK',mode,authoritative:true,damageApplications:applied.size,
  contactSeconds:contacts,durationSeconds:p.duration,playbackRate:CARDGU_PLAYBACK_RATE,clockOwner:'V3_REGISTERED_GSAP',cameraZoom:false};
 return result&&valid();
}
export function playCardguBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 const s=engine.cardguStates?.get(actor);if(!s){warmCardguActor(engine,actor);return fallback();}
 const mode=CARDGU_BASIC_FORMS[s.basicCount++%CARDGU_BASIC_FORMS.length].visualMode;
 return playback(engine,actor,[{target,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }}],mode);
}
export function playCardguArea(engine,event){
 const actor=engine.combatantById(event.actorId),skill=CARDGU_AREA_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==CARDGU_CODE||event.type!==CARDGU_AREA_EVENT||event.battleMode!=='PVE'||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&r.target.team!==actor.team&&!r.target.root.destroyed).map(({hit,target})=>({target,apply(){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }}));
 if(!rows.length)return true;
 if(!engine.cardguStates?.has(actor)){if(actor.hp>0)warmCardguActor(engine,actor);rows.forEach(r=>r.apply());return true;}
 return playback(engine,actor,rows,skill.visualMode,{area:true});
}
