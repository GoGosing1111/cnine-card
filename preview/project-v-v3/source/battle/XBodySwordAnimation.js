import {Assets,Texture,Rectangle} from 'pixi.js';
import {XBodyFX} from '../../../battle-suit-x-v1/source/XBodyFX.js';
import {DragonFX} from '../../../battle-suit-x-dragon-v1/source/DragonFX.js';
import {MODES} from '../../../battle-suit-x-v1/motion.mjs';
import {DURATION} from '../../../battle-suit-x-dragon-v1/motion.mjs';
import {X_SWORD,takeXBodyBatch} from './XBodySwordModel.mjs';
import {X_BODY_AREA_RELEASE_ENABLED,X_BODY_AREA_SKILL} from '../../../../shared/x-body-area-skill.mjs';

const HEIGHT=333.70859375;
// Preserve the approved render functions exactly, but let the live engine own
// their clock and atlas lifetime. Preview playback never runs autonomously.
class LiveSwordFX extends XBodyFX{makeTimeline(){}}
class LiveDragonFX extends DragonFX{makeTimeline(){}}
const frames=assets=>[...Object.values(assets.motion),...Object.values(assets.effects)].flat();
const disposeLayer=fx=>{
 if(!fx||fx.disposed)return;fx.removeTimeline();fx.restoreBackdrop?.();fx.disposed=true;
 fx.front.destroy({children:true});fx.back.destroy({children:true});
};
const hide=fx=>{if(!fx)return;fx.front.visible=fx.back.visible=false;fx.pool.forEach(s=>s.visible=false);fx.ghostPool?.forEach(s=>s.visible=false);fx.shade.clear();};

