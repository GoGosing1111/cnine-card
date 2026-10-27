import {gsap} from 'gsap';
import {Sprite} from 'pixi.js';
import {REVAN_CODE,REVAN_ART,REVAN_AREA_EVENT,REVAN_AREA_SKILL,REVAN_BASIC_FORMS,REVAN_PLAYBACK_RATE,REVAN_VERSION} from '../../../../shared/mercenary-revan-v1.mjs';
import {RevanFX,loadRevanAssets,ROOT} from './revan/RevanFX.js';
import {SKILLS,sampleSkill,clamp,smooth} from './revan/skill.mjs';
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'motion-manifest.json?v='+REVAN_VERSION).then(r=>{if(!r.ok)throw Error('REVAN_MOTION_ASSETS');return r.json();}).catch(e=>{manifestPromise=null;throw e;});
const disposeAssets=assets=>{for(const group of [assets.poses,assets.effects])for(const frames of Object.values(group))for(const texture of frames)texture.destroy(false);};
export const revanBattleArt=code=>code===REVAN_CODE?{...REVAN_ART,calmIdle:true,spriteUrl:'/'+REVAN_ART.battleSprite,
 footAnchor:{x:780/1254,y:1233/1254},bodyHeight:340,fullBodyHeight:1254*340/1184,originalTextureHeight:1254}:null;

