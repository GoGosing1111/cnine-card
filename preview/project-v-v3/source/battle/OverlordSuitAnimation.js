import {Assets,Texture,Rectangle,Container} from 'pixi.js';
import {gsap} from 'gsap';
import {KnightFX} from '../../../battle-suit-crimson-gold-knight-20261005-v1/source/KnightFX.js';
import {MODES} from '../../../battle-suit-crimson-gold-knight-20261005-v1/motion.mjs';
import {OVERLORD_ASSETS as M,OVERLORD_EXECUTION_COOLDOWN_MS,OVERLORD_MOTION_SPEED,OVERLORD_COMBO_EFFECT_SCALE,overlordAreaMotionTime,overlordAreaMotionEnd,takeOverlordBatch} from './OverlordSuitModel.mjs';
import {OVERLORD_AREA_SKILL} from '../../../../shared/overlord-suit-v1.mjs';
const HEIGHT=350;
class LiveKnightFX extends KnightFX{
 makeTimeline(){this.zoom=false;}
 render(t){
  super.render(t);
  if(this.mode==='combo')this.state.effects.forEach((effect,i)=>{
   if(effect.key==='slash'||effect.key==='impact'){
    const sprite=this.pool[i];sprite.scale.set(sprite.scale.x*OVERLORD_COMBO_EFFECT_SCALE,sprite.scale.y*OVERLORD_COMBO_EFFECT_SCALE);
   }
  });
 }
 point(target,y=0){
  if(target.valid&&!target.valid()&&target.savedPoints?.has(y))return target.savedPoints.get(y);
  const p=super.point(target,y);target.savedPoints?.set(y,p);return p;
 }
}
const bindTarget=actor=>{
 const id=actor.id,valid=()=>actor.id===id&&!actor.root.destroyed&&actor.root.visible!==false;
 const view={position:{set(x,y){if(valid()&&!actor.view.destroyed)actor.view.position.set(x,y);}}};
 for(const key of ['x','y'])Object.defineProperty(view,key,{set:v=>{if(valid()&&!actor.view.destroyed)actor.view[key]=v;},get:()=>0});
 return{id,actor,root:actor.root,view,fullBodyHeight:actor.fullBodyHeight,valid,savedPoints:new Map()};
};
const subframes=t=>[...Object.values(t.motion),...Object.values(t.effects)].flat();
export class OverlordSuitAnimation{
 static async load(){
  const used=new Set([M.sourceArt,M.auraFlash,M.titleOrnament,...Object.values(M.motion).map(s=>s.url),...Object.values(M.effects).map(s=>s.url)]);
  const rows=M.assets.filter(a=>used.has(a.url));
  const [sources]=await Promise.all([
   Promise.all(rows.map(a=>Assets.load(a.url))),
   (async()=>{if(typeof FontFace==='undefined')return;const font=new FontFace('OverlordTitle',"url('/assets/fonts/clan-camp/BlackHanSans-Regular.ttf')");document.fonts.add(await font.load());})()
  ]);
  const lookup=new Map(rows.map((a,i)=>[a.url,sources[i]]));
  return{
   idle:lookup.get(M.sourceArt),auraFlash:lookup.get(M.auraFlash),titleOrnament:lookup.get(M.titleOrnament),
   motion:Object.fromEntries(Object.entries(M.motion).map(([key,s])=>[key,s.frames.map((_,i)=>new Texture({source:lookup.get(s.url).source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}))])),
   effects:Object.fromEntries(Object.entries(M.effects).map(([key,s])=>[key,s.frames.map(f=>new Texture({source:lookup.get(s.url).source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}))]))
  };
 }
 static release(t){for(const f of subframes(t))if(!f.destroyed)f.destroy(false);}
 constructor(engine,unit,textures){
  Object.assign(this,{engine,unit,textures,actionIndex:0,completed:0,executions:0,nextExecutionAtMs:0,cooldownEpoch:engine.playbackEpoch,mode:'ready',timeMs:0,intrinsicArea:true,disposed:false});
  unit.swordAnimation=this;unit.bodySource=M.sourceArt;unit.weaponSource='';unit.weaponSprite.visible=false;
  this.placeholder={id:'overlord-idle-anchor',root:unit.root,view:new Container(),fullBodyHeight:HEIGHT};
  this.fx=new LiveKnightFX(engine,unit,[this.placeholder],textures,M,()=>{});
  this.skillFactory={create:(e,event,hits)=>new OverlordTigerCast(this,e,event,hits)};
  engine.battleSuitSkillEffectFactories??=new Map();engine.battleSuitSkillEffectFactories.set(OVERLORD_AREA_SKILL.code,this.skillFactory);
  this.ready();
 }
 usesAsset(url){return M.assets.some(a=>a.url===url);}
 combatAtMs(queue){const t=this.engine.skillChipPlayback?.clock?.time;return Number.isFinite(t)?t*1000:queue?.[0]?.options?.authoritativeEvent?.combatAtMs??null;}
 takeBatch(queue){
  if(this.cooldownEpoch!==this.engine.playbackEpoch){this.cooldownEpoch=this.engine.playbackEpoch;this.nextExecutionAtMs=0;}
  return takeOverlordBatch(queue,{combatAtMs:this.combatAtMs(queue),nextExecutionAtMs:this.nextExecutionAtMs,actionIndex:this.actionIndex});
 }
 stopAmbient(){
  this.ambient?.kill();this.ambient=null;
  if(this.ambientRegistration)this.engine.simpleTimelines.delete(this.ambientRegistration);
  this.ambientRegistration=null;
  if(this.ambientSync)this.engine.app?.ticker?.remove(this.ambientSync);
  this.ambientSync=null;
 }
 ready(){
  if(this.disposed||this.timeline||this.externalCast||!this.fx)return;
  const {unit:u,fx}=this;fx.targets=[this.placeholder];fx.target=this.placeholder;fx.capture();fx.mode='idle';fx.front.visible=fx.back.visible=true;fx.render(0);
  u.nameHud.visible=false;this.mode='ready';this.timeMs=0;
  if(this.ambient)return;
  const clock={time:0};
  this.ambient=gsap.timeline({repeat:-1,paused:true}).to(clock,{time:2.4,duration:2.4,ease:'none',onUpdate:()=>{
   if(!this.disposed&&!this.timeline&&!this.externalCast&&this.engine.visible){
    // Idle light must not reset another actor's camera or target transforms.
    fx.aura.render(clock.time,HEIGHT,0,0);
    fx.title.render(clock.time,HEIGHT,true,this.engine.mobile);
   }
  }});
  this.ambientRegistration={instance:this.ambient,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambientRegistration);
  this.ambientSync=()=>this.ambient?.paused(Boolean(!this.engine.visible||this.engine.skillChipPlayback?.holds||this.engine.skillChipPlayback?.userPaused||this.engine.accountBattleUnitIsPaused?.())).timeScale(this.engine.paceScale||1);
  this.engine.app?.ticker?.add(this.ambientSync,null,10);this.ambientSync();
 }
 restore(){
  if(this.unit.root.destroyed||this.disposed)return;
  const u=this.unit;u.root.position.set(u.root.baseX,u.root.baseY);u.root.depthSortY=u.root.baseY;
  for(const t of this.fx.targets)if(t.valid?.()&&!t.actor.view.destroyed)t.actor.view.position.set(0,0);
  this.engine.camera.reset(true);this.ready();this.engine.sortCombatDepth();
 }
 async play(batch,onImpact){
  if(this.disposed||!batch?.entries?.length)return false;
  this.cancel();this.stopAmbient();
  const {engine,unit,fx}=this,epoch=engine.playbackEpoch,target=batch.entries[0].target,id=target?.id;
  if(!target?.root||target.root.destroyed||target.root.visible===false){this.restore();return false;}
  const valid=()=>!this.disposed&&engine.visible&&engine.playbackEpoch===epoch&&target.id===id&&!target.root.destroyed&&target.root.visible!==false;
  fx.targets=[bindTarget(target)];fx.target=fx.targets[0];fx.capture();fx.mode=batch.mode;fx.front.visible=fx.back.visible=true;
  const clock={time:0},mode=batch.mode;this.mode=mode;this.actionIndex++;unit.stopIdle();unit.nameHud.visible=false;
  if(mode==='skill')this.nextExecutionAtMs=Math.max(batch.combatAtMs??0,this.combatAtMs(batch.entries)??0)+OVERLORD_EXECUTION_COOLDOWN_MS;
  this.catchupRate=Math.max(this.catchupRate||1,Math.min(4,1+Math.max(0,batch.entries.length+(engine.accountBattleUnitDamageQueue?.length||0)-1)*.18));
  const draw=()=>{if(!valid())return;fx.clock.time=clock.time;fx.render(clock.time);this.timeMs=clock.time*1000;};
  const sync=()=>{this.catchupRate=Math.max(this.catchupRate,Math.min(4,1+(engine.accountBattleUnitDamageQueue?.length||0)*.18));this.timeline?.paused(Boolean(engine.skillChipPlayback?.holds||engine.skillChipPlayback?.userPaused||engine.accountBattleUnitIsPaused?.())).timeScale((engine.paceScale||1)*this.catchupRate);};
  const finish=()=>{engine.app?.ticker?.remove(sync);this.timeline=null;unit.fireTimeline=null;if(!engine.accountBattleUnitDamageQueue?.length)this.catchupRate=1;this.restore();};
  const result=await engine.timeline(tl=>{
   this.timeline=unit.fireTimeline=tl;tl.to(clock,{time:MODES[mode].duration,duration:MODES[mode].duration/OVERLORD_MOTION_SPEED,ease:'none',onUpdate:draw},0);
   const groups=new Map();for(const hit of batch.impacts){const rows=groups.get(hit.atMs)||[];rows.push(hit.entry);groups.set(hit.atMs,rows);}
   for(const [at,rows]of groups)tl.call(()=>{if(valid())onImpact(rows);},[],at/1000/OVERLORD_MOTION_SPEED);
   engine.app?.ticker?.add(sync,null,10);draw();
  },finish,engine.paceScale||1);
  if(result){this.completed++;if(mode==='skill')this.executions++;}return result;
 }
 cancel(){this.stopAmbient();this.timeline?.kill();this.timeline=null;this.stopAmbient();if(this.fx){this.fx.front.visible=this.fx.back.visible=false;}}
 diagnostics(){return{version:M.version,motionSpeed:OVERLORD_MOTION_SPEED,comboEffectScale:OVERLORD_COMBO_EFFECT_SCALE,mode:this.mode,timeMs:Math.round(this.timeMs),completed:this.completed,executions:this.executions,nextExecutionAtMs:this.nextExecutionAtMs,intrinsicArea:true,weaponSha256:M.weapon.sha256,bodyFrames:44,effectFrames:152,damageAuthority:'SERVER_TIMELINE',effectsVisible:Boolean(this.fx?.pool.some(s=>s.visible&&s.parent?.visible)),ambientRegistered:Boolean(this.ambientRegistration&&this.engine.simpleTimelines.has(this.ambientRegistration)),aura:this.fx?.aura.diagnostics(),title:this.fx?.title.diagnostics(),externalCast:this.externalCast?.diagnostics()||null};}
 destroy(){
  if(this.disposed)return;this.externalCast?.destroy();this.cancel();this.disposed=true;
  if(this.engine.battleSuitSkillEffectFactories?.get(OVERLORD_AREA_SKILL.code)===this.skillFactory)this.engine.battleSuitSkillEffectFactories.delete(OVERLORD_AREA_SKILL.code);
  this.fx.targets=[this.placeholder];this.fx.target=this.placeholder;this.fx.destroy();this.placeholder.view.destroy();this.unit.bodySprite.texture=Texture.EMPTY;
 }
}
class OverlordTigerCast{
 constructor(sword,engine,event,hits){
  Object.assign(this,{sword,engine,event,hits,key:OVERLORD_AREA_SKILL.effectKey,clock:{time:0},destroyed:false});
  this.sequence={duration:MODES.aoe.duration/OVERLORD_MOTION_SPEED,life:1.8/OVERLORD_MOTION_SPEED,impacts:OVERLORD_AREA_SKILL.impactOffsetsMs.map(t=>t/1000)};
  this.confirmed=new Map();this.scheduled=new Map();this.cosmeticOnly=!hits.length;this.deferUntilImpact=!this.cosmeticOnly;
  this.hitIndices=new Set(hits.map(hit=>Number(hit.hitIndex)||0));
  this.done=new Promise(resolve=>this.release=resolve);
  this.bindings=(event.targetIds||[event.targetId]).map(id=>engine.combatantById(id)).filter(a=>a?.root&&!a.root.destroyed&&a.root.visible!==false).map(bindTarget);
  sword.cancel();sword.unit.stopIdle();this.fx=sword.fx;
  this.fx.targets=this.bindings.length?this.bindings:[sword.placeholder];this.fx.target=this.fx.targets[0];this.fx.capture();this.fx.mode='aoe';this.fx.front.visible=this.fx.back.visible=true;
  // Save positions before continuous encounter slots can be reused.
  for(const t of this.bindings){this.fx.point(t);this.fx.point(t,-(t.fullBodyHeight||300)*.52);}
  sword.externalCast=this;sword.mode='aoe';sword.unit.nameHud.visible=false;
 }
 scheduleImpact(index,time){if(!this.confirmed.has(index))this.scheduled.set(index,time);}
 impactLeadSeconds(index){return (index===0?this.sequence.impacts[0]:.07)/OVERLORD_MOTION_SPEED;}
 confirmImpact(index,time,event){if(!this.bindings.some(t=>t.id===event?.targetId&&t.valid()))return false;if(!this.confirmed.has(index))this.confirmed.set(index,time);return true;}
 render(time){
  if(this.destroyed||this.bodyReleased||!this.bindings.length)return;
  this.clock.time=time;const planned=this.scheduled.get(0),armed=this.cosmeticOnly||planned!==undefined;
  let bodyTime=armed?overlordAreaMotionTime(time,this.contacts()):0;
  if(!this.cosmeticOnly){
   const next=MODES.aoe.contacts.findIndex((_,i)=>this.hitIndices.has(i)&&!this.confirmed.has(i));
   if(next!==-1)bodyTime=Math.min(bodyTime,MODES.aoe.contacts[next]-.000001);
  }
  bodyTime=this.bodyTime=Math.max(this.bodyTime||0,bodyTime);
  this.fx.clock.time=Math.min(MODES.aoe.duration,bodyTime);this.fx.render(this.fx.clock.time);this.sword.timeMs=bodyTime*1000;
  // Waiting for the recorded strike must not freeze the persistent ornament.
  if(bodyTime===0){this.fx.aura.render(time,HEIGHT,0,0);this.fx.title.render(time,HEIGHT,true,this.engine.mobile);}
  if(bodyTime>=MODES.aoe.duration)this.releaseBody();
 }
 contacts(){
  if(this.cosmeticOnly)return this.sequence.impacts.map(t=>t/OVERLORD_MOTION_SPEED);
  const first=this.confirmed.get(0)??this.scheduled.get(0)??this.sequence.impacts[0];
  return this.sequence.impacts.map((t,i)=>this.confirmed.get(i)??this.scheduled.get(i)??first+t-this.sequence.impacts[0]);
 }
 endTime(){return overlordAreaMotionEnd(this.contacts());}
 get effectDurationSeconds(){return this.endTime();}
 releaseBody(){this.bodyReleased=true;if(this.sword.externalCast===this){this.sword.externalCast=null;this.sword.restore();}this.release?.();this.release=null;}
 diagnostics(){return{skill:OVERLORD_AREA_SKILL.code,timeMs:Math.round(this.clock.time*1000),targets:this.bindings.map(t=>t.id),confirmedImpacts:[...this.confirmed.keys()],destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;if(!this.bodyReleased)for(const t of this.bindings)if(t.valid()&&!t.actor.view.destroyed)t.actor.view.position.set(0,0);this.releaseBody();}
}
