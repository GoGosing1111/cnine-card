import {plan} from './skills.mjs';
export const ROOT='/assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,p)=>a+(b-a)*p;
export async function loadAssets(spec,runtime){
 const {Assets,Texture,Rectangle}=runtime;
 const [idle,body,fx,secondary]=await Promise.all([spec.motion.idle.file,spec.motionAtlas.file,spec.effects.file,spec.secondaryEffects.file].map(file=>Assets.load(ROOT+file)));
 const frames=spec.motionAtlas.frames.map((_,i)=>new Texture({source:body.source,frame:new Rectangle(i%2*768,Math.floor(i/2)*768,768,768)}));
 const motion={idle:[idle]};for(const key of ['attack','dash','hit','defeat'])motion[key]=spec.motion[key].frames.map(f=>frames[f.atlasIndex]);
 const effectBank=(texture,def)=>def.frames.map((_,i)=>new Texture({source:texture.source,frame:new Rectangle(i%4*def.cellSize,Math.floor(i/4)*def.cellSize,def.cellSize,def.cellSize)}));
 return {motion,effects:effectBank(fx,spec.effects),secondaryEffects:effectBank(secondary,spec.secondaryEffects)};
}
export class BlackCrownFX{
 constructor(engine,merc,assets,spec,runtime,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,assets,spec,runtime,onUpdate});this.bodyHeight=spec.bodyHeight;this.clock={time:0};this.speed=2;this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.mode='idle';this.plan=plan(spec.id,'idle');this.targets=[];this.tints=this.targets.map(t=>t.fullBodySprite.tint);
  merc.animationController.kill();merc.animationAdapter?.kill?.();merc.restoreNeutralAvatarPose?.();this.timelineFactory=runtime.timeline;
  this.layer=new runtime.Container({label:'BlackCrownAuthoredFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.sprites=Array.from({length:12},()=>{const s=new runtime.Sprite();s.visible=false;this.layer.addChild(s);return s;});
  this.captureFormation();this.render(0);merc.captureNeutralAvatarPose?.();
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){this.start={x:this.merc.baseX,y:this.merc.baseY};}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 configure(mode,{autoplay=true}={}){
  this.removeTimeline();this.mode=mode;this.plan=plan(this.spec.id,mode);this.clock.time=0;
  if(mode!=='idle'){
   this.timeline=this.timelineFactory({paused:true,onUpdate:()=>this.render(this.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);this.onUpdate(this);}}).fromTo(this.clock,{time:0},{time:this.plan.duration,duration:this.plan.duration,ease:'none',immediateRender:false}).timeScale(this.speed);
   this.registration={instance:this.timeline,settle:()=>this.cancel()};
  }
  this.render(0);if(autoplay&&mode!=='idle')this.play();
 }
 play(){if(this.mode==='idle')return;if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){this.pause();const v=clamp(t,0,this.plan.duration);this.timeline?.time(v,true);this.clock.time=v;this.render(v);}
 replay(){this.seek(0);this.play();}
 cancel(){if(!this.destroyed)this.configure('idle',{autoplay:false});}
 setSpeed(v){this.speed=clamp(Number(v)||2,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setMotionOnly(v){this.motionOnly=!!v;this.render(this.time);}
 setReducedMotion(v){this.reducedMotion=!!v;this.render(this.time);}
 sample(t){let p=this.plan.poses[0];for(const row of this.plan.poses){if(row[0]>t)break;p=row;}return {key:p[1],frame:p[2]};}
 metadata(pose=this.pose){return this.spec.motion[pose.key].frames[pose.frame];}
 applyPose(pose){
  this.pose=pose;const f=this.metadata(),s=this.merc.fullBodySprite;s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.foot.x/f.width,f.foot.y/f.height);s.position.set(0,0);s.rotation=0;s.alpha=1;s.scale.set(this.bodyHeight/f.bodyPixels);
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral)Object.assign(neutral,{scaleX:s.scale.x,scaleY:s.scale.y,x:0,y:0,rotation:0});
 }
 ownPoint(local={x:0,y:0}){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal(local));}
 emission(pose){const f=this.metadata(pose),p=f.emission||{x:f.foot.x,y:f.foot.y-f.bodyPixels*.7};return this.ownPoint({x:(p.x-f.foot.x)*this.bodyHeight/f.bodyPixels,y:(p.y-f.foot.y)*this.bodyHeight/f.bodyPixels});}
 targetPoint(actor){const s=actor.fullBodySprite,b=s.getLocalBounds();return this.engine.effectLayer.toLocal(s.toGlobal({x:b.x+b.width*.5,y:b.y+b.height*.48}));}
 targetGroundPoint(actor){return this.engine.effectLayer.toLocal(actor.view.toGlobal({x:0,y:0}));}
 drawFx(slot,index,point,size,{alpha=1,rotation=0,anchor}={}){
  const bank=this.plan.effectBank==='secondary'?'secondaryEffects':'effects',s=this.sprites[slot],f=this.spec[bank].frames[index];s.texture=this.assets[bank][index];s.anchor.set(anchor?.x??f.anchor.x,anchor?.y??f.anchor.y);s.scale.set(size/f.width);s.position.set(point.x,point.y);s.rotation=rotation;s.alpha=alpha*(this.reducedMotion?.65:1);s.visible=true;this.effectFrames.push({bank,index,x:point.x,y:point.y});
 }
 render(time){
  if(this.destroyed)return;this.clock.time=clamp(time,0,this.plan.duration);const t=this.time,e=this.engine,m=this.merc;
  this.applyPose(this.sample(t));m.root.position.set(this.start.x,this.start.y);
  if(this.mode==='dash')m.root.x+=Math.sin(t/this.plan.duration*Math.PI)*35;
  if(this.spec.id==='diim'&&this.mode==='skill'&&this.targets.length){
   const amount=t<1.25?0:t<1.65?(t-1.25)/.4:t<2?1:t<2.8?1-(t-2)/.8:0;
   const end=this.targetPoint(this.targets[this.plan.shots.find(s=>s.melee)?.target??0]),start=this.emission({key:'attack',frame:2});
   const toCombat=p=>e.combatLayer.toLocal(e.effectLayer.toGlobal(p)),a=toCombat(start),b=toCombat(end);m.root.x+=amount*(b.x-a.x);m.root.y+=amount*(b.y-a.y);
  }
  m.root.depthSortY=m.root.y;e.sortCombatDepth();this.sprites.forEach(s=>s.visible=false);this.effectFrames=[];this.contacts=[];this.activeProjectiles=0;this.activeImpacts=0;this.targets.forEach((n,i)=>n.fullBodySprite.tint=this.tints[i]);
  const foot=this.ownPoint(),head=this.ownPoint({x:0,y:-this.bodyHeight}),unit=Math.hypot(head.x-foot.x,head.y-foot.y);
  if(!this.motionOnly){
   for(let i=0;i<this.plan.shots.length;i++){
    const shot=this.plan.shots[i],target=this.targets[shot.target],end=shot.ground?this.targetGroundPoint(target):this.targetPoint(target),start=shot.fromTarget!=null?this.targetPoint(this.targets[shot.fromTarget]):this.emission({key:'attack',frame:shot.pose}),age=t-shot.release;
    if(!shot.melee&&!shot.suppressMuzzle&&age>=0&&age<.16)this.drawFx(i*3,0,start,unit*.4,{alpha:1-age/.18});
    if(!shot.melee&&t>=shot.release&&t<shot.hit){
     const p=(t-shot.release)/(shot.hit-shot.release),point={x:mix(start.x,end.x,p),y:mix(start.y,end.y,p)+(shot.arc||0)*unit*Math.sin(p*Math.PI)};
     this.drawFx(i*3+1,p<.4?1:2,point,unit*(this.spec.id==='orikkung'?.8:.7),{rotation:Math.atan2(end.y-start.y,end.x-start.x),anchor:{x:.86,y:.48}});this.activeProjectiles++;
    }
    const p=(t-shot.hit)/shot.impactLife;
    if(p>=0&&p<1){const index=Math.min(7,3+Math.floor(p*5)),size=unit*(this.spec.id==='sudaeng'?1.02:this.spec.id==='orikkung'?.95:.76),f=this.spec[this.plan.effectBank==='secondary'?'secondaryEffects':'effects'].frames[index];this.drawFx(i*3+2,index,end,size,{alpha:p>.6?1-(p-.6)/.4:1,...(shot.ground?{anchor:{x:f.anchor.x,y:f.visibleBounds.bottom/f.height}}:{})});this.activeImpacts++;if(p<.2)target.fullBodySprite.tint=0xffd1a2;
     const contact=shot.melee?this.emission({key:'attack',frame:shot.pose}):end;this.contacts.push({target:shot.target,at:shot.hit,x:end.x,y:end.y,error:Math.hypot(contact.x-end.x,contact.y-end.y),melee:!!shot.melee});
    }
    if(shot.returnAt!=null&&t>=shot.returnAt&&t<shot.returnEnd){const p=(t-shot.returnAt)/(shot.returnEnd-shot.returnAt),hand=this.emission({key:'attack',frame:1}),point={x:mix(end.x,hand.x,p),y:mix(end.y,hand.y,p)+unit*.65*Math.sin(p*Math.PI)};this.drawFx(11,2,point,unit*.55,{rotation:Math.atan2(hand.y-end.y,hand.x-end.x),anchor:{x:.55,y:.5}});this.activeProjectiles++;}
   }
  }
  this.onUpdate(this);
 }
 diagnostics(){const f=this.metadata(),s=this.merc.fullBodySprite,b=s.getBounds();return {ready:!this.destroyed,id:this.spec.id,mode:this.mode,pose:this.pose,time:this.time,duration:this.plan.duration,playing:this.playing,speed:this.speed,motionOnly:this.motionOnly,reduced:this.reducedMotion,activeEffects:this.effectFrames.length,effectFrames:this.effectFrames,activeProjectiles:this.activeProjectiles,activeImpacts:this.activeImpacts,contacts:this.contacts,actorBounds:{left:b.x,top:b.y,right:b.x+b.width,bottom:b.y+b.height},bodyRegistration:{bodyHeight:this.bodyHeight,renderedReference:f.bodyPixels*s.scale.y,scaleX:s.scale.x,scaleY:s.scale.y,uniform:s.scale.x===s.scale.y,foot:f.foot},formationSlot:{x:this.merc.baseX,y:this.merc.baseY,scale:this.merc.restScale},idleBodyFixed:true,idleTimeline:!!this.merc.animationController.timeline,regularAllies:this.engine.allies.length,regularEnemies:this.engine.enemies.length,registeredTimelines:this.engine.simpleTimelines.size,visualOnly:true,clock:'DEPLOYED_V3_GSAP'};}
 destroy(){if(this.destroyed)return;this.removeTimeline();this.targets.forEach((n,i)=>{if(!n.root.destroyed)n.fullBodySprite.tint=this.tints[i]});this.layer.destroy({children:true});this.destroyed=true;}
}
