import {POSES,SKILLS,posePlan,sampleStep} from './skills.mjs';
export const ROOT='/assets/ui/project-v/mercenaries/bloodmoon-namsudaeng-20261024/';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
export async function loadBloodmoonAssets(manifest,runtime){
 const assets={motion:{},effects:{}};const{Assets,Texture,Rectangle}=runtime;
 await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(manifest[kind]).map(async([key,spec])=>{
  const atlas=await Assets.load(ROOT+spec.atlas+'?v='+spec.sha256.slice(0,12));
  assets[kind][key]=spec.frames.map((_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));
 })));
 assets.arrow=await Assets.load(ROOT+'assets/locked/approved-arrow.png');return assets;
}
export class BloodmoonFX{
 constructor(engine,merc,assets,manifest,runtime,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,assets,manifest,runtime,onUpdate});
  // Share the production bundle GSAP instance; V3 owns the only live clock.
  this.timelineFactory=runtime.timeline;
  this.bodyHeight=285;this.speed=2;this.clock={time:0};this.mode='idle';this.plan=posePlan('idle');this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.destroyed=false;
  this.targets=engine.enemies.slice();this.targetTints=this.targets.map(a=>a.fullBodySprite.tint);
  this.merc.animationController.kill();this.merc.restoreNeutralAvatarPose?.();
  const{Container,Sprite,Graphics}=runtime;
  this.layer=new Container({label:'BloodmoonAuthoredFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.string=new Graphics();merc.view.addChild(this.string);this.string.zIndex=merc.fullBodySprite.zIndex-.001;merc.view.sortChildren();
  this.nockedArrow=new Sprite(assets.arrow);this.nockedArrow.anchor.set(0,.5);this.nockedArrow.zIndex=merc.fullBodySprite.zIndex+.001;merc.view.addChild(this.nockedArrow);merc.view.sortChildren();
  this.projectiles=Array.from({length:12},()=>{const s=new Sprite(assets.arrow);s.anchor.set(1,.5);s.visible=false;this.layer.addChild(s);return s;});
  this.impacts=Array.from({length:12},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
  this.charge=new Sprite();this.charge.anchor.set(.5);this.charge.visible=false;this.layer.addChild(this.charge);
  this.captureFormation();this.render(0);merc.captureNeutralAvatarPose?.();
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){this.start={x:this.merc.baseX,y:this.merc.baseY};}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 configure(mode,{autoplay=true}={}){
  this.removeTimeline();this.mode=mode;this.plan=mode.startsWith('skill:')?SKILLS[mode.slice(6)]:posePlan(mode);this.clock.time=0;
  if(mode!=='idle'){
   this.timeline=this.timelineFactory({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);this.onUpdate(this);}}).fromTo(this.clock,{time:0},{time:this.plan.duration,duration:this.plan.duration,ease:'none',immediateRender:false}).timeScale(this.speed);
   this.registration={instance:this.timeline,settle:()=>this.cancel()};
  }
  this.render(0);if(autoplay&&mode!=='idle')this.play();
 }
 play(){if(this.mode==='idle')return;if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){this.pause();const value=clamp(t,0,this.plan.duration);this.timeline?.time(value,true);this.clock.time=value;this.render(value);}
 replay(){this.seek(0);this.play();}
 cancel(){if(!this.destroyed)this.configure('idle',{autoplay:false});}
 setSpeed(value){this.speed=clamp(Number(value)||2,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setMotionOnly(on){this.motionOnly=!!on;this.render(this.time);}
 setReducedMotion(on){this.reducedMotion=!!on;this.render(this.time);}
 samplePose(t){
  let step=0;for(let i=0;i<this.plan.poses.length;i++){if(this.plan.poses[i][0]>t)break;step=i;}
  const[start,phase]=this.plan.poses[step],end=this.plan.poses[step+1]?.[0]??this.plan.duration,p=clamp((t-start)/Math.max(.001,end-start));
  let key=phase,from=0,to;
  if(phase==='recover'){key='release';from=2;to=3;}
  if(phase==='drawFast'){key='draw';from=1;to=3;}
  if(phase==='castRelease'){key='cast';from=2;to=3;}
  if(phase==='cast'&&this.mode.startsWith('skill:'))to=1;
  to??=this.manifest.motion[key].frameCount-1;
  return {key,frame:Math.min(to,from+Math.floor(p*(to-from+1))),phase};
 }
 metadata(pose=this.pose){return this.manifest.motion[pose.key].frames[pose.frame];}
 localPoint(point,pose=this.pose){const f=this.metadata(pose),cell=this.manifest.motion[pose.key].cellSize;return{x:(point.x-f.footAnchor.x*cell)*this.bodyHeight/f.bodyPixels,y:(point.y-f.footAnchor.y*cell)*this.bodyHeight/f.bodyPixels};}
 ownPoint(point={x:0,y:0}){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal(point));}
 point(actor){const bounds=actor.fullBodySprite.getLocalBounds(),s=actor.fullBodySprite;return this.engine.effectLayer.toLocal(s.toGlobal({x:bounds.x+bounds.width*.5,y:bounds.y+bounds.height*.48}));}
 muzzle(pose=this.pose){return this.ownPoint(this.localPoint(this.metadata(pose).tip,pose));}
 applyPose(pose){
  const f=this.metadata(pose),s=this.merc.fullBodySprite;
  s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(0,0);s.scale.set(this.bodyHeight/f.bodyPixels);s.rotation=0;s.alpha=1;this.pose=pose;
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral)Object.assign(neutral,{scaleX:s.scale.x,scaleY:s.scale.y,x:0,y:0,rotation:0});
  const a=this.localPoint(f.upperTip),b=this.localPoint(f.lowerTip),hand=this.localPoint(f.hand);
  const drawn=['draw','drawFast','cast'].includes(pose.phase);
  this.string.clear().moveTo(a.x,a.y);if(drawn)this.string.lineTo(hand.x,hand.y);this.string.lineTo(b.x,b.y).stroke({width:.8,color:0xf2a1a8,alpha:.85});
  const grip=this.localPoint(f.grip);this.nockedArrow.visible=drawn;this.nockedArrow.position.set(hand.x,hand.y);this.nockedArrow.rotation=Math.atan2(grip.y-hand.y,grip.x-hand.x);this.nockedArrow.width=this.bodyHeight*.475;this.nockedArrow.height=this.nockedArrow.width*this.assets.arrow.height/this.assets.arrow.width;
 }
 fxFrame(sprite,key,p,point,size,from=0,to){
  const spec=this.manifest.effects[key];to??=spec.frameCount-1;const index=clamp(from+Math.floor(p*(to-from+1)),from,to);
  sprite.texture=this.assets.effects[key][index];const anchor=spec.frames[index].anchor||{x:.5,y:.5};sprite.anchor.set(anchor.x,anchor.y);sprite.width=sprite.height=size; sprite.position.set(point.x,point.y);sprite.rotation=0;sprite.alpha=this.reducedMotion?.6:1;sprite.visible=true;
  this.activeFrames.push({kind:key,frame:index,x:point.x,y:point.y});
 }
 render(time){
  if(this.destroyed)return;this.clock.time=clamp(time,0,this.plan.duration);const t=this.time;this.applyPose(this.samplePose(t));
  const offset=this.mode==='dash'?Math.sin(t/this.plan.duration*Math.PI)*40*(this.reducedMotion?.2:1):0;
  this.merc.root.position.set(this.start.x+offset,this.start.y);this.merc.root.depthSortY=this.merc.root.y;this.engine.sortCombatDepth();
  this.projectiles.forEach(s=>s.visible=false);this.impacts.forEach(s=>s.visible=false);this.charge.visible=false;this.activeFrames=[];this.activeImpacts=0;this.activeProjectiles=0;this.contacts=[];
  this.targets.forEach((a,i)=>a.fullBodySprite.tint=this.targetTints[i]);
  if(!this.motionOnly){
   const foot=this.ownPoint(),head=this.ownPoint({x:0,y:-this.bodyHeight}),unit=Math.hypot(head.x-foot.x,head.y-foot.y);
   const charge=this.plan.charge;
   if(charge&&t>=charge[0]&&t<charge[1]+.24){const p=t<charge[1]?(t-charge[0])/(charge[1]-charge[0])*2/3:2/3+(t-charge[1])/.24/3;this.fxFrame(this.charge,'charge',p,this.muzzle(),unit*.72);}
   for(let i=0;i<this.plan.shots.length;i++){
    const event=this.plan.shots[i],target=this.targets[event.target%this.targets.length],hit=this.point(target),releasePose=this.samplePose(event.release+.001),origin=this.muzzle(releasePose),rain=event.variant==='rain'&&!event.sky;
    const start=rain?{x:hit.x-unit*.42,y:Math.max(28,hit.y-unit*1.9)}:origin;
    const end=event.sky?{x:origin.x+unit*.8,y:Math.max(20,origin.y-unit*1.25)}:hit;
    const p=(t-event.release)/(event.hit-event.release);
    if(p>=0&&p<1){const s=this.projectiles[i];s.position.set(mix(start.x,end.x,p),mix(start.y,end.y,p));s.rotation=Math.atan2(end.y-start.y,end.x-start.x);s.width=unit*(rain?.8:1.05);s.height=s.width*this.assets.arrow.height/this.assets.arrow.width;s.alpha=this.reducedMotion?.75:1;s.visible=true;this.activeProjectiles++;
     if(!event.sky&&p>.7&&['pierce','rain'].includes(event.variant))this.fxFrame(this.impacts[i],event.variant,(p-.7)/.3,{x:s.x,y:s.y},unit*(rain?1.18:1.32),0,rain?2:1);
    }
    const impact=(t-event.hit)/.7;
    if(!event.sky&&impact>=0&&impact<1){this.fxFrame(this.impacts[i],event.variant,impact,hit,unit*(rain?1.18:event.variant==='pierce'?1.32:.92),rain?3:event.variant==='pierce'?2:0);this.activeImpacts++;if(impact<.2)target.fullBodySprite.tint=0xffa5b1;this.contacts.push({target:event.target,x:hit.x,y:hit.y,at:event.hit,error:Math.hypot(end.x-hit.x,end.y-hit.y)});}
   }
  }
  this.onUpdate(this);
 }
 diagnostics(){
  const f=this.metadata(),s=this.merc.fullBodySprite,e=this.engine,b=f.visibleBounds,cell=this.manifest.motion[this.pose.key].cellSize;
  const screen=(x,y)=>this.merc.view.toGlobal({x:(x-cell*f.footAnchor.x)*s.scale.x,y:(y-cell*f.footAnchor.y)*s.scale.y}),a=screen(b.left,b.top),z=screen(b.right,b.bottom);
  return{ready:!this.destroyed,mode:this.mode,time:this.time,duration:this.plan.duration,pose:this.pose,playing:this.playing,speed:this.speed,motionOnly:this.motionOnly,reduced:this.reducedMotion,activeEffects:this.activeFrames.length,activeImpacts:this.activeImpacts,activeProjectiles:this.activeProjectiles,effectFrames:this.activeFrames,contacts:this.contacts,actorBounds:{left:a.x,top:a.y,right:z.x,bottom:z.y},bodyRegistration:{physicalBodyHeight:this.bodyHeight,renderedBodyReference:f.bodyPixels*s.scale.y,uniformScale:s.scale.x===s.scale.y,footAnchor:f.footAnchor},idleBodyFixed:true,idleFrame:0,idleControllerTimeline:!!this.merc.animationController.timeline,regularAllies:e.allies.length,regularEnemies:e.enemies.length,mercenaryInRegularArray:e.allies.includes(this.merc),formationSlot:{x:this.merc.baseX,y:this.merc.baseY,scale:this.merc.restScale},registeredTimelines:e.simpleTimelines.size,counts:this.manifest.counts,targets:this.targets.length,visualOnly:true,clockOwner:'DEPLOYED_V3_GSAP',clockSource:'LIVE_BATTLE_ANIMATION_TIMELINE_CONSTRUCTOR',damageAuthority:'NONE_VISUAL_ONLY',cue:sampleStep(this.plan.cues,this.time),name:POSES[this.mode]||this.plan.name};
 }
 destroy(){if(this.destroyed)return;this.removeTimeline();this.targets.forEach((a,i)=>{if(!a.root.destroyed)a.fullBodySprite.tint=this.targetTints[i]});this.string.destroy();this.nockedArrow.destroy();this.layer.destroy({children:true});this.destroyed=true;}
}
