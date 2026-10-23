import {gsap} from 'gsap';
import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {EUNSEOL_CODE,EUNSEOL_ART,EUNSEOL_AREA_EVENT,EUNSEOL_AREA_SKILL,EUNSEOL_PLAYBACK_RATE} from '../../../../shared/mercenary-eunseol-v1.mjs';
import {SeolhwiFX,loadSeolhwiAssets,ROOT} from './eunseol/SeolhwiFX.js';
import {SKILLS,posePlan} from './eunseol/skills.mjs';

const runtime={Assets,Container,Sprite,Texture,Rectangle},BODY_HEIGHT=285;
// Exact registration of the approved idle-00 image, never its transparent canvas.
const IDLE={cellSize:768,bodyPixels:514.4017818411115,footAnchor:{x:0.4869791666666667,y:0.8255208333333334}};
let manifestPromise;
const manifest=()=>manifestPromise||=fetch(ROOT+'motion-manifest.json?v=20261023-approved').then(r=>{
 if(!r.ok)throw Error('EUNSEOL_MOTION_ASSETS');return r.json();
}).catch(e=>{manifestPromise=null;throw e;});
export const eunseolBattleArt=code=>code===EUNSEOL_CODE?{...EUNSEOL_ART,calmIdle:true,spriteUrl:'/'+EUNSEOL_ART.battleSprite,
 footAnchor:IDLE.footAnchor,fullBodyHeight:IDLE.cellSize*BODY_HEIGHT/IDLE.bodyPixels,bodyHeight:BODY_HEIGHT,originalTextureHeight:IDLE.cellSize}:null;
const disposeAssets=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const texture of frames)texture.destroy(false);};

// The approved frames/timing are reused. Only V3 owns playback, target receipts,
// formation, camera and lifecycle; the authored preview clock never starts.
class EunseolLiveFX extends SeolhwiFX{
 makeTimeline(){}
 startAmbient(){}
 get direction(){return this.merc.team==='ENEMY'?-1:1;}
 captureFormation(){
  this.merc.applyFacing();
  if(!this.targets?.length){this.start={x:this.merc.baseX,y:this.merc.baseY};this.destination={...this.start};return;}
  super.captureFormation();
 }
 applyPose(p){super.applyPose(p);this.merc.applyFacing();}
 contain(sprite,key,index){
  // Mirror both the sword wave and tiger while retaining the approved bounds.
  sprite.scale.x=this.direction*Math.abs(sprite.scale.x);
  sprite.rotation=this.direction*Math.abs(sprite.rotation)*(sprite.rotation<0?-1:1);
  const spec=this.manifest.effects[key],b=spec.frames[index].visibleBounds,c=spec.cellSize;
  const corners=[[b.left-c/2,b.top-c/2],[b.right-c/2,b.top-c/2],[b.right-c/2,b.bottom-c/2],[b.left-c/2,b.bottom-c/2]];
  const bounds=()=>{
   const points=corners.map(([x,y])=>({x:x*sprite.scale.x*Math.cos(sprite.rotation)-y*sprite.scale.y*Math.sin(sprite.rotation),y:x*sprite.scale.x*Math.sin(sprite.rotation)+y*sprite.scale.y*Math.cos(sprite.rotation)}));
   return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
  };
  let b2=bounds();const {width,height}=this.engine.scene,margin=20;
  const fit=Math.min(1,(width-margin*2)/(b2.right-b2.left),(height-margin*2)/(b2.bottom-b2.top));
  if(fit<1){sprite.scale.set(sprite.scale.x*fit,sprite.scale.y*fit);b2=bounds();}
  sprite.x=Math.max(margin-b2.left,Math.min(sprite.x,width-margin-b2.right));
  sprite.y=Math.max(margin-b2.top,Math.min(sprite.y,height-margin-b2.bottom));
  sprite.envelope={left:sprite.x+b2.left,top:sprite.y+b2.top,right:sprite.x+b2.right,bottom:sprite.y+b2.bottom};
 }
 render(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0){this.hideEffects();return;}
  this.reducedMotion=!!this.engine.reducedMotion;
  // Concurrent incoming reactions belong to V3. Authored impact sprites do not
  // reset another actor's current tint each frame.
  const before=this.targets.map(a=>({a,tint:a.fullBodySprite.tint}));
  this.targetTints=before.map(row=>row.tint);
  super.render(time);
  for(const {a,tint}of before)if(!a.root.destroyed)a.fullBodySprite.tint=tint;
  this.aura.visible=this.aura.visible&&this.merc.hp>0;
 }
 hideEffects(){
  this.effects?.forEach(s=>s.visible=false);this.impacts?.forEach(s=>s.visible=false);
  if(this.aura)this.aura.visible=false;if(this.ghost)this.ghost.visible=false;
 }
 begin(mode,targets){
  this.targets=targets;this.targetTints=targets.map(a=>a.fullBodySprite.tint);
  this.mode='skill:'+mode;this.plan=SKILLS[mode];this.clock.time=0;this.captureFormation();
  const needed=targets.length*Math.ceil(this.plan.impacts.length/3);
  while(this.impacts.length<needed){const sprite=new Sprite();sprite.anchor.set(.5);sprite.visible=false;this.layer.addChild(sprite);this.impacts.push(sprite);}
  this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.clock.time=0;
  this.hideEffects();
  // V3 owns DEAD and its existing death/revive animation. A stale cast cleanup
  // must not replace its body, position or alpha with the idle sprite.
  if(this.merc.root.destroyed||this.merc.hp<=0)return;
  this.targets=[];this.targetTints=[];this.mode='idle';this.plan=posePlan('idle');this.captureFormation();
  this.merc.restoreNeutralAvatarPose?.();this.render(0);this.ghost.visible=false;
 }
 diagnostics(){return {...super.diagnostics(),liveEnabled:true,visualOnly:false,damageAuthority:'SERVER_ONLY',bodyFacing:this.direction,cameraZoom:false,playbackRate:EUNSEOL_PLAYBACK_RATE};}
 destroy(){if(this.destroyed)return;const assets=this.assets;super.destroy();disposeAssets(assets);}
}
function stopAmbient(s){if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();}
function startAmbient(s){
 stopAmbient(s);if(s.stopped||s.fx.destroyed||s.actor.root.destroyed||s.actor.hp<=0)return;
 s.fx.reducedMotion=!!s.engine.reducedMotion;s.fx.updateAura(0,1);
 if(s.engine.reducedMotion)return;
 const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate(){
  if(s.busy||s.stopped||s.actor.root.destroyed)return;
  s.fx.reducedMotion=!!s.engine.reducedMotion;
  if(s.actor.hp<=0){s.wasDead=true;s.fx.hideEffects();return;}
  if(s.wasDead){s.wasDead=false;s.fx.cancel();}
  if(s.actor.root.visible)s.fx.updateAura(clock.time,1);else s.fx.aura.visible=false;
 }}).to(clock,{time:3,duration:3,ease:'none'});
 const entry={instance,settle:()=>stopAmbient(s)};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
