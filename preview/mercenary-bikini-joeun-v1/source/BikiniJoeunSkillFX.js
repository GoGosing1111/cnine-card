import {Container,Sprite,Graphics,Assets,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {mercenaryEmission} from '../../project-v-mercenary-system-v1/source/MercenaryAttachmentPoints.js';
import {BIKINI_JOEUN_TRAVEL,bikiniJoeunPoseAt} from '../../../shared/mercenary-bikini-joeun-v1.mjs';
const samplePlan=(plan,time)=>({events:plan.events.filter(e=>e.at<=time),cancelled:plan.events.some(e=>e.kind==='CANCEL'&&e.at<=time)});

const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const mix=(a,b,p)=>a+(b-a)*p;
export async function loadBikiniJoeunAssets(manifest){
 const base='/preview/mercenary-bikini-joeun-v1/';
 const [impact,motion,flash,smoke]=await Promise.all([Assets.load(base+manifest.impact.atlas),Assets.load(base+manifest.motion.atlas),Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/flash.webp'),Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/smoke.webp')]);
 const frames=(tex,spec)=>Array.from({length:spec.frameCount},(_,i)=>new Texture({source:tex.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));
 return {impact:frames(impact,manifest.impact),motion:frames(motion,manifest.motion),flash,smoke};
}
export class BikiniJoeunSkillFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{},{authoritative=false,useAuthoredPose=true}={}){
  Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate,authoritative,useAuthoredPose});
  // The authored pose sheet owns the actor's scale and recoil. Stop the idle
  // loop whose captured master-texture scale would fight the atlas timeline.
  if(useAuthoredPose)merc.animationController.kill();
  this.clock={time:0};this.speed=1;this.destroyed=false;this.timeline=null;this.registration=null;this.activeFrames=[];
  this.layer=new Container({label:'BikiniJoeunSkill:MS-047'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.lines=new Graphics();this.layer.addChild(this.lines);
  this.pool=Array.from({length:42},()=>{const s=new Sprite(assets.flash);s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s});
  const s=merc.fullBodySprite;this.idle={texture:s.texture,width:s.width,height:s.height,anchorX:s.anchor.x,anchorY:s.anchor.y};
  this.bodyHeight=this.idle.height*(manifest.battleSpriteInfo.bounds[3]-manifest.battleSpriteInfo.bounds[1]+1)/manifest.battleSpriteInfo.height;
  this.poses=manifest.motion.frames;this.frame=0;this.makeTimeline();this.render(0);
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 makeTimeline(){
  this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration)}}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this)}
 pause(){this.timeline?.pause();this.onUpdate(this)}
 seek(t){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();this.timeline.pause().time(clamp(t,0,this.plan.duration),true);this.clock.time=clamp(t,0,this.plan.duration);this.render(this.clock.time)}
 setSpeed(speed){this.speed=clamp(Number(speed)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this)}
 setPlan(plan){this.cancel();this.plan=plan;this.makeTimeline();this.render(0)}
 cancel(){this.removeTimeline();this.clock.time=0;this.render(0)}
 applyPose(index,active){
  if(!this.useAuthoredPose){this.frame=-1;return;}
  const s=this.merc.fullBodySprite;
  if(!s||s.destroyed)return;
  if(!active){s.texture=this.idle.texture;s.anchor.set(this.idle.anchorX,this.idle.anchorY);s.width=this.idle.width;s.height=this.idle.height;this.frame=-1;this.syncSpriteScale();return;}
  this.frame=index;s.texture=this.assets.motion[index];s.anchor.set(this.poses[index].footAnchor.x,this.poses[index].footAnchor.y);
  s.height=this.bodyHeight*this.manifest.motion.cellSize/this.poses[0].bodyPixels;s.width=s.height;
  // V3's idle adapter restores its bind scale every render. Capture the new
  // atlas scale so switching a 1536px master to a 640px tile cannot shrink it.
  this.syncSpriteScale();
 }
 syncSpriteScale(){const pose=this.merc.neutralAvatarPose?.mainSprite;if(pose){pose.scaleX=this.merc.fullBodySprite.scale.x;pose.scaleY=this.merc.fullBodySprite.scale.y;}}
 point(actor){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*.54}))}
 muzzle(){
  if(!this.useAuthoredPose)return mercenaryEmission(this.merc,this.engine.effectLayer)||this.point(this.merc);
  const s=this.merc.fullBodySprite,p=this.frame>=0?this.poses[this.frame].muzzle:this.manifest.battleSpriteMuzzle;
  return this.engine.effectLayer.toLocal(s.toGlobal({x:(p.x-s.anchor.x)*s.texture.width,y:(p.y-s.anchor.y)*s.texture.height}));
 }
 render(time){
  if(this.destroyed)return;this.lines.clear();this.pool.forEach(s=>s.visible=false);this.activeFrames=[];this.used=0;
  const state=samplePlan(this.plan,time);this.sample=state;
  this.applyPose(bikiniJoeunPoseAt(time,this.plan),time>0&&time<(this.plan.basic?.82:1.82)&&!state.cancelled);
  this.targets.forEach((a,i)=>{if(!a?.root||a.root.destroyed)return;a.fullBodySprite.tint=0xffffff});
  if(time<=0||time>=this.plan.duration||state.cancelled){this.onUpdate(this);return;}
  const draw=(texture,p,size,{alpha=1,angle=0,tint=0xffffff,blend='normal',height=size}={})=>{
   if(this.used>=this.pool.length)throw Error('BikiniJoeun effect pool exceeded');const s=this.pool[this.used++];s.texture=texture;s.visible=true;s.position.set(p.x,p.y);s.width=size;s.height=height;s.alpha=clamp(alpha);s.rotation=angle;s.tint=tint;s.blendMode=blend;
  };
  const muzzle=this.muzzle(),target=this.point(this.targets[0]);
  for(const e of this.plan.events.filter(e=>e.kind==='SHOT')){
   const age=time-e.at,travel=BIKINI_JOEUN_TRAVEL;
   if(age>=0&&age<travel){const q=age/travel,r=clamp(q-.34);for(const [width,color,alpha]of [[7,0x9271d5,.24],[2,0xa4efff,.95]])this.lines.moveTo(mix(muzzle.x,target.x,r),mix(muzzle.y,target.y,r)).lineTo(mix(muzzle.x,target.x,q),mix(muzzle.y,target.y,q)).stroke({width,color,alpha});}
   if(age>=0&&age<.07)draw(this.assets.flash,muzzle,48,{height:25,alpha:(1-age/.07)*.95,tint:0xc7afff,blend:'add'});
   if(age>=.035&&age<.24)draw(this.assets.smoke,{x:muzzle.x+age*30,y:muzzle.y-age*22},19+age*45,{alpha:(1-age/.24)*.24});
  }
  for(const e of this.plan.events.filter(e=>e.kind==='HIT'||e.kind==='SPLASH')){
   const actor=this.targets[Number(e.target.slice(1))-1];if(!actor)continue;
   const age=time-e.at,p=this.point(actor),final=e.shot===5;
   if(!final){if(age>=0&&age<.11)draw(this.assets.impact[Math.min(2,Math.floor(age/.04))],p,100,{alpha:1-age/.13});}
   else if(age>=-.14&&age<1.3){
    const keys=[[-.14,0],[0,4],[.20,7],[.49,10],[.85,13],[1.3,15]];
    let f=0;for(let k=1;k<keys.length;k++)if(age<=keys[k][0]){const [a,av]=keys[k-1],[b,bv]=keys[k];f=mix(av,bv,(age-a)/(b-a));break;}
    const i=clamp(Math.floor(f),0,15),j=Math.min(15,i+1);this.activeFrames.push({target:e.target,index:i,next:j});
    const body=actor.fullBodyHeight*Math.abs(actor.root.scale.y),size=Math.min(e.kind==='HIT'?320:230,body*(e.kind==='HIT'?2.25:1.7));
    const alpha=age>1.08?clamp((1.3-age)/.22):1;
    draw(this.assets.impact[i],p,size,{alpha});draw(this.assets.impact[j],p,size,{alpha:alpha*(f-i)});
   }
   if(age>=0&&age<.05)actor.fullBodySprite.tint=0xe5d7ff;
  }
  this.onUpdate(this);
 }
 diagnostics(){return {ready:!this.destroyed,time:this.time,playing:this.playing,speed:this.speed,poseFrame:this.frame,muzzle:this.muzzle(),activeFrames:this.activeFrames,visibleSprites:this.pool.filter(s=>s.visible).length,ownedTimelines:this.timeline?1:0,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,clockOwner:'V3_REGISTERED_GSAP',sourceFrames:16,motionFrames:6,damageBudget:this.plan.budget,mode:this.plan.mode,cancelled:this.sample.cancelled,regularAllies:this.engine.allies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='BikiniJoeunSkill:MS-047').length}}
 destroy(){if(this.destroyed)return;this.cancel();this.layer.destroy({children:true});for(const t of [...this.assets.impact,...this.assets.motion])t.destroy(false);this.destroyed=true;this.pool=[]}
}