export class XBodySwordAnimation{
 static async load(){
  // Resolve all source images before allocating subtextures, so a failed load
  // cannot leak half of an atlas registry.
  const used=new Set([X_SWORD.image,...[X_SWORD.base,X_SWORD.dragon].flatMap(m=>[...Object.values(m.motion),...Object.values(m.effects)].map(s=>s.url))]);
  const rows=X_SWORD.assets.filter(a=>used.has(a.url));
  const sources=await Promise.all(rows.map(a=>Assets.load(a.url)));
  const lookup=new Map(rows.map((a,i)=>[a.url,sources[i]]));
  const decode=m=>({
   idle:lookup.get(X_SWORD.image),
   motion:Object.fromEntries(Object.entries(m.motion).map(([key,s])=>[key,s.frames.map((_,i)=>new Texture({source:lookup.get(s.url).source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}))])),
   effects:Object.fromEntries(Object.entries(m.effects).map(([key,s])=>[key,s.frames.map(f=>new Texture({source:lookup.get(s.url).source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}))]))
  });
  const base=decode(X_SWORD.base),dragon=decode(X_SWORD.dragon);
  dragon.motion.dash=base.motion.dash;dragon.effects.dash=base.effects.dash;
  return{base,dragon};
 }
 static release(textures){for(const t of new Set([...frames(textures.base),...frames(textures.dragon)]))if(!t.destroyed)t.destroy(false);}
 constructor(engine,unit,textures){
  Object.assign(this,{engine,unit,textures,actionIndex:0,completed:0,mode:'ready',timeMs:0,intrinsicArea:Boolean(textures.dragon),disposed:false});
  unit.swordAnimation=this;unit.bodySource=X_SWORD.image;unit.weaponSource='';unit.weaponSprite.visible=false;
  {
   this.skillFactory={create:(e,event,hits)=>new XBodyDragonCast(this,e,event,hits)};
   engine.battleSuitSkillEffectFactories??=new Map();
   engine.battleSuitSkillEffectFactories.set(X_BODY_AREA_SKILL.code,this.skillFactory);
  }
  this.ready();
 }
 takeBatch(queue){return takeXBodyBatch(queue,this.actionIndex);}
 usesAsset(url){return X_SWORD.assets.some(a=>a.url===url);}
 ready(){
  if(this.disposed||this.timeline||this.externalCast)return;
  const u=this.unit;u.bodySprite.texture=this.textures.base.idle;u.bodySprite.anchor.set(600/1145,1351/1374);u.bodySprite.scale.set(HEIGHT/1317);
  u.bodySprite.position.set(0,0);u.weaponSprite.visible=false;u.view.position.set(0,0);u.view.scale.set(1);
  u.nameHud.position.set(0,-HEIGHT-54);u.nameHud.visible=Boolean(u.fullName);this.mode='ready';this.timeMs=0;
 }
 swordFX(target){
  if(!this.fx)this.fx=new LiveSwordFX(this.engine,this.unit,target,this.textures.base,X_SWORD.base,()=>{});
  this.fx.target=target;this.fx.capture();return this.fx;
 }
 restore(){
  hide(this.fx);hide(this.dragon);this.dragon?.restoreBackdrop();
  const u=this.unit;if(u.root.destroyed)return;
  u.root.position.set(u.root.baseX,u.root.baseY);u.root.depthSortY=u.root.baseY;
  if(this.fx?.target?.view&&!this.fx.target.view.destroyed)this.fx.target.view.position.set(0,0);
  this.engine.camera.reset(true);this.ready();this.engine.sortCombatDepth();
 }
 async play(batch,onImpact){
  if(this.disposed||!batch?.entries?.length)return false;
  this.cancel();
  const {engine,unit}=this,epoch=engine.playbackEpoch,target=batch.entries[0].target,id=target?.id;
  if(!target?.root||target.root.destroyed||target.root.visible===false)return false;
  const valid=()=>!this.disposed&&engine.visible&&engine.playbackEpoch===epoch&&target.id===id&&!target.root.destroyed&&target.root.visible!==false;
  const mode=batch.mode==='skill'?'skill':'attack',fx=this.swordFX(target),clock={time:0};
  fx.mode=mode;fx.clock.time=0;fx.front.visible=fx.back.visible=true;fx.zoom=true;
  this.mode=mode;this.actionIndex++;unit.stopIdle();unit.nameHud.visible=false;
  // Keep the burst's catch-up rate through its final recovery. Recomputing
  // from the shrinking queue slowed the last actions again and exceeded the
  // generation/cast drain deadline even after all earlier hits had landed.
  this.catchupRate=Math.max(this.catchupRate||1,Math.min(4,1+Math.max(0,batch.entries.length+(engine.accountBattleUnitDamageQueue?.length||0)-1)*.18));
  const draw=()=>{if(!valid())return;fx.clock.time=clock.time;fx.render(clock.time);this.timeMs=clock.time*1000;};
  const sync=()=>{this.catchupRate=Math.max(this.catchupRate,Math.min(4,1+(engine.accountBattleUnitDamageQueue?.length||0)*.18));this.timeline?.paused(Boolean(engine.skillChipPlayback?.holds||engine.skillChipPlayback?.userPaused||engine.accountBattleUnitIsPaused?.()));this.timeline?.timeScale((engine.paceScale||1)*this.catchupRate);};
  const finish=()=>{engine.app?.ticker?.remove(sync);this.timeline=null;unit.fireTimeline=null;if(!engine.accountBattleUnitDamageQueue?.length)this.catchupRate=1;this.restore();};
  const result=await engine.timeline(timeline=>{
   this.timeline=unit.fireTimeline=timeline;
   timeline.to(clock,{time:MODES[mode].duration,duration:MODES[mode].duration,ease:'none',onUpdate:draw},0);
   const groups=new Map();
   for(const hit of batch.impacts){const list=groups.get(hit.atMs)||[];list.push(hit.entry);groups.set(hit.atMs,list);}
   for(const [atMs,entries]of groups)timeline.call(()=>{if(valid())onImpact(entries);},[],atMs/1000);
   engine.app?.ticker?.add(sync,null,10);draw();
  },finish,engine.paceScale||1);
  if(result)this.completed++;return result;
 }
 cancel(){this.timeline?.kill();this.timeline=null;hide(this.fx);hide(this.dragon);}
 diagnostics(){return{version:X_SWORD.version,mode:this.mode,timeMs:Math.round(this.timeMs),completed:this.completed,intrinsicArea:this.intrinsicArea,
  weaponSha256:X_SWORD.base.weapon.sha256,bodyFrames:40,effectFrames:108,damageAuthority:'SERVER_TIMELINE',areaReleaseEnabled:X_BODY_AREA_RELEASE_ENABLED,
  effectsVisible:Boolean(this.fx?.front.visible||this.dragon?.front.visible),externalCast:this.externalCast?.diagnostics()||null};}
 destroy(){
  if(this.disposed)return;this.externalCast?.destroy();this.cancel();this.restore();this.disposed=true;
  if(this.skillFactory&&this.engine.battleSuitSkillEffectFactories?.get(X_BODY_AREA_SKILL.code)===this.skillFactory)this.engine.battleSuitSkillEffectFactories.delete(X_BODY_AREA_SKILL.code);
  disposeLayer(this.fx);disposeLayer(this.dragon);this.unit.bodySprite.texture=Texture.EMPTY;XBodySwordAnimation.release(this.textures);
 }
}

