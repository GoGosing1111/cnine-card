import {POSES,SKILLS,posePlan,sampleMovement,sampleStep} from './skills.mjs';
export const ROOT='/assets/ui/project-v/mercenaries/razak-20261024/';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,p)=>a+(b-a)*p;
const EFFECT_SCALE=1.65;
export async function loadAssassinAssets(manifest,runtime){
 const assets={motion:{},effects:{}}, {Assets,Texture,Rectangle}=runtime;
 await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(manifest[kind]).map(async([key,spec])=>{
  const atlas=await Assets.load(ROOT+spec.atlas+'?v='+spec.sha256.slice(0,12));
  assets[kind][key]=spec.frames.map((_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));
 })));return assets;
}
export class AssassinFX{
 constructor(engine,merc,assets,manifest,runtime,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,assets,manifest,runtime,onUpdate});
  this.timelineFactory=options=>runtime.timeline(options);
  this.bodyHeight=285;this.speed=2;this.clock={time:0};this.mode='idle';this.plan=posePlan('idle');this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.afterimagesEnabled=true;this.destroyed=false;
  this.targets=(merc.team==='ENEMY'?engine.allies:engine.enemies).filter(a=>a.hp>0);this.targetTints=new Map(this.targets.map(a=>[a,a.fullBodySprite.tint]));
  merc.animationController.kill();merc.animationAdapter?.kill?.();merc.restoreNeutralAvatarPose?.();
  const{Container,Sprite}=runtime;
  this.layer=new Container({label:'AssassinAuthoredFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.effects=Array.from({length:12},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
  this.ghosts=Array.from({length:5},(_,i)=>{const holder=new Container({label:'AssassinPathAfterimage'+i}),sprite=new Sprite();holder.addChild(sprite);holder.visible=false;holder.eventMode='none';engine.combatLayer.addChild(holder);return{holder,sprite};});
  this.captureFormation();this.render(0);merc.captureNeutralAvatarPose?.();
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){
  this.start={x:this.merc.baseX,y:this.merc.baseY};
  // Preserve server target order; contact time indexes the same ordered rows.
  this.merc.applyFacing?.();
  const enemy=this.targets[0];if(!enemy){this.destination={...this.start};return;}const floor=this.merc.root.parent.toLocal(enemy.root.toGlobal({x:0,y:0}));
  const origin=this.merc.root.parent.toLocal(this.merc.view.toGlobal({x:0,y:0})),reach=this.merc.root.parent.toLocal(this.merc.view.toGlobal({x:this.bodyHeight*.43,y:0}));
  this.destination={x:floor.x-(reach.x-origin.x),y:floor.y};
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 configure(mode,{autoplay=true}={}){
  if(!POSES[mode]&&!(mode.startsWith('skill:')&&SKILLS[mode.slice(6)]))throw Error('Unknown preview mode');
  this.removeTimeline();this.mode=mode;this.plan=mode.startsWith('skill:')?SKILLS[mode.slice(6)]:posePlan(mode);this.clock.time=0;
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
  s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(0,0);s.scale.set(this.bodyHeight/f.bodyPixels);s.rotation=0;s.alpha=1;this.pose=pose;this.merc.applyFacing?.();
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral)Object.assign(neutral,{scaleX:s.scale.x,scaleY:s.scale.y,x:0,y:0,rotation:0});
 }
 pathAt(t){const p=sampleMovement(this.plan.movement,clamp(t,0,this.plan.duration));return{x:mix(this.start.x,this.destination.x,p),y:mix(this.start.y,this.destination.y,p),progress:p};}
 ownPoint(x=0,y=0){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal({x,y}));}
 point(actor){const b=actor.fullBodySprite.getLocalBounds();return this.engine.effectLayer.toLocal(actor.fullBodySprite.toGlobal({x:b.x+b.width*.5,y:b.y+b.height*.48}));}
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
   sprite.texture=this.assets.motion[pose.key][pose.frame];sprite.anchor.set(f.footAnchor.x,f.footAnchor.y);sprite.position.copyFrom(this.merc.view.position);sprite.scale.set(this.bodyHeight/f.bodyPixels*this.merc.view.scale.x,this.bodyHeight/f.bodyPixels*this.merc.view.scale.y);sprite.rotation=this.merc.view.rotation;sprite.alpha=.32*(1-i/6);sprite.tint=i%2?0xbfa77b:0xe6d9d2;
   this.afterimageSamples.push({sampleTime:at,pose,x:p.x,y:p.y,progress:p.progress,alpha:sprite.alpha});
  }
 }
 fxFrame(sprite,key,p,point,size,from=0,to=11,alpha=1,contain=false){
  const spec=this.manifest.effects[key],index=clamp(from+Math.floor(clamp(p)*(to-from+1)),from,to);
  sprite.texture=this.assets.effects[key][index];sprite.anchor.set(.5);sprite.position.set(point.x,point.y);sprite.width=sprite.height=size*EFFECT_SCALE;sprite.rotation=0;sprite.alpha=alpha*(this.reducedMotion?.6:1);sprite.visible=true;
  let visualBounds;
  if(contain){
   const b=spec.frames[index].visibleBounds,c=spec.cellSize/2,a=sprite.toGlobal({x:b.left-c,y:b.top-c}),z=sprite.toGlobal({x:b.right-c,y:b.bottom-c}),screen=this.engine.app.screen;
   const dx=a.x<6?6-a.x:z.x>screen.width-6?screen.width-6-z.x:0,dy=a.y<6?6-a.y:z.y>screen.height-6?screen.height-6-z.y:0;
   if(dx||dy){const at=sprite.toGlobal({x:0,y:0}),local=this.layer.toLocal({x:at.x+dx,y:at.y+dy});sprite.position.set(local.x,local.y);}
   visualBounds={left:a.x+dx,top:a.y+dy,right:z.x+dx,bottom:z.y+dy};
  }
  this.activeFrames.push({kind:key,frame:index,x:sprite.x,y:sprite.y,size:size*EFFECT_SCALE,visualBounds});
 }
 effectAt(index){while(this.effects.length<=index){const s=new this.runtime.Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);this.effects.push(s);}return this.effects[index];}
 render(t){
  if(this.destroyed)return;this.clock.time=clamp(t,0,this.plan.duration);t=this.time;
  this.applyPose(this.samplePose(t));const path=this.pathAt(t);this.merc.root.position.set(path.x,path.y);this.merc.root.depthSortY=path.y;
  this.effects.forEach(s=>s.visible=false);this.activeFrames=[];this.contacts=[];this.activeImpacts=0;
  this.targets.forEach(a=>{if(!a.root.destroyed)a.fullBodySprite.tint=this.targetTints.get(a)??0xffffff;});
  this.renderAfterimages(t);this.engine.sortCombatDepth();
  const foot=this.ownPoint(),head=this.ownPoint(0,-this.bodyHeight),unit=Math.hypot(head.x-foot.x,head.y-foot.y);this.currentUnit=unit;
  if(!this.motionOnly){
   let n=0;
   for(const cue of this.plan.effects){
    const pts=cue.target==='area'?this.targets.map(a=>this.point(a)):null;
    const verticalArea=pts&&Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y))>(Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)))*1.4;
    if(verticalArea){
     // In the production mobile formation, the army is tall and narrow.
     // Give every target a full-size expanding slash instead of shrinking the area to its horizontal span.
     for(let i=0;i<pts.length;i++){const start=cue.start+i*.055,end=cue.end+i*.055;if(t<start||t>=end)continue;const p=(t-start)/(end-start);this.fxFrame(this.effectAt(n++),cue.key,p,pts[i],unit*3.15,cue.from,cue.to,p>.85?(1-p)/.15:1,true);}
     continue;
    }
    if(t<cue.start||t>=cue.end)continue;const p=(t-cue.start)/(cue.end-cue.start);
    let point,size=unit*cue.size;
    if(cue.target==='area'){point={x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};size=Math.max(size,Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x))+unit*1.1);size=Math.min(size,this.engine.app.screen.width*.85);}
    else point=this.point(this.targets[cue.target]);
    point={x:point.x,y:point.y+unit*(cue.y||0)};
    this.fxFrame(this.effectAt(n++),cue.key,p,point,size,cue.from,cue.to,p>.85?(1-p)/.15:1,cue.target==='area');
   }
   for(const event of this.plan.hits){
    const age=t-event.at;if(age<0||age>.24)continue;const actor=this.targets[event.target],point=this.point(actor);this.activeImpacts++;this.contacts.push({target:event.target,at:event.at,x:point.x,y:point.y,visualOnly:true});
    if(age<.09)actor.fullBodySprite.tint=0xffdab3;
    if(this.plan.type==='AREA')this.fxFrame(this.effectAt(n++),'cross',age/.24,point,unit*.85,5,11,1-age/.24);
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