class RevanLiveFX extends RevanFX{
 // The existing V3 timeline owns playback. The preview's private clock never starts.
 setMode(mode){this.mode=mode;this.clock.time=0;}
 get direction(){return this.merc.team==='ENEMY'?-1:1;}
 get worldScale(){return Math.max(.15,Math.abs(this.merc.root.scale.x));}
 begin(mode,targets){
  this.targets=targets;this.mode=mode;this.clock.time=0;this.merc.restoreNeutralAvatarPose?.();this.merc.applyFacing();
  const a=this.point(this.merc),b=targets[0]?this.point(targets[0]):a;
  const desired=Math.max(0,Math.abs(b.x-a.x)/this.worldScale-350);
  this.travel=SKILLS[mode].kind==='AREA'?Math.min(desired,SKILLS[mode].dash):Math.min(desired,650);
  this.render(0);
 }
 applyPose(state){
  const fraction=(SKILLS[this.mode].dash||0)>0?state.travel/SKILLS[this.mode].dash:0;
  super.applyPose({...state,travel:this.direction*(this.travel||0)*fraction,time:this.mode==='idle'?0:state.time});
  this.merc.applyFacing();
 }
 drawFrame(key,phase,x,y,height,options={}){
  while(this.used+2>this.pool.length){const sprite=new Sprite();sprite.visible=false;sprite.filters=[this.edgeFilter];this.layer.addChild(sprite);this.pool.push(sprite);}
  const start=this.used;
  super.drawFrame(key,phase,x,y,Math.min(height*this.worldScale,this.engine.scene.height*(key==='myeol'?1.35:.88)),options);
  for(let i=start;i<this.used;i++){const s=this.pool[i];s.scale.x*=this.direction;s.rotation*=this.direction;}
 }
 renderEffects(t,state){
  if(!this.fxEnabled||this.mode==='idle'||!this.targets.length)return;
  const p=this.plan,points=this.targets.map(a=>this.point(a)),a=this.point(this.merc),k=this.worldScale,d=this.direction;
  const age=t-p.fxAt,alpha=smooth(age/.10)*(1-smooth((age-p.fxDuration+.32)/.32));
  if(this.mode==='myeol'){
   const age=t-p.fxAt,phase=this.mappedPhase(t,[[p.fxAt,0],[1.23,5],[p.fxAt+p.fxDuration,11]]),alpha=smooth(age/.12)*(1-smooth((age-p.fxDuration+.45)/.45));
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y),center=(Math.min(...xs)+Math.max(...xs))/2,midY=(Math.min(...ys)+Math.max(...ys))/2-110*k;
   const sweep=(smooth((t-.86)/.62)-.5)*180*k*d;
   this.drawFrame('myeol',phase,center+sweep,midY,1370,{alpha,anchorY:.5});
   this.drawFrame('myeol',this.phase(age-.18,1.65),center+sweep-160*k*d,midY+30*k,970,{alpha:alpha*.48,anchorY:.5,rotation:.06});
   this.drawFrame('aura',this.phase(age,1.7),a.x+d*(this.travel||0)*k,a.y+10*k,610,{alpha:alpha*.6});
   return;
  }
  if(p.kind==='SINGLE'){
   const point=points[0],phase=this.mode==='danjoe'?this.mappedPhase(t,[[p.fxAt,0],[.83,5],[p.fxAt+p.fxDuration,11]]):this.mappedPhase(t,[[p.fxAt,0],[.70,4],[1.20,8],[p.fxAt+p.fxDuration,11]]);
   this.drawFrame(this.mode,phase,point.x-(this.mode==='danjoe'?90:0)*k*d,point.y+20*k,this.mode==='danjoe'?690:755,{alpha,anchorX:this.mode==='danjoe'?.62:.5});
   if(this.mode==='danjoe')this.drawFrame('danjoe',this.phase(age-.15,p.fxDuration),point.x-160*k*d,point.y+55*k,520,{alpha:alpha*.4,anchorX:.62,rotation:-.18});
   else this.drawFrame('aura',this.phase(age,p.fxDuration),point.x-25*k*d,point.y+8*k,520,{alpha:alpha*.4});
   return;
  }
  const xs=points.map(p=>p.x),center=(Math.min(...xs)+Math.max(...xs))/2,floor=Math.max(...points.map(p=>p.y));
  const phase=this.mappedPhase(t,[[p.fxAt,0],[1.66,6],[p.fxAt+p.fxDuration,11]]);
  this.drawFrame('jongeon',phase,center,floor+20*k,930,{alpha:alpha*.96});
  points.forEach((point,i)=>{
   const delay=points.length===1?0:i/(points.length-1)*.38,contact=1.46+delay;
   const local=this.mappedPhase(t,[[p.fxAt+delay,0],[contact,6],[p.fxAt+delay+1.72,11]]);
   this.drawFrame('jongeon',local,point.x,point.y+25*k,560+(i%3)*35,{alpha:alpha*.9});
  });
  this.drawFrame('danjoe',this.phase(age-.22,1.65),center,floor-40*k,610,{alpha:alpha*.55,anchorX:.55,rotation:-.1});
  this.drawFrame('aura',this.phase(age,2.15),a.x+d*(this.travel||0)*k,a.y+10*k,660,{alpha:alpha*.6});
 }
 hideEffects(){for(const s of [...this.pool,...this.auraRear,...this.auraFront,...this.bladeAura])s.visible=false;this.flash.visible=false;this.weapon.visible=false;this.gripOverlay.visible=false;}
 render(t){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0){this.hideEffects();return;}
  this.clock.time=t;this.reducedMotion=!!this.engine.reducedMotion;
  const state=sampleSkill(this.mode,t);this.state=state;this.used=0;for(const s of this.pool)s.visible=false;
  this.applyPose(state);this.renderAura(t,state);this.renderEffects(t,state);this.flash.visible=false;
  // HP, tint, target positions, global camera and other actors belong to V3.
 }
 renderIdle(t){if(this.destroyed||this.merc.root.destroyed)return;if(this.merc.hp<=0){this.hideEffects();return;}this.mode='idle';this.render(0);this.renderAura(this.engine.reducedMotion?0:t,this.state);}
 cancel(){if(this.destroyed)return;this.clearTimeline();this.hideEffects();if(this.merc.root.destroyed||this.merc.hp<=0)return;this.targets=[];this.travel=0;this.mode='idle';this.merc.restoreNeutralAvatarPose?.();this.renderIdle(0);}
 diagnostics(){return {...super.diagnostics(),code:REVAN_CODE,liveEnabled:true,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'SERVER_ONLY',playbackRate:REVAN_PLAYBACK_RATE,bodyFacing:this.direction,cameraZoom:false,foregroundGrip:true};}
 destroy(){if(this.destroyed)return;const assets=this.assets;super.destroy();disposeAssets(assets);}
}
function stopAmbient(s){if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;
 s.fx.renderIdle(0);if(s.engine.reducedMotion)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){if(!s.busy&&!s.stopped&&!s.actor.root.destroyed&&s.actor.root.visible)s.fx.renderIdle(clock.time);}}).to(clock,{time:4,duration:4,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupRevanActor(engine,actor){
 engine.revanStates||=new Map();engine.revanLoads||=new Map();
 if(engine.revanStates.has(actor))return engine.revanStates.get(actor);
 if(engine.revanLoads.has(actor))return engine.revanLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const m=await manifest(),assets=await loadRevanAssets(m);
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new RevanLiveFX(engine,actor,[],assets,m),state={engine,actor,fx,busy:false,stopped:false,basicCount:0};
  const setHp=actor.setHp;actor.setHp=function(value){const dead=this.hp<=0,result=setHp.call(this,value);if(this.hp<=0)fx.hideEffects();else if(dead&&!state.busy&&!state.stopped&&!fx.destroyed){fx.cancel();startAmbient(state);}return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};actor.art={...actor.art,code:REVAN_CODE};fx.cancel();actor.captureNeutralAvatarPose();engine.revanStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.revanLoads.delete(actor));engine.revanLoads.set(actor,pending);return pending;
}
export function warmRevanActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupRevanActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[레반] 전투 효과 준비 지연',e);});}
export function resumeRevanPlayback(engine){for(const s of engine.revanStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();startAmbient(s);}}
export function cancelRevanPlayback(engine){for(const s of engine.revanStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearRevanActors(engine){for(const s of engine.revanStates?.values()||[]){s.stopped=true;stopAmbient(s);s.restoreHp?.();s.fx.destroy();}engine.revanStates?.clear();}
async function playback(engine,actor,rows,mode){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!valid()||!rows.length)return false;const s=engine.revanStates?.get(actor);if(!s)return false;
 const targets=rows.map(r=>r.target);engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;
 if(mode==='basic')mode=REVAN_BASIC_FORMS[s.basicCount++%REVAN_BASIC_FORMS.length].visualMode;
 s.fx.begin(mode,targets);const plan=SKILLS[mode],clock={time:0},applied=new Set();
 const contacts=rows.map((_,i)=>plan.kind==='AREA'?plan.contacts[0]+(rows.length===1?0:i/(rows.length-1)*(plan.contacts.at(-1)-plan.contacts[0])):plan.contacts.at(-1));
 const result=await engine.timeline(t=>{
  t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  rows.forEach((row,i)=>t.call(()=>{if(valid()&&!s.stopped&&!applied.has(i)){applied.add(i);row.apply();}},[],contacts[i]));
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},engine.reducedMotion?8:REVAN_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:REVAN_CODE,eventType:plan.kind==='AREA'?REVAN_AREA_EVENT:'ATTACK',mode,authoritative:true,damageApplications:applied.size,contactSeconds:contacts,durationSeconds:plan.duration,playbackRate:REVAN_PLAYBACK_RATE,clockOwner:'V3_REGISTERED_GSAP',cameraZoom:false};
 return result&&valid();
}
export function playRevanBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 if(!engine.revanStates?.has(actor)){warmRevanActor(engine,actor);return fallback();}
 return playback(engine,actor,[{target,apply(){if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});}}],'basic');
}
export function playRevanArea(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(actor?.cardId!==REVAN_CODE||event.type!==REVAN_AREA_EVENT||event.battleMode!=='PVE'||event.skillId!==REVAN_AREA_SKILL.id)return true;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed).map(({hit,target})=>({target,apply(){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }}));
 if(!rows.length)return true;
 if(!engine.revanStates?.has(actor)){if(actor.hp>0)warmRevanActor(engine,actor);rows.forEach(r=>r.apply());return true;}
 return playback(engine,actor,rows,event.visualMode==='myeol'?'myeol':'jongeon');
}
