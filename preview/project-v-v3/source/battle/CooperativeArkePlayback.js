import {Assets,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import {configureDamageText} from './ObjectPool.js';
import {projectilePixelScale,projectileTrailGeometry,drawProjectileTrail} from './ProjectileTrail.mjs';
const BASE='/assets/ui/cooperative-arke-v1/';
let resources;
export async function preloadCooperativeArke(){
 if(!resources)resources=Promise.all(['arke-slam-atlas-v1.png','core-rupture-atlas-v1.png','focus-beam-atlas-v1.png'].map(file=>Assets.load(BASE+file))).then(textures=>textures.map(texture=>{
  const w=texture.width/4,h=texture.height/2;
  return Array.from({length:8},(_,i)=>new Texture({source:texture.source,frame:new Rectangle(i%4*w,Math.floor(i/4)*h,w,h)}));
 })).catch(error=>{resources=null;throw error;});
 return resources;
}
function damageLabel(engine,target,hit){
 const label=engine.pools.damage.acquire();configureDamageText(label,{kind:'ATTACK',damage:Number(hit.damage||0)+Number(hit.absorbed||0),critical:false,healing:0,hitCount:1,compact:engine.mobile});
 label.position.set(Math.max(150,Math.min(engine.scene.width-150,target.root.x)),Math.max(195,target.root.y-230));label.visible=true;label.alpha=1;engine.uiLayer.addChild(label);return label;
}
function applyHit(engine,target,hit){
 if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter));
 if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter);
}
export async function playCooperativeWatcherAttack(engine,actor,target,{damage,targetHp,targetShield,onImpact}){
 const epoch=engine.playbackEpoch,[,frames]=await preloadCooperativeArke();if(epoch!==engine.playbackEpoch||!engine.visible)return false;
 engine.settlePendingTails([actor,target]);
 const trail=new Graphics(),effect=new Sprite(frames[0]),clock={time:0},impact=.44,duration=.86;
 const from={x:actor.root.x-25,y:actor.root.y-actor.fullBodyHeight*actor.restScale*.55},to={x:target.root.x,y:target.root.y-90};
 effect.anchor.set(.5);effect.position.set(to.x,to.y);effect.width=effect.height=145;effect.visible=false;
 engine.effectLayer.addChild(trail,effect);const label=damageLabel(engine,target,{damage});label.visible=false;
 engine.lastCoopPlayback={kind:'WATCHER_VOLLEY',effectFrames:8,shots:2,clockOwner:'V3_GSAP',impactAt:impact};
 return engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate:()=>{
   trail.clear();for(const delay of [.06,.18]){const q=(clock.time-delay)/.26;if(q>=0&&q<=1)drawProjectileTrail(trail,projectileTrailGeometry(from,to,q,{scale:projectilePixelScale(engine.effectLayer)}),0xffb556);}
   effect.visible=clock.time>=impact;effect.texture=frames[Math.min(7,Math.floor(Math.max(0,clock.time-impact)/(duration-impact)*8))];effect.alpha=Math.min(1,(duration-clock.time)/.12);
  }},0);
  t.call(()=>{if(Number.isFinite(targetHp))engine.syncTargetHp(target,targetHp);if(Number.isFinite(targetShield))engine.syncTargetShield(target,targetShield);onImpact?.();label.visible=true;},[],impact);
  t.to(label,{alpha:0,y:label.y-35,duration:.36},impact);
 },()=>{trail.destroy();effect.destroy();engine.pools.damage.release(label);},1,{owners:[actor,target]});
}
export async function playCooperativeArkeAttack(engine,actor,target,{damage,targetHp,targetShield,critical,onImpact}){
 const epoch=engine.playbackEpoch,[motion,rupture]=await preloadCooperativeArke();
 if(epoch!==engine.playbackEpoch||!engine.visible)return false;
 engine.settlePendingTails([actor,target]);
 const body=actor.fullBodySprite,original={texture:body.texture,scale:{x:body.scale.x,y:body.scale.y},anchor:{x:body.anchor.x,y:body.anchor.y}},clock={time:0};
 const fx=new Sprite(rupture[0]);fx.anchor.set(.5,.75);fx.position.set(target.root.x,target.root.y-15);fx.width=fx.height=210;fx.visible=false;engine.effectLayer.addChild(fx);
 let label;const duration=.92,impact=.53;
 const sample=()=>{
  const t=clock.time,index=Math.min(7,Math.floor(t/duration*8));body.texture=motion[index];body.anchor.set(.5,.88);
  const scale=actor.fullBodyHeight/(motion[0].height*.72);body.scale.set(scale);
  fx.visible=t>=impact;fx.texture=rupture[Math.min(7,Math.floor(Math.max(0,t-impact)/(.39)*8))];fx.alpha=Math.max(0,Math.min(1,(duration-t)/.13));
 };
 const cleanup=()=>{
  if(!body.destroyed){body.texture=original.texture;body.scale.set(original.scale.x,original.scale.y);body.anchor.set(original.anchor.x,original.anchor.y);}
  actor.root.position.set(actor.baseX,actor.baseY);if(label)engine.pools.damage.release(label);fx.destroy();
 };
 const sign=Math.sign(target.root.x-actor.baseX),dx=Math.min(130,Math.abs(target.root.x-actor.baseX)*.2)*sign;
 engine.lastCoopPlayback={kind:'ARKE_SLAM',motionFrames:8,effectFrames:8,clockOwner:'V3_GSAP',impactAt:impact};
 return engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate:sample},0);
  t.to(actor.root,{x:actor.baseX+dx,duration:.24,ease:'power2.in'},.27).to(actor.root,{x:actor.baseX,duration:.25,ease:'power2.out'},.66);
  t.call(()=>{if(epoch!==engine.playbackEpoch)return;if(Number.isFinite(targetHp))engine.syncTargetHp(target,targetHp);if(Number.isFinite(targetShield))engine.syncTargetShield(target,targetShield);onImpact?.();label=damageLabel(engine,target,{damage});t.to(label,{alpha:0,y:label.y-40,duration:.36},impact);},[],impact);
 },cleanup,1,{owners:[actor,target]});
}
export async function playCooperativeArkeMechanic(engine,event){
 const epoch=engine.playbackEpoch,assets=await preloadCooperativeArke();if(epoch!==engine.playbackEpoch||!engine.visible)return false;
 const frames=assets[event.kind==='FOCUS'?2:1],clock={time:0},duration=1.0;
 const entries=(event.hits||[]).map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(e=>e.target?.root&&!e.target.root.destroyed).map(({hit,target})=>{
  applyHit(engine,target,hit);const effect=new Sprite(frames[0]);effect.anchor.set(.5,event.kind==='FOCUS'?.8:.5);
  effect.position.set(target.root.x,target.root.y-(event.kind==='RUPTURE'?target.fullBodyHeight*target.restScale*.5:20));effect.width=effect.height=event.kind==='RUPTURE'?300:event.kind==='FOCUS'?225:160;engine.effectLayer.addChild(effect);
  return {effect,label:damageLabel(engine,target,hit)};
 });
 engine.queueBanner(event.label,event.kind==='RUPTURE'?0xc8ff6b:0xffb86b,'협동 기믹');
 engine.lastCoopPlayback={kind:event.kind,effectFrames:8,clockOwner:'V3_GSAP',targets:entries.length};
 return engine.timeline(t=>{
  t.to(clock,{time:duration,duration,ease:'none',onUpdate:()=>{for(const {effect} of entries){effect.texture=frames[Math.min(7,Math.floor(clock.time/duration*8))];effect.alpha=Math.min(1,(duration-clock.time)/.18);}}},0);
  for(const {label}of entries)t.to(label,{alpha:0,y:label.y-55,duration:.6},.15);
 },()=>{for(const {effect,label}of entries){effect.destroy();engine.pools.damage.release(label);}},1);
}
