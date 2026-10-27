import {gsap} from 'gsap';
import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import manifest from '../../../../assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/motion-manifest.json' with {type:'json'};
import {BLACKCROWN_COMBAT,BLACKCROWN_EVENT,BLACKCROWN_PLAYBACK_RATE} from '../../../../shared/mercenary-blackcrown-combat-v1.mjs';
import {BlackCrownFX,loadAssets,ROOT} from './blackcrown/BlackCrownFX.js';
import {plan} from './blackcrown/skills.mjs';
const runtime={Assets,Container,Sprite,Texture,Rectangle,timeline:options=>gsap.timeline(options)};
const characters=new Map(manifest.characters.map(c=>[c.code,c]));
const disposeAssets=assets=>{
 const views=new Set([...Object.entries(assets.motion).filter(([key])=>key!=='idle').flatMap(([,frames])=>frames),...assets.effects,...assets.secondaryEffects]);
 for(const view of views)view.destroy(false);
};
export const blackcrownBattleArt=code=>{
 const c=characters.get(code);if(!c)return null;const f=c.motion.idle.frames[0];
 return {code,name:c.name,sourceArt:c.sourceArt,calmIdle:true,spriteUrl:ROOT+c.motion.idle.file,
  footAnchor:{x:f.foot.x/f.width,y:f.foot.y/f.height},bodyHeight:c.bodyHeight,
  fullBodyHeight:f.height*c.bodyHeight/f.bodyPixels,originalTextureHeight:f.height};
};
class BlackCrownLiveFX extends BlackCrownFX{
 captureFormation(){this.merc.applyFacing();super.captureFormation();}
 applyPose(p){super.applyPose(p);this.merc.applyFacing();}
 hideEffects(){this.sprites?.forEach(s=>s.visible=false);}
 render(time){
  if(this.destroyed||this.merc.root.destroyed)return;
  if(this.merc.hp<=0||this.targets.some(t=>t.root.destroyed)){this.hideEffects();return;}
  this.reducedMotion=!!this.engine.reducedMotion;this.tints=this.targets.map(t=>t.fullBodySprite.tint);
  super.render(time);
  this.targets.forEach((t,i)=>{if(!t.root.destroyed)t.fullBodySprite.tint=this.tints[i];});
 }
 begin(mode,targets){
  this.targets=targets;this.tints=targets.map(t=>t.fullBodySprite.tint);this.mode=mode;this.plan=structuredClone(plan(this.spec.id,mode));
  const indices=new Map();for(const shot of this.plan.shots)if(!indices.has(shot.target))indices.set(shot.target,indices.size%targets.length);
  for(const shot of this.plan.shots){shot.target=indices.get(shot.target);if(shot.fromTarget!=null)shot.fromTarget=indices.get(shot.fromTarget)??0;}
  this.clock.time=0;this.captureFormation();this.render(0);
 }
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.hideEffects();
  if(this.merc.root.destroyed||this.merc.hp<=0)return;
  this.targets=[];this.tints=[];this.mode='idle';this.plan=plan(this.spec.id,'idle');this.clock.time=0;
  this.merc.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0);
 }
 diagnostics(){return {...super.diagnostics(),code:this.spec.code,liveEnabled:true,visualOnly:false,
  clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'SERVER_ONLY',playbackRate:BLACKCROWN_PLAYBACK_RATE,cameraZoom:false};}
 destroy(){if(this.destroyed)return;const assets=this.assets;super.destroy();disposeAssets(assets);}
}
export async function setupBlackCrownActor(engine,actor){
 engine.blackcrownStates||=new Map();engine.blackcrownLoads||=new Map();
 if(engine.blackcrownStates.has(actor))return engine.blackcrownStates.get(actor);
 if(engine.blackcrownLoads.has(actor))return engine.blackcrownLoads.get(actor);
 const spec=characters.get(actor.cardId);if(!spec)return null;
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const assets=await loadAssets(spec,runtime);
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new BlackCrownLiveFX(engine,actor,assets,spec,runtime),state={engine,actor,fx,busy:false,stopped:false};
  const setHp=actor.setHp;
  actor.setHp=function(value){const dead=this.hp<=0,result=setHp.call(this,value);if(this.hp<=0)fx.hideEffects();else if(dead&&!state.busy&&!state.stopped&&!fx.destroyed)fx.cancel();return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};fx.cancel();engine.blackcrownStates.set(actor,state);return state;
 })().finally(()=>engine.blackcrownLoads.delete(actor));engine.blackcrownLoads.set(actor,pending);return pending;
}
export function warmBlackCrownActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupBlackCrownActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[BlackCrown] 전투 효과 준비 지연',e);});}
export function resumeBlackCrownPlayback(engine){for(const s of engine.blackcrownStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();}}
export function cancelBlackCrownPlayback(engine){for(const s of engine.blackcrownStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearBlackCrownActors(engine){for(const s of engine.blackcrownStates?.values()||[]){s.stopped=true;s.restoreHp?.();s.fx.destroy();}engine.blackcrownStates?.clear();}
async function playback(engine,actor,rows,mode,{skill=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!valid()||!rows.length)return false;
 const s=engine.blackcrownStates?.get(actor);if(!s)return false;
 const targets=rows.map(r=>r.target);engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(mode,targets);
 const p=s.fx.plan,clock={time:0},applied=new Set();
 // Repeated bullets/blades belong to one server receipt. Apply its summed
 // damage at the final authored contact for that target, exactly once.
 const contacts=rows.map((_,i)=>Math.max(...p.shots.filter(shot=>shot.target===i).map(shot=>shot.hit)));
 const result=await engine.timeline(t=>{
  t.to(clock,{time:p.duration,duration:p.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  rows.forEach((row,i)=>t.call(()=>{if(valid()&&!s.stopped&&!applied.has(i)){applied.add(i);row.apply();}},[],contacts[i]));
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0)actor.animationController.setState('IDLE');},
 engine.reducedMotion?8:BLACKCROWN_PLAYBACK_RATE,{owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:actor.cardId,eventType:skill?BLACKCROWN_EVENT:'ATTACK',mode,authoritative:true,
  damageApplications:applied.size,contactSeconds:contacts,durationSeconds:p.duration,playbackRate:BLACKCROWN_PLAYBACK_RATE,clockOwner:'V3_REGISTERED_GSAP',cameraZoom:false};
 return result&&valid();
}
export function playBlackCrownBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 if(!engine.blackcrownStates?.has(actor)){warmBlackCrownActor(engine,actor);return fallback();}
 return playback(engine,actor,[{target,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }}],'attack');
}
export function playBlackCrownSkill(engine,event){
 const actor=engine.combatantById(event.actorId),skill=BLACKCROWN_COMBAT[actor?.cardId]?.skills.find(s=>s.id===event.skillId);
 if(!actor||event.type!==BLACKCROWN_EVENT||!skill)return true;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].slice(0,skill.targetCount).map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&r.target.team!==actor.team&&!r.target.root.destroyed).map(({hit,target})=>({target,apply(){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
 }}));
 if(!rows.length)return true;
 if(!engine.blackcrownStates?.has(actor)){if(actor.hp>0)warmBlackCrownActor(engine,actor);rows.forEach(r=>r.apply());return true;}
 return playback(engine,actor,rows,skill.visualMode,{skill:true});
}