// The shared skill clock sends every authoritative collision. This adapter
// owns visuals only; it cannot mutate HP, calculate damage or select new targets.
class XBodyDragonCast{
 constructor(sword,engine,event,hits){
  Object.assign(this,{sword,engine,event,hits,key:X_BODY_AREA_SKILL.effectKey,clock:{time:0},destroyed:false});
  this.sequence={duration:DURATION,life:1.8,impacts:X_BODY_AREA_SKILL.impactOffsetsMs.map(t=>t/1000)};
  this.confirmed=new Map();this.scheduled=new Map();this.cosmeticOnly=!hits.length;this.deferUntilImpact=!this.cosmeticOnly;
  this.done=new Promise(resolve=>this.release=resolve);
  const targets=(event.targetIds||[event.targetId]).map(id=>engine.combatantById(id)).filter(a=>a?.root&&!a.root.destroyed&&a.root.visible!==false);
  // Bind identities and ground points once. A continuous encounter may reuse
  // an actor slot after KO; its replacement must never receive old recoil.
  this.bindings=targets.map(actor=>{
   const id=actor.id,valid=()=>actor.id===id&&!actor.root.destroyed&&actor.root.visible!==false;
   const view={};
   for(const key of['x','y'])Object.defineProperty(view,key,{set:value=>{if(valid()&&!actor.view.destroyed)actor.view[key]=value;},get:()=>0});
   return{id,actor,root:actor.root,view,valid,point:null};
  });
  sword.cancel();sword.unit.stopIdle();
  if(!sword.dragon&&targets.length)sword.dragon=new LiveDragonFX(engine,sword.unit,this.bindings,sword.textures.dragon,X_SWORD.dragon,X_SWORD.base,()=>{});
  this.fx=sword.dragon;
  if(this.fx){
   this.fx.targets=this.bindings;
   this.fx.point=target=>{
    if(target.valid()||!target.point)target.point=this.fx.unit.root.parent.toLocal(target.root.toGlobal({x:0,y:0}));
    return target.point;
   };
   this.fx.capture();this.fx.front.visible=this.fx.back.visible=true;
  }
  sword.externalCast=this;sword.mode='dragon';sword.unit.nameHud.visible=false;
 }
 scheduleImpact(index,time){if(!this.confirmed.has(index))this.scheduled.set(index,time);}
 impactLeadSeconds(index){return index===0?this.sequence.impacts[0]:.06;}
 confirmImpact(index,time,event){
  if(!this.bindings.some(t=>t.id===event?.targetId&&t.valid()))return false;
  if(!this.confirmed.has(index))this.confirmed.set(index,time);return true;
 }
 render(time){
  if(this.destroyed||this.bodyReleased||!this.fx||!this.bindings.length)return;
  this.clock.time=time;
  const planned=this.scheduled.get(0),armed=this.cosmeticOnly||planned!==undefined;
  const bodyTime=armed?Math.max(0,time-(this.cosmeticOnly?0:planned-this.sequence.impacts[0])):0;
  this.fx.clock.time=Math.min(DURATION,bodyTime);this.fx.render(this.fx.clock.time);
  this.sword.timeMs=bodyTime*1000;
  if(bodyTime>=DURATION)this.releaseBody();
 }
 endTime(){return (this.scheduled.get(0)??this.sequence.impacts[0])-this.sequence.impacts[0]+DURATION;}
 releaseBody(){
  this.bodyReleased=true;
  if(this.sword.externalCast===this){this.sword.externalCast=null;this.sword.restore();}
  this.release?.();this.release=null;
 }
 diagnostics(){return{version:X_SWORD.version,skill:X_BODY_AREA_SKILL.code,timeMs:Math.round(this.clock.time*1000),targets:this.bindings.map(t=>t.id),confirmedImpacts:[...this.confirmed.keys()],destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;hide(this.fx);this.fx?.restoreBackdrop();for(const t of this.bindings)if(t.valid()&&!t.actor.view.destroyed)t.actor.view.position.set(0,0);this.releaseBody();}
}
