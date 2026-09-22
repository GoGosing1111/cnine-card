import {Container,Sprite,Graphics,Assets,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {sample} from '../skill.mjs';
const ROOT='/preview/mercenary-black-moon-swordsman-ss-v1/',mix=(a,b,t)=>a+(b-a)*t,clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export async function loadBlackMoonAssets(manifest){
 const assets={motion:{},effects:{}};
 const load=async spec=>{const source=await Assets.load(ROOT+spec.source);return spec.frames.map(f=>new Texture({source:source.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));};
 await Promise.all([...Object.entries(manifest.motion).map(async([k,s])=>{assets.motion[k]=await load(s);}),...Object.entries(manifest.effects).map(async([k,s])=>{assets.effects[k]=await load(s);})]);
 assets.flash=await Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/flash.webp');return assets;
}
export class BlackMoonFX{
 constructor(engine,merc,target,assets,manifest,plan,onUpdate=()=>{},{useAuthoredPose=true}={}){
  Object.assign(this,{engine,merc,target,assets,manifest,plan,onUpdate});
  this.useAuthoredPose=useAuthoredPose;
  merc.animationController.kill();this.clock={time:0};this.speed=1;this.destroyed=false;this.registration=null;this.timeline=null;
  const s=merc.fullBodySprite;this.idle={texture:s.texture,width:s.width,height:s.height,anchorX:s.anchor.x,anchorY:s.anchor.y,mask:s.mask};
  this.bodyHeight=this.idle.height*manifest.bodyPixels/manifest.battleSpriteInfo.height;
  this.poseMask=new Graphics({label:'BlackMoonPoseMask'});merc.view.addChild(this.poseMask);this.poseMask.visible=false;
  this.layer=new Container({label:'BlackMoonSkillFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.ground=new Graphics();this.layer.addChild(this.ground);
  this.pool=Array.from({length:8},()=>{const p=new Sprite();p.anchor.set(.5);p.visible=false;this.layer.addChild(p);return p;});
  this.targetDefault={x:target.view.x,tint:target.fullBodySprite.tint};this.captureFormation();this.makeTimeline();this.render(0);
 }
 get time(){return this.clock.time;}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration;}
 captureFormation(){
  this.start={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};
  this.destinations=['descending','rising','finisher'].map(key=>{
   const spec=this.manifest.motion[key],f=spec.frames[spec.contact.frame],point=this.merc.root.parent.toLocal(this.target.root.toGlobal({x:0,y:-this.target.fullBodyHeight*spec.contact.targetHeightFraction})),scale=this.bodyHeight/spec.bodyPixels;
   return{x:point.x-(spec.contact.point.x-f.foot.x)*scale*this.merc.root.scale.x*this.merc.view.scale.x,y:point.y-(spec.contact.point.y-f.foot.y)*scale*this.merc.root.scale.y*this.merc.view.scale.y};
  });
 }
 makeTimeline(){
  this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);}}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();t=clamp(t,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setSpeed(speed){this.speed=clamp(Number(speed)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setPlan(plan){this.cancel();this.plan=plan;this.makeTimeline();this.render(0);}
 cancel(){this.removeTimeline();this.clock.time=0;this.render(0);}
 point(actor,fraction=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*fraction}));}
 applyPose(pose){
  if(!this.useAuthoredPose)return;
  const s=this.merc.fullBodySprite;this.poseMask.clear();
  if(!pose){s.texture=this.idle.texture;s.anchor.set(this.idle.anchorX,this.idle.anchorY);s.width=this.idle.width;s.height=this.idle.height;s.mask=this.idle.mask;this.poseMask.visible=false;}
  else{
   const spec=this.manifest.motion[pose.key],f=spec.frames[pose.frame];s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.foot.x/f.rect.width,f.foot.y/f.rect.height);s.scale.set(this.bodyHeight/spec.bodyPixels);
   const points=f.mask.map((v,i)=>v-(i%2?f.foot.y:f.foot.x));this.poseMask.poly(points).fill(0xffffff);this.poseMask.position.copyFrom(s.position);this.poseMask.scale.copyFrom(s.scale);this.poseMask.rotation=s.rotation;this.poseMask.visible=true;s.mask=this.poseMask;
  }
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral){neutral.scaleX=s.scale.x;neutral.scaleY=s.scale.y;}
 }
 positionFor(s){
  const a=Math.floor(s.destination),b=Math.min(2,a+1),q=s.destination-a,d={x:mix(this.destinations[a].x,this.destinations[b].x,q),y:mix(this.destinations[a].y,this.destinations[b].y,q)};
  return{x:mix(this.start.x,d.x,s.travel),y:mix(this.start.y,d.y,s.travel)};
 }
 draw(texture,p,width,{height=width,alpha=1,anchor={x:.5,y:.5},tint=0xffffff,blend='normal'}={}){
  const s=this.pool[this.used++];if(!s)throw Error('Effect sprite pool exhausted');s.texture=texture;s.position.set(p.x,p.y);s.anchor.set(anchor.x,anchor.y);s.width=width;s.height=height;s.alpha=alpha;s.tint=tint;s.blendMode=blend;s.visible=alpha>0;return s;
 }
 render(time){
  if(this.destroyed)return;if(this.merc.root.destroyed||this.target.root.destroyed){this.removeTimeline();return;}this.pool.forEach(s=>s.visible=false);this.used=0;this.ground.clear();const state=sample(this.plan,time);this.sample=state;
  this.applyPose(state.pose);const p=this.positionFor(state);this.merc.root.position.set(p.x,p.y);
  this.target.view.x=this.targetDefault.x+state.recoil;this.target.fullBodySprite.tint=state.flash>0?0xffebba:this.targetDefault.tint;this.engine.sortCombatDepth();
  if(state.cancelled||state.done||time<=0){this.onUpdate(this);return;}
  const unit=this.target.fullBodyHeight*Math.abs(this.target.root.scale.y),foot=this.point(this.target);
  if(state.effect){
   const f=state.effect.frame,i=Math.floor(f),j=Math.min(15,i+1),q=f-i,heights=[.25,.72,.6],a=Math.floor(state.destination),b=Math.min(2,a+1);
   const impact=this.point(this.target,mix(heights[a],heights[b],state.destination-a)),size=Math.min(unit*2.35,this.engine.scene.width*.42);
   this.draw(this.assets.effects.triple[i],impact,size,{alpha:state.effect.alpha*(1-q)});
   if(q>0)this.draw(this.assets.effects.triple[j],impact,size,{alpha:state.effect.alpha*q});
   if(state.flash>0)this.draw(this.assets.flash,impact,unit*.55,{alpha:state.flash*2.8,tint:0xffe7a3,blend:'add'});
   const age=time-(this.plan.mode==='skill'?1.92:.72);if(age>0&&age<.62){const r=unit*(.3+age*1.45);this.ground.ellipse(foot.x,foot.y,r,r*.24).stroke({color:0xe9c681,width:1.5,alpha:(1-age/.62)*.5});}
  }
  this.onUpdate(this);
 }
 diagnostics(){return{ready:!this.destroyed,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,effect:this.sample.effect,cancelled:this.sample.cancelled,visibleSprites:this.pool.filter(s=>s.visible).length,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,ownedTimelines:this.timeline?1:0,regularAllies:this.engine.allies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),clockOwner:'V3_REGISTERED_GSAP',motionFrames:12,effectFrames:16,damageAuthority:this.plan.damageAuthority,actorFoot:this.point(this.merc),targetFoot:this.point(this.target),effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='BlackMoonSkillFX').length};}
 destroy(){if(this.destroyed)return;this.cancel();this.merc.fullBodySprite.mask=this.idle.mask;this.poseMask.destroy();this.layer.destroy({children:true});for(const group of[...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const texture of group)texture.destroy(false);this.destroyed=true;this.pool=[];}
}
