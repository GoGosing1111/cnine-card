import {POSES,SKILLS,posePlan,sampleMovement,sampleStep} from './skills.mjs';
export const ROOT='/assets/ui/project-v/mercenaries/awakened-omega-20261024/';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,p)=>a+(b-a)*p;
const EFFECT_SCALE=1.0;
export async function loadOmegaEvolvedAssets(manifest,runtime){
 const assets={motion:{},effects:{}}, {Assets,Texture,Rectangle}=runtime;
 await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(manifest[kind]).map(async([key,spec])=>{
  const atlas=await Assets.load(ROOT+spec.atlas+'?v='+spec.sha256.slice(0,12));
  assets[kind][key]=spec.frames.map((_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));
 })));return assets;
}
export class OmegaEvolvedFX{
 constructor(engine,merc,assets,manifest,runtime,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,assets,manifest,runtime,onUpdate});
  this.timelineFactory=runtime.timeline;
  this.bodyHeight=330;this.speed=2;this.clock={time:0};this.mode='idle';this.plan=posePlan('idle');this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.afterimagesEnabled=true;this.destroyed=false;
  this.targets=[];this.targetTints=new Map(this.targets.map(a=>[a,a.fullBodySprite.tint]));
  merc.animationController.kill();merc.animationAdapter?.kill?.();merc.restoreNeutralAvatarPose?.();
  const{Container,Sprite}=runtime;
  this.layer=new Container({label:'OmegaEvolvedAuthoredFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.effects=Array.from({length:24},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
  this.ghosts=Array.from({length:5},(_,i)=>{const holder=new Container({label:'OmegaEvolvedPathAfterimage'+i}),sprite=new Sprite();holder.addChild(sprite);holder.visible=false;holder.eventMode='none';engine.combatLayer.addChild(holder);return{holder,sprite};});
  this.captureFormation();this.render(0);merc.captureNeutralAvatarPose?.();
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){
  this.start={x:this.merc.baseX,y:this.merc.baseY};
  if(!this.targets.length){this.destination={...this.start};return;}
  const enemy=this.targets[0],floor=this.merc.root.parent.toLocal(enemy.root.toGlobal({x:0,y:0}));
  const key=this.mode?.startsWith('skill:')?this.mode.slice(6):this.manifest.motion[this.mode]?this.mode:'cleave';
  const spec=this.manifest.motion[key==='idle'?'cleave':key],frame=spec.frames[3],cell=spec.cellSize,k=this.bodyHeight/frame.bodyPixels;
  const bladePoint={x:mix(frame.bladeRoot.x,frame.contactPoint.x,.72),y:mix(frame.bladeRoot.y,frame.contactPoint.y,.72)};
  const localTip={x:(bladePoint.x-cell*frame.footAnchor.x)*k,y:(bladePoint.y-cell*frame.footAnchor.y)*k};
  const origin=this.merc.root.parent.toLocal(this.merc.view.toGlobal({x:0,y:0})),reach=this.merc.root.parent.toLocal(this.merc.view.toGlobal(localTip));
  const targetBounds=enemy.fullBodySprite.getLocalBounds(),targetCenter=this.merc.root.parent.toLocal(enemy.fullBodySprite.toGlobal({x:targetBounds.x+targetBounds.width*.5,y:targetBounds.y+targetBounds.height*.45}));
  this.destination={x:targetCenter.x-(reach.x-origin.x),y:targetCenter.y-(reach.y-origin.y)};
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 configure(mode,{autoplay=true}={}){
  if(!POSES[mode]&&!(mode.startsWith('skill:')&&SKILLS[mode.slice(6)]))throw Error('Unknown preview mode');
  this.removeTimeline();this.mode=mode;this.plan=mode.startsWith('skill:')?SKILLS[mode.slice(6)]:posePlan(mode);this.clock.time=0;this.captureFormation();
  if(mode!=='idle'){
   this.timeline=this.timelineFactory({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);}}).fromTo(this.clock,{time:0},{time:this.plan.duration,duration:this.plan.duration,ease:'none',immediateRender:false}).timeScale(this.speed);
   this.registration={instance:this.timeline,settle:()=>this.cancel()};
  }
  this.render(0);if(autoplay&&mode!=='idle')this.play();
 }
 play(){if(this.mode==='idle')return;if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){this.pause();const v=clamp(Number(t)||0,0,this.plan.duration);this.timeline?.time(v,true);this.clock.time=v;this.render(v);}
 replay(){this.seek(0);this.play();}
 cancel(){if(!this.destroyed)this.configure('idle',{autoplay:false});}
 setSpeed(v){this.speed=clamp(Number(v)||2,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setMotionOnly(on){this.motionOnly=!!on;this.render(this.time);}
 setReducedMotion(on){this.reducedMotion=!!on;this.render(this.time);}
 setAfterimages(on){this.afterimagesEnabled=!!on;this.render(this.time);}
 samplePose(t){
  let step=0;for(let i=0;i<this.plan.poses.length;i++){if(this.plan.poses[i][0]>t)break;step=i;}
  const[start,key,fixed]=this.plan.poses[step],end=this.plan.poses[step+1]?.[0]??this.plan.duration,count=this.manifest.motion[key].frameCount;
  return{key,frame:key==='idle'?0:fixed??Math.min(count-1,Math.floor(clamp((t-start)/Math.max(.001,end-start))*count))};
 }
 applyPose(pose){
  const f=this.manifest.motion[pose.key].frames[pose.frame],s=this.merc.fullBodySprite;
  s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(0,0);s.scale.set(this.bodyHeight/f.bodyPixels);s.rotation=0;s.alpha=1;this.pose=pose;
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral)Object.assign(neutral,{scaleX:s.scale.x,scaleY:s.scale.y,x:0,y:0,rotation:0});
 }
 pathAt(t){const p=sampleMovement(this.plan.movement,clamp(t,0,this.plan.duration));return{x:mix(this.start.x,this.destination.x,p),y:mix(this.start.y,this.destination.y,p),progress:p};}
 ownPoint(x=0,y=0){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal({x,y}));}
 point(actor){const b=actor.fullBodySprite.getLocalBounds();return this.engine.effectLayer.toLocal(actor.fullBodySprite.toGlobal({x:b.x+b.width*.5,y:b.y+b.height*.48}));}
 bladePoint(fraction=.32){
  const spec=this.manifest.motion[this.pose.key],f=spec.frames[this.pose.frame],s=this.merc.fullBodySprite;
  const x=mix(f.bladeRoot.x,f.contactPoint.x,fraction),y=mix(f.bladeRoot.y,f.contactPoint.y,fraction);
  return this.ownPoint((x-spec.cellSize*f.footAnchor.x)*s.scale.x,(y-spec.cellSize*f.footAnchor.y)*s.scale.y);
 }
 renderAfterimages(t){
  this.afterimageSamples=[];
  for(let i=0;i<this.ghosts.length;i++){
   const{holder,sprite}=this.ghosts[i];holder.visible=false;
   if(this.motionOnly||this.reducedMotion||!this.afterimagesEnabled||this.mode==='idle')continue;
   const delay=(i+1)*.035,at=t-delay;if(at<0)continue;
   const before=this.pathAt(Math.max(0,at-.018)),p=this.pathAt(at),now=this.pathAt(t);
   if(Math.abs(p.progress-before.progress)<.008||Math.hypot(p.x-now.x,p.y-now.y)<3)continue;
   const pose=this.samplePose(at),f=this.manifest.motion[pose.key].frames[pose.frame];
   holder.position.set(p.x,p.y);holder.scale.copyFrom(this.merc.root.scale);holder.depthSortY=p.y-.1-i*.002;holder.visible=true;
   sprite.texture=this.assets.motion[pose.key][pose.frame];sprite.anchor.set(f.footAnchor.x,f.footAnchor.y);sprite.position.copyFrom(this.merc.view.position);sprite.scale.set(this.bodyHeight/f.bodyPixels*this.merc.view.scale.x,this.bodyHeight/f.bodyPixels*this.merc.view.scale.y);sprite.rotation=this.merc.view.rotation;sprite.alpha=.32*(1-i/6);sprite.tint=i%2?0xb685ff:0xbdecff;
   this.afterimageSamples.push({sampleTime:at,pose,x:p.x,y:p.y,progress:p.progress,alpha:sprite.alpha});
  }
 }
 fxFrame(sprite,key,p,point,size,from=0,to=7,alpha=1,contain=false,options={}){
  const spec=this.manifest.effects[key],last=spec.frameCount-1;
  from=clamp(from,0,last);to=clamp(to,from,last);
  const index=clamp(from+Math.floor(clamp(p)*(to-from+1)),from,to);
  // Skill sprites render in the production foreground effect layer.
  const parent=this.layer;if(sprite.parent!==parent)parent.addChild(sprite);
  const position=parent.toLocal(this.engine.effectLayer.toGlobal(point));
  const converted=parent.toLocal(this.engine.effectLayer.toGlobal({x:point.x+size,y:point.y}));
  const localSize=Math.hypot(converted.x-position.x,converted.y-position.y)*EFFECT_SCALE;
  sprite.texture=this.assets.effects[key][index];sprite.anchor.set(.5);sprite.position.set(position.x,position.y);sprite.width=sprite.height=localSize;sprite.rotation=0;sprite.alpha=alpha*(this.reducedMotion?.6:1);sprite.blendMode=options.blend||'normal';sprite.visible=true;if(this.merc.team==='ENEMY')sprite.scale.x*=-1;
  let visualBounds;
  if(contain){
   const b=spec.frames[index].visibleBounds,c=spec.cellSize/2,p1=sprite.toGlobal({x:b.left-c,y:b.top-c}),p2=sprite.toGlobal({x:b.right-c,y:b.bottom-c}),a={x:Math.min(p1.x,p2.x),y:Math.min(p1.y,p2.y)},z={x:Math.max(p1.x,p2.x),y:Math.max(p1.y,p2.y)},screen=this.engine.app.screen;
   const dx=a.x<6?6-a.x:z.x>screen.width-6?screen.width-6-z.x:0,dy=a.y<6?6-a.y:z.y>screen.height-6?screen.height-6-z.y:0;
   if(dx||dy){const at=sprite.toGlobal({x:0,y:0}),local=parent.toLocal({x:at.x+dx,y:at.y+dy});sprite.position.set(local.x,local.y);}
   visualBounds={left:a.x+dx,top:a.y+dy,right:z.x+dx,bottom:z.y+dy};
  }
  this.activeFrames.push({kind:key,frame:index,x:point.x,y:point.y,size:size*EFFECT_SCALE,layer:'front',visualBounds});
 }
 render(t){
  if(this.destroyed)return;this.clock.time=clamp(t,0,this.plan.duration);t=this.time;
  this.applyPose(this.samplePose(t));const path=this.pathAt(t);this.merc.root.position.set(path.x,path.y);this.merc.root.depthSortY=path.y;
  this.effects.forEach(s=>s.visible=false);this.activeFrames=[];this.contacts=[];this.activeImpacts=0;
  this.targets.forEach(a=>a.fullBodySprite.tint=this.targetTints.get(a));
  this.renderAfterimages(t);this.engine.sortCombatDepth();
  const foot=this.ownPoint(),head=this.ownPoint(0,-this.bodyHeight),unit=Math.hypot(head.x-foot.x,head.y-foot.y);this.currentUnit=unit;
  if(!this.motionOnly){
   let n=0;
   for(const cue of this.plan.effects){
    if(!this.manifest.effects[cue.key])continue;
    if(t<cue.start||t>=cue.end)continue;const p=(t-cue.start)/(cue.end-cue.start);
    let point,size=unit*cue.size*(this.manifest.effects[cue.key].displayCompensation||1);
    if(cue.target==='area'){
     const pts=this.targets.map(a=>this.point(a)),spanX=Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),spanY=Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y));
     point={x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};
     // A single formation-wide celestial composition; individual impacts mark
     // all five targets. Mobile no longer repeats the full AoE five times.
     size=Math.max(size,spanX+unit*1.5,spanY+unit*1.2);
     const screen=this.engine.app.screen,tl=this.engine.effectLayer.toLocal({x:0,y:0}),br=this.engine.effectLayer.toLocal({x:screen.width,y:screen.height});
     size=Math.min(size,Math.abs(br.x-tl.x)*.94,Math.abs(br.y-tl.y)*.8);
    }else if(cue.target==='blade')point=this.bladePoint(cue.bladeFraction??.32);
    else point=this.point(this.targets[cue.target]);
    point={x:point.x,y:point.y+unit*(cue.y||0)};
    const fade=p>.82?(1-p)/.18:1;
    this.fxFrame(this.effects[n++],cue.key,p,point,size,cue.from,cue.to,fade*(cue.alpha??1),true,{layer:cue.layer,blend:cue.blend});
   }
   for(const event of this.plan.hits){
    const age=t-event.at;if(age<0||age>.24)continue;const actor=this.targets[event.target],point=this.point(actor);this.activeImpacts++;this.contacts.push({target:event.target,at:event.at,x:point.x,y:point.y,visualOnly:true});
    if(age<.07)actor.fullBodySprite.tint=0xd7eaff;
    this.fxFrame(this.effects[n++],'impact',age/.24,point,unit*(this.plan.type==='AREA'?1.25:1.65),0,7,1-age/.3,true,{blend:'add'});
   }
  }
  this.onUpdate(this);
 }
 diagnostics(){
  const f=this.manifest.motion[this.pose.key].frames[this.pose.frame],s=this.merc.fullBodySprite,b=f.visibleBounds,cell=this.manifest.motion[this.pose.key].cellSize;
  const screen=(x,y)=>this.merc.view.toGlobal({x:(x-cell*f.footAnchor.x)*s.scale.x,y:(y-cell*f.footAnchor.y)*s.scale.y}),a=screen(b.left,b.top),z=screen(b.right,b.bottom);
  return{ready:!this.destroyed,mode:this.mode,time:this.time,duration:this.plan.duration,pose:this.pose,playing:this.playing,speed:this.speed,motionOnly:this.motionOnly,reduced:this.reducedMotion,afterimagesEnabled:this.afterimagesEnabled,afterimages:this.afterimageSamples.length,afterimageSamples:this.afterimageSamples,activeEffects:this.activeFrames.length,activeImpacts:this.activeImpacts,effectFrames:this.activeFrames,contacts:this.contacts,actorBounds:{left:a.x,top:a.y,right:z.x,bottom:z.y},bodyRegistration:{physicalBodyHeight:this.bodyHeight,renderedBodyReference:f.bodyPixels*s.scale.y,uniformScale:s.scale.x===s.scale.y,footAnchor:f.footAnchor},idleBodyFixed:true,idleFrame:0,idleControllerTimeline:!!this.merc.animationController.timeline,regularAllies:this.engine.allies.length,regularEnemies:this.engine.enemies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),formationSlot:{x:this.merc.baseX,y:this.merc.baseY,scale:this.merc.restScale},position:{x:this.merc.root.x,y:this.merc.root.y},destination:this.destination,registeredTimelines:this.engine.simpleTimelines.size,counts:this.manifest.counts,visualOnly:true,clockOwner:'DEPLOYED_V3_GSAP',damageAuthority:'NONE_VISUAL_ONLY',cue:sampleStep(this.plan.cues,this.time),name:POSES[this.mode]||this.plan.name};
 }
 destroy(){if(this.destroyed)return;this.removeTimeline();this.targets.forEach(a=>{if(!a.root.destroyed)a.fullBodySprite.tint=this.targetTints.get(a)});this.ghosts.forEach(g=>g.holder.destroy({children:true}));this.layer.destroy({children:true});for(const kind of ['motion','effects'])for(const list of Object.values(this.assets[kind]))for(const texture of list)texture.destroy(false);this.destroyed=true;}
}
