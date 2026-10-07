import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {SXBodyFX,loadSXAssets} from '../../../battle-suit-sx-v1/source/SXBodyFX.js';
import {SXUltimateFX,loadUltimateAssets} from '../../../battle-suit-sx-v1/ultimate-v3/source/SXUltimateFX.js';
import {MODES} from '../../../battle-suit-sx-v1/motion.mjs';
import {DURATION} from '../../../battle-suit-sx-v1/ultimate-v3/motion.mjs';
import {SX_AREA_SKILL,SX_ATTACK_SPEED} from '../../../../shared/sx-suit-v1.mjs';
import {SX_BASE as M,SX_ULTIMATE as U,SX_RUNTIME_VERSION,SX_SKILL_COOLDOWN_MS,takeSxBatch,sxAreaMotionTime,sxAreaMotionEnd} from './SXSuitModel.mjs';
import {SXSuitCamera} from './SXSuitCamera.js';
const ROOT='/preview/battle-suit-sx-v1/',HEIGHT=333.70859375;
const bindTarget=actor=>{
  const id=actor.id,valid=()=>actor.id===id&&!actor.root.destroyed&&actor.root.visible!==false;
  const view={position:{set(x,y){if(valid()&&!actor.view.destroyed)actor.view.position.set(x,y);}}};
  for(const key of ['x','y'])Object.defineProperty(view,key,{set:v=>{if(valid()&&!actor.view.destroyed)actor.view[key]=v;},get:()=>0});
  return {id,actor,root:actor.root,view,fullBodyHeight:actor.fullBodyHeight,valid,savedPoints:new Map()};
};
// Reuse approved drawings/choreography byte for byte. Live scheduling is owned
// by the engine, not by either preview controller's play/seek timeline.
class LiveSXFX extends SXUltimateFX{
  makeTimeline(){this.zoom=false;}
  // Live framing has its own scoped camera; never run the preview's parallax
  // mutations or its unconditional camera reset during normal attacks.
  restoreBackdrop(){}
  drawBladeAura(t,state,bp){
    // The approved blue blade is a permanent part of the live actor. Cast FX
    // cleanup must not switch it off between attacks or after combat stops.
    const s=this.bladeAura,layer=this.unit.view;
    if(s.parent!==layer)layer.addChild(s);
    s.zIndex=this.unit.bodySprite.zIndex+1;
    s.visible=this.effectsEnabled&&!this.disposed;if(!s.visible)return;
    const frame=Math.floor(Math.max(0,t)*12)%12,a=this.manifest.effects.blade.frames[frame].attachment;
    const point=p=>layer.toLocal(this.unit.root.parent.toGlobal(p));
    const start=point({x:bp.grip.x+(bp.tip.x-bp.grip.x)*.065,y:bp.grip.y+(bp.tip.y-bp.grip.y)*.065}),end=point(bp.tip),dx=end.x-start.x,dy=end.y-start.y;
    const scale=Math.hypot(dx,dy)/(a.tip.x-a.root.x);
    s.texture=this.assets.effects.blade[frame];s.anchor.set(a.root.x/512,a.root.y/512);s.position.set(start.x,start.y);s.rotation=Math.atan2(dy,dx);s.scale.set(scale,scale*.82);s.alpha=1;s.tint=0xffffff;s.blendMode='normal';
    const actual=s.toGlobal({x:a.tip.x-a.root.x,y:a.tip.y-a.root.y}),expected=layer.toGlobal(end);this.bladeAuraError=Math.hypot(actual.x-expected.x,actual.y-expected.y);
  }
  point(target,y=0){
    if(target.valid&&!target.valid()&&target.savedPoints?.has(y))return target.savedPoints.get(y);
    const p=this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y}));target.savedPoints?.set(y,p);return p;
  }
  contact(){return this.point(this.target,-(this.target.fullBodyHeight||300)*.52);}
  targetFeet(){return this.point(this.target);}
  render(t){
    if(this.disposed)return;
    const engine=this.engine;
    if(this.mode==='ultimate'&&this.targets&&t>0&&t<DURATION){
      this.liveCamera??=new SXSuitCamera(engine,this);this.liveCamera.frame(t);
    }else this.liveCamera?.release();
    this.cameraNeutralEngine??=Object.assign(Object.create(engine),{camera:{reset(){}}});
    this.engine=this.cameraNeutralEngine;this.zoom=false;
    try{
      if(this.mode==='ultimate'&&this.targets)return super.render(t);
      this.areaPool?.forEach(s=>s.visible=false);this.swordTrails?.forEach(s=>s.visible=false);
      if(this.giantSword)this.giantSword.visible=false;
      this.rays?.clear();this.flash?.clear();this.groundMask?.clear();
      return SXBodyFX.prototype.render.call(this,t);
    }finally{this.engine=engine;}
  }
  destroy(){
    if(this.disposed)return;this.liveCamera?.release();this.removeTimeline();this.disposed=true;
    if(this.giantSword)this.giantSword.mask=null;
    this.bladeAura.destroy();
    this.title.destroy();this.front.destroy({children:true});this.back.destroy({children:true});
    // SXSuitAnimation owns subtextures; both modes share one resource set.
  }
}
const subframes=t=>[...Object.values(t.base.motion),...Object.values(t.base.effects),...Object.values(t.ultimate.effects)].flat();
export class SXSuitAnimation{
  static async load(){
    const [base,ultimate]=await Promise.all([
      loadSXAssets(M),loadUltimateAssets(U),
      (async()=>{if(typeof FontFace==='undefined')return;const font=new FontFace('SXTitleSerif',`url('${ROOT}assets/fonts/NotoSerifKR-blue-reaper-900.ttf')`,{weight:'900'});document.fonts.add(await font.load());})(),
    ]);
    return {base,ultimate};
  }
  static release(textures){for(const texture of subframes(textures))if(!texture.destroyed)texture.destroy(false);}
  constructor(engine,unit,textures){
    Object.assign(this,{engine,unit,textures,actionIndex:0,completed:0,skills:0,nextSkillAtMs:0,cooldownEpoch:engine.playbackEpoch,mode:'ready',timeMs:0,intrinsicArea:true,disposed:false});
    unit.bodySource=ROOT+M.sourceArt;unit.weaponSource='';unit.weaponSprite.visible=false;
    this.placeholder={id:'sx-idle-anchor',root:unit.root,view:new Container(),fullBodyHeight:HEIGHT};
    this.fx=new LiveSXFX(engine,unit,[this.placeholder],textures.base,M,textures.ultimate,U,()=>{});
    unit.swordAnimation=this;
    this.skillFactory={create:(e,event,hits)=>new SXSkyfallCast(this,e,event,hits)};
    engine.battleSuitSkillEffectFactories??=new Map();engine.battleSuitSkillEffectFactories.set(SX_AREA_SKILL.code,this.skillFactory);
    this.ready();
  }
  usesAsset(url){return String(url||'').startsWith(ROOT);}
  combatAtMs(queue){const t=this.engine.skillChipPlayback?.clock?.time;return Number.isFinite(t)?t*1000:queue?.[0]?.options?.authoritativeEvent?.combatAtMs??null;}
  takeBatch(queue){
    if(this.cooldownEpoch!==this.engine.playbackEpoch){this.cooldownEpoch=this.engine.playbackEpoch;this.nextSkillAtMs=0;}
    return takeSxBatch(queue,{combatAtMs:this.combatAtMs(queue),nextSkillAtMs:this.nextSkillAtMs});
  }
  stopAmbient(){
    this.ambient?.kill();this.ambient=null;
    if(this.ambientRegistration)this.engine.simpleTimelines.delete(this.ambientRegistration);this.ambientRegistration=null;
    if(this.ambientSync)this.engine.app?.ticker?.remove(this.ambientSync);this.ambientSync=null;
  }
  ready(){
    if(this.disposed||this.timeline||this.externalCast||!this.fx)return;
    const fx=this.fx;fx.targets=[this.placeholder];fx.target=this.placeholder;fx.capture();fx.mode='idle';fx.cancelled=false;fx.front.visible=fx.back.visible=true;
    fx.clock.time=.01;fx.render(.01);this.unit.nameHud.visible=false;this.mode='ready';this.timeMs=0;
    if(this.ambient)return;
    const clock={time:.01};
    this.ambient=gsap.timeline({repeat:-1,paused:true}).to(clock,{time:4.8,duration:4.79,ease:'none',onUpdate:()=>{
      if(!this.disposed&&!this.timeline&&!this.externalCast&&this.engine.visible){fx.clock.time=clock.time;fx.render(clock.time);}
    }});
    this.ambientRegistration={instance:this.ambient,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambientRegistration);
    this.ambientSync=()=>this.ambient?.paused(Boolean(!this.engine.visible||this.engine.skillChipPlayback?.holds||this.engine.skillChipPlayback?.userPaused||this.engine.accountBattleUnitIsPaused?.())).timeScale(this.engine.paceScale||1);
    this.engine.app?.ticker?.add(this.ambientSync,null,10);this.ambientSync();
  }
  restore(){
    if(this.disposed||this.unit.root.destroyed)return;
    const u=this.unit;u.root.position.set(u.root.baseX,u.root.baseY);u.root.depthSortY=u.root.baseY;
    for(const t of this.fx.targets)if(t.valid?.()&&!t.actor.view.destroyed)t.actor.view.position.set(0,0);
    this.ready();this.engine.sortCombatDepth();
  }
  async play(batch,onImpact){
    if(this.disposed||!batch?.entries?.length)return false;
    this.cancel();
    const {engine,unit,fx}=this,epoch=engine.playbackEpoch,target=batch.entries[0].target,id=target?.id;
    if(!target?.root||target.root.destroyed||target.root.visible===false){this.restore();return false;}
    const valid=()=>!this.disposed&&engine.visible&&engine.playbackEpoch===epoch&&target.id===id&&!target.root.destroyed&&target.root.visible!==false;
    const delivered=new Set();
    const deliver=rows=>{if(!valid())return;const pending=rows.filter(row=>!delivered.has(row));if(!pending.length)return;pending.forEach(row=>delivered.add(row));onImpact(pending);};
    fx.targets=[bindTarget(target)];fx.target=fx.targets[0];fx.capture();fx.mode=batch.mode;fx.cancelled=false;fx.front.visible=fx.back.visible=true;
    const clock={time:0},mode=batch.mode;this.mode=mode;this.actionIndex++;unit.stopIdle();unit.nameHud.visible=false;
    if(mode==='skill')this.nextSkillAtMs=Math.max(batch.combatAtMs??0,this.combatAtMs(batch.entries)??0)+SX_SKILL_COOLDOWN_MS;
    this.catchupRate=Math.max(this.catchupRate||1,Math.min(4,1+Math.max(0,batch.entries.length+(engine.accountBattleUnitDamageQueue?.length||0)-1)*.18));
    const draw=()=>{if(!valid())return;fx.clock.time=clock.time;fx.render(clock.time);this.timeMs=clock.time*1000;};
    const sync=()=>{this.catchupRate=Math.max(this.catchupRate,Math.min(4,1+(engine.accountBattleUnitDamageQueue?.length||0)*.18));this.timeline?.paused(Boolean(engine.skillChipPlayback?.holds||engine.skillChipPlayback?.userPaused||engine.accountBattleUnitIsPaused?.())).timeScale((engine.paceScale||1)*this.catchupRate);};
    const finish=()=>{engine.app?.ticker?.remove(sync);this.timeline=null;unit.fireTimeline=null;if(!engine.accountBattleUnitDamageQueue?.length)this.catchupRate=1;this.restore();};
    const result=await engine.timeline(tl=>{
      this.timeline=unit.fireTimeline=tl;tl.to(clock,{time:MODES[mode].duration,duration:batch.duration,ease:'none',onUpdate:draw},0);
      const groups=new Map();for(const hit of batch.impacts){const rows=groups.get(hit.atMs)||[];rows.push(hit.entry);groups.set(hit.atMs,rows);}
      for(const [at,rows] of groups)tl.call(()=>deliver(rows),[],at/1000);
      engine.app?.ticker?.add(sync,null,10);draw();
    },finish,engine.paceScale||1);
    // Natural completion settles every server receipt exactly once, including
    // a contact callback crossed during a renderer catch-up/clock correction.
    // Cancellation and a replaced target never apply this completion fallback.
    if(result){deliver(batch.entries);this.completed++;if(mode==='skill')this.skills++;}return result;
  }
  cancel(){this.stopAmbient();this.timeline?.kill();this.timeline=null;this.stopAmbient();this.fx?.liveCamera?.release();if(this.fx)this.fx.front.visible=this.fx.back.visible=false;}
  onBattleCancel(){this.cancel();}
  diagnostics(){return {version:SX_RUNTIME_VERSION,attackSpeed:SX_ATTACK_SPEED,mode:this.mode,timeMs:Math.round(this.timeMs),completed:this.completed,skills:this.skills,nextSkillAtMs:this.nextSkillAtMs,intrinsicArea:true,damageAuthority:'SERVER_TIMELINE',
    sourceSha256:M.sourceSha256,mainBodyTint:this.unit.bodySprite.tint,bodyUniformScale:Math.abs(this.unit.bodySprite.scale.x)===Math.abs(this.unit.bodySprite.scale.y),
    effectsVisible:Boolean(this.fx?.front.visible||this.fx?.back.visible),bladeAuraVisible:this.fx?.bladeAura.visible,bladeAuraAttachmentError:this.fx?.bladeAuraError,bodyAuraAlpha:this.fx?.ambient[0].alpha,camera:this.fx?.liveCamera?.diagnostics()||null,
    title:this.fx?.title.diagnostics(),ambientRegistered:Boolean(this.ambientRegistration&&this.engine.simpleTimelines.has(this.ambientRegistration)),externalCast:this.externalCast?.diagnostics()||null};}
  destroy(){
    if(this.disposed)return;this.externalCast?.destroy();this.cancel();this.disposed=true;
    if(this.engine.battleSuitSkillEffectFactories?.get(SX_AREA_SKILL.code)===this.skillFactory)this.engine.battleSuitSkillEffectFactories.delete(SX_AREA_SKILL.code);
    this.fx.destroy();this.placeholder.view.destroy();this.unit.view.scale.set(1);this.unit.bodySprite.texture=Texture.EMPTY;SXSuitAnimation.release(this.textures);
  }
}
// The server supplies all five impacts and their exact target identities. No
// preview collision, recoil or particle can generate additional damage.
class SXSkyfallCast{
  constructor(sword,engine,event,hits){
    Object.assign(this,{sword,engine,event,hits,key:SX_AREA_SKILL.effectKey,clock:{time:0},destroyed:false});
    this.sequence={duration:DURATION,life:1.8,impacts:SX_AREA_SKILL.impactOffsetsMs.map(ms=>ms/1000)};
    this.confirmed=new Map();this.scheduled=new Map();this.cosmeticOnly=!hits.length;this.deferUntilImpact=!this.cosmeticOnly;
    this.hitIndices=new Set(hits.map(hit=>Number(hit.hitIndex)||0));this.done=new Promise(resolve=>this.release=resolve);
    this.bindings=(event.targetIds||[event.targetId]).map(id=>engine.combatantById(id)).filter(a=>a?.root&&!a.root.destroyed&&a.root.visible!==false).map(bindTarget);
    sword.cancel();sword.unit.stopIdle();this.fx=sword.fx;
    this.fx.targets=this.bindings.length?this.bindings:[sword.placeholder];this.fx.target=this.fx.targets[0];this.fx.capture();this.fx.mode='ultimate';this.fx.cancelled=false;this.fx.front.visible=this.fx.back.visible=true;
    for(const t of this.bindings){this.fx.point(t);this.fx.point(t,-(t.fullBodyHeight||300)*.52);}
    sword.externalCast=this;sword.mode='ultimate';sword.unit.nameHud.visible=false;
  }
  scheduleImpact(index,time){if(!this.confirmed.has(index))this.scheduled.set(index,time);}
  impactLeadSeconds(index){return index===0?this.sequence.impacts[0]:.07;}
  confirmImpact(index,time,event){if(!this.bindings.some(t=>t.id===event?.targetId&&t.valid()))return false;if(!this.confirmed.has(index))this.confirmed.set(index,time);return true;}
  contacts(){const first=this.confirmed.get(0)??this.scheduled.get(0)??this.sequence.impacts[0];return this.sequence.impacts.map((t,i)=>this.confirmed.get(i)??this.scheduled.get(i)??first+t-this.sequence.impacts[0]);}
  render(time){
    if(this.destroyed||this.bodyReleased||!this.bindings.length)return;
    this.clock.time=time;const armed=this.cosmeticOnly||this.scheduled.has(0);
    let bodyTime=armed?sxAreaMotionTime(time,this.contacts()):0;
    if(!this.cosmeticOnly){const next=this.sequence.impacts.findIndex((_,i)=>this.hitIndices.has(i)&&!this.confirmed.has(i));if(next!==-1)bodyTime=Math.min(bodyTime,this.sequence.impacts[next]-.000001);}
    bodyTime=this.bodyTime=Math.max(this.bodyTime||0,bodyTime);this.fx.clock.time=bodyTime;this.fx.render(bodyTime);this.sword.timeMs=bodyTime*1000;
    if(bodyTime>=DURATION)this.releaseBody();
  }
  endTime(){return sxAreaMotionEnd(this.contacts());}
  get effectDurationSeconds(){return this.endTime();}
  releaseBody(){this.bodyReleased=true;if(this.sword.externalCast===this){this.sword.externalCast=null;this.sword.restore();}this.release?.();this.release=null;}
  diagnostics(){return {version:SX_RUNTIME_VERSION,skill:SX_AREA_SKILL.code,timeMs:Math.round(this.clock.time*1000),bodyTimeMs:Math.round((this.bodyTime||0)*1000),targets:this.bindings.map(t=>t.id),confirmedImpacts:[...this.confirmed.keys()],destroyed:this.destroyed};}
  destroy(){if(this.destroyed)return;this.destroyed=true;if(!this.bodyReleased)for(const t of this.bindings)if(t.valid()&&!t.actor.view.destroyed)t.actor.view.position.set(0,0);this.releaseBody();}
}