export async function setupEunseolActor(engine,actor){
 engine.eunseolStates||=new Map();engine.eunseolLoads||=new Map();
 if(engine.eunseolStates.has(actor))return engine.eunseolStates.get(actor);
 if(engine.eunseolLoads.has(actor))return engine.eunseolLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const m=await manifest(),assets=await loadSeolhwiAssets(m,runtime);
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(resolve=>setTimeout(resolve,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new EunseolLiveFX(engine,actor,assets,m,runtime),state={engine,actor,fx,busy:false,stopped:false};
  const setHp=actor.setHp;
  actor.setHp=function(value){
   const wasDead=this.hp<=0,result=setHp.call(this,value);
   if(this.hp<=0){state.wasDead=true;fx.hideEffects();}
   else if(wasDead&&!state.busy&&!state.stopped&&!fx.destroyed){state.wasDead=false;fx.cancel();startAmbient(state);}
   return result;
  };
  state.restoreHp=()=>{actor.setHp=setHp;};
  actor.art={...actor.art,code:EUNSEOL_CODE};fx.cancel();engine.eunseolStates.set(actor,state);startAmbient(state);return state;
 })().finally(()=>engine.eunseolLoads.delete(actor));engine.eunseolLoads.set(actor,pending);return pending;
}
export function warmEunseolActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupEunseolActor(engine,actor).catch(error=>{
 if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[Eunseol] 승인 효과 준비 지연; 기본 전투를 유지합니다.',error);
});}
export function resumeEunseolPlayback(engine){for(const s of engine.eunseolStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.wasDead=false;s.fx.cancel();startAmbient(s);}}
export function cancelEunseolPlayback(engine){for(const s of engine.eunseolStates?.values()||[]){s.stopped=true;stopAmbient(s);s.fx.cancel();}}
export function clearEunseolActors(engine){for(const s of engine.eunseolStates?.values()||[]){s.stopped=true;stopAmbient(s);s.restoreHp?.();s.fx.destroy();}engine.eunseolStates?.clear();}
async function playback(engine,actor,targets,mode,apply,{area=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;
 const s=engine.eunseolStates?.get(actor);if(!s)return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const plan=s.fx.plan,duration=plan.duration,contact=plan.impacts[0],clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],contact);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0){actor.animationController.setState('IDLE');startAmbient(s);}},
 engine.reducedMotion?8:EUNSEOL_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:EUNSEOL_CODE,eventType:area?EUNSEOL_AREA_EVENT:'ATTACK',mode,clockOwner:'V3_REGISTERED_GSAP',
  authoritative:true,damageApplications:applied?targets.length:0,contactSeconds:contact,durationSeconds:duration,playbackRate:EUNSEOL_PLAYBACK_RATE,cameraZoom:false};
 return result&&valid();
}
export function playEunseolBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 if(!engine.eunseolStates?.has(actor)){warmEunseolActor(engine,actor);return fallback();}
 return playback(engine,actor,[target],'moon',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playEunseolArea(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(actor?.cardId!==EUNSEOL_CODE||event.type!==EUNSEOL_AREA_EVENT||event.battleMode!=='PVE'||event.skillId!==EUNSEOL_AREA_SKILL.id)return true;
 const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return true;
 const apply=()=>{for(const {hit,target}of rows){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }};
 // Optional art requests cannot suppress an authoritative server receipt.
 if(!engine.eunseolStates?.has(actor)){if(actor.hp>0)warmEunseolActor(engine,actor);apply();return true;}
 return playback(engine,actor,rows.map(r=>r.target),Object.hasOwn(SKILLS,event.visualMode)?event.visualMode:'moon',apply,{area:true});
}
