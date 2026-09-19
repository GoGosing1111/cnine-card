import {Container,Sprite,Graphics,Assets,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {sample} from '../skill.mjs';
import {CueAudio} from './CueAudio.js';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),mix=(a,b,t)=>a+(b-a)*t;
export async function loadRagnielAssets(manifest){
 const root='/preview/mercenary-ragniel-v1/',result={motion:{},effects:{}};
 const frames=async spec=>{const atlas=await Assets.load(root+spec.atlas);return Array.from({length:spec.frameCount},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));};
 await Promise.all([...Object.entries(manifest.motion).map(async([key,spec])=>{result.motion[key]=await frames(spec);}),...Object.entries(manifest.effects).map(async([key,spec])=>{result.effects[key]=await frames(spec);})]);
 result.flash=await Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/flash.webp');
 result.smoke=await Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/smoke.webp');return result;
}
export class RagnielSkillFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate,{authoritative=false,useAuthoredPose=true}={}){
  Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate,authoritative,useAuthoredPose});merc.animationController.kill();
  this.clock={time:0};this.speed=1;this.destroyed=false;this.timeline=null;this.registration=null;this.audio=new CueAudio();
  this.layer=new Container({label:'RagnielSkillFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.dim=new Graphics();this.ground=new Graphics();this.trails=new Graphics();this.screenFlash=new Graphics();this.layer.addChild(this.dim,this.ground,this.trails);
  this.pool=Array.from({length:64},()=>{const s=new Sprite(assets.flash);s.visible=false;s.anchor.set(.5);this.layer.addChild(s);return s;});this.layer.addChild(this.screenFlash);
  const s=merc.fullBodySprite;this.idle={texture:s.texture,width:s.width,height:s.height,anchorX:s.anchor.x,anchorY:s.anchor.y};
  this.bodyHeight=this.idle.height*manifest.bodyPixels/manifest.battleSpriteInfo.height;
  this.targetDefaults=targets.map(t=>({viewX:t.view.x,tint:t.fullBodySprite.tint}));this.captureFormation();this.makeTimeline();this.render(0);
 }
 captureFormation(){
  this.start={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};
  const target=this.targets[0],spec=this.manifest.motion.slash,contact=spec.contactRegistration;
  const point=this.merc.root.parent.toLocal(target.root.toGlobal({x:0,y:-target.fullBodyHeight*contact.targetHeightFraction}));
  const scale=this.bodyHeight/spec.bodyPixels;
  this.destination={x:point.x-(contact.sourcePoint[0]-contact.sourceFoot[0])*scale*this.merc.root.scale.x*this.merc.view.scale.x,y:point.y-(contact.sourcePoint[1]-contact.sourceFoot[1])*scale*this.merc.root.scale.y*this.merc.view.scale.y};
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 makeTimeline(){this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.audio.stop();this.render(this.plan.duration);}}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);this.registration={instance:this.timeline,settle:()=>this.cancel()};}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();void this.audio.play(this.plan,this.time,this.speed,()=>this.time);this.onUpdate(this);}
 pause(){this.timeline?.pause();this.audio.stop();this.onUpdate(this);}
 seek(t){if(this.destroyed)return;this.audio.stop();if(!this.timeline)this.makeTimeline();this.timeline.pause().time(clamp(t,0,this.plan.duration),true);this.clock.time=clamp(t,0,this.plan.duration);this.render(this.clock.time);}
 setSpeed(speed){this.speed=clamp(Number(speed)||1,.25,2);this.timeline?.timeScale(this.speed);if(this.playing)void this.audio.play(this.plan,this.time,this.speed,()=>this.time);this.onUpdate(this);}
 setSound(enabled){this.audio.enabled=enabled;if(this.playing)void this.audio.play(this.plan,this.time,this.speed,()=>this.time);else this.audio.stop();}
 setPlan(plan){this.cancel();this.plan=plan;this.makeTimeline();this.render(0);}
 cancel(){this.audio.stop();this.removeTimeline();this.clock.time=0;this.render(0);}
 positionAt(state){return {x:mix(this.start.x,this.destination.x,state.travel),y:mix(this.start.y,this.destination.y,state.travel)};}
 applyPose(pose){
  if(!this.useAuthoredPose)return;
  const s=this.merc.fullBodySprite;if(!pose){s.texture=this.idle.texture;s.anchor.set(this.idle.anchorX,this.idle.anchorY);s.width=this.idle.width;s.height=this.idle.height;}
  else{const spec=this.manifest.motion[pose.key],f=spec.frames[pose.frame];s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.height=this.bodyHeight*spec.cellSize/spec.bodyPixels;s.width=s.height;}
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral){neutral.scaleX=s.scale.x;neutral.scaleY=s.scale.y;}
 }
 point(actor,fraction=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*fraction}));}
 draw(texture,p,size,{alpha=1,height=size,angle=0,tint=0xffffff,blend='normal',anchor={x:.5,y:.5}}={}){
  if(this.used>=this.pool.length)throw Error('Ragniel sprite pool exhausted');const s=this.pool[this.used++];s.texture=texture;s.visible=alpha>0;s.anchor.set(anchor.x,anchor.y);s.position.set(p.x,p.y);s.width=size;s.height=height;s.alpha=clamp(alpha);s.rotation=angle;s.tint=tint;s.blendMode=blend;return s;
 }
 drawSequence(key,state,p,size){
  const spec=this.manifest.effects[key],f=clamp(state.frame,0,spec.frameCount-1),i=Math.floor(f),j=Math.min(i+1,spec.frameCount-1),q=f-i;
  this.activeFrames.push({key,index:i,next:j,anchor:{...p},sourceAnchor:spec.frames[i].anchor});
  this.draw(this.assets.effects[key][i],p,size,{alpha:state.alpha*(1-q),anchor:spec.frames[i].anchor});
  if(q>.001)this.draw(this.assets.effects[key][j],p,size,{alpha:state.alpha*q,anchor:spec.frames[j].anchor});
 }
 render(time){
  if(this.destroyed||this.merc.root.destroyed||this.targets.some(t=>t.root.destroyed))return;for(const s of this.pool)s.visible=false;this.used=0;this.activeFrames=[];this.dim.clear();this.ground.clear();this.trails.clear();this.screenFlash.clear();
  const state=sample(this.plan,time);this.sample=state;this.applyPose(state.pose);const position=this.positionAt(state);this.merc.root.position.set(position.x,position.y);
  this.targets.forEach((target,i)=>{target.view.x=this.targetDefaults[i].viewX+(i===0?state.recoil:state.recoil*.55);target.fullBodySprite.tint=state.flash>.01?0xffefc6:this.targetDefaults[i].tint;});this.engine.sortCombatDepth();
  if(time<=0||state.done||state.cancelled){if(state.cancelled)this.audio.stop();this.onUpdate(this);return;}
  const scene=this.engine.scene,foot=this.point(this.merc),impact=this.point(this.targets[0]),torso=this.point(this.targets[0],.46),body=this.targets[0].fullBodyHeight*Math.abs(this.targets[0].root.scale.y),unit=Math.max(90,body);
  if(state.dim>0)this.dim.rect(0,0,scene.width,scene.height).fill({color:0x11162a,alpha:state.dim*.42});
  if(state.charge>0){
   const radius=unit*(.45+state.charge*.3);this.ground.ellipse(foot.x,foot.y,radius,radius*.28).stroke({color:0xe9c56c,width:2,alpha:state.charge*.9});
   this.draw(this.assets.flash,{x:foot.x,y:foot.y-unit*.48},unit*1.8,{height:unit*2.6,alpha:state.charge*.19,tint:0xffdba0,blend:'add'});
   for(let i=0;i<7;i++){const a=i/7*Math.PI*2+time*.7,r=radius*(.72+.17*Math.sin(time*5+i));this.draw(this.assets.flash,{x:foot.x+Math.cos(a)*r,y:foot.y-Math.abs(Math.sin(time*3+i))*unit*1.4},8,{alpha:state.charge*.75,tint:0xffe9b1,blend:'add'});}
  }
  if(state.trail){
   const s=this.merc.fullBodySprite;const main=this.engine.effectLayer.toLocal(s.toGlobal({x:0,y:0}));const layerScale=Math.hypot(this.engine.effectLayer.worldTransform.a,this.engine.effectLayer.worldTransform.b)||1;
   const width=s.texture.width*Math.hypot(s.worldTransform.a,s.worldTransform.b)/layerScale,height=s.texture.height*Math.hypot(s.worldTransform.c,s.worldTransform.d)/layerScale;
   for(let i=3;i>=1;i--){const previous=sample(this.plan,Math.max(0,time-i*.035)),p=this.positionAt(previous);this.draw(s.texture,{x:main.x+(p.x-position.x),y:main.y+(p.y-position.y)},width,{height,anchor:{x:s.anchor.x,y:s.anchor.y},alpha:.08+(3-i)*.035,tint:0xffdf8b,blend:'add'});}
   const tail=this.positionAt(sample(this.plan,Math.max(0,time-.10)));this.trails.moveTo(tail.x,tail.y+4).lineTo(foot.x,foot.y+4).stroke({width:3,color:0xffdfa7,alpha:.6});
   this.draw(this.assets.smoke,{x:foot.x-unit*.4,y:foot.y},unit*.65,{height:unit*.22,alpha:.3,tint:0xe6d3a3});
  }
  if(state.slash){this.drawSequence('slash',state.slash,torso,unit*3.25);this.draw(this.assets.flash,torso,unit*1.15,{alpha:state.flash*1.5,tint:0xffe1a1,blend:'add'});}
  if(state.judgment){
   const size=Math.max(180,Math.min(unit*6.2,(impact.y-30)/.60,scene.width*1.1));
   // The area strike keeps its ground depth while its corona fits the viewport.
   impact.x=clamp(impact.x,size*.34+20,scene.width-size*.34-20);this.drawSequence('judgment',state.judgment,impact,size);
   const age=time-2.42;if(age>=0&&age<1.55){const progress=age/1.55,r=unit*(.45+progress*2.7),alpha=(1-progress)*.65;
    this.ground.ellipse(impact.x,impact.y,r,r*.26).stroke({color:0xffe7a3,width:4-2*progress,alpha});this.ground.ellipse(impact.x,impact.y,r*.78,r*.20).stroke({color:0xb8c4d9,width:2,alpha:alpha*.7});
    this.draw(this.assets.flash,impact,unit*3.2,{height:unit*.6,alpha:alpha*.42,tint:0xffd97f,blend:'add'});
   }
   if(age>=0&&age<2.05)for(let i=0;i<24;i++){
    const born=(i%6)*.023,life=age-born;if(life<0)continue;const angle=i*2.399963,velocity=unit*(.45+(i%5)*.22),p={x:impact.x+Math.cos(angle)*velocity*life,y:impact.y-Math.abs(Math.sin(angle))*velocity*life+unit*.52*life*life};
    if(p.y>impact.y+18)continue;this.draw(this.assets.flash,p,4+i%3,{height:12+i%6,angle:angle+.7,alpha:clamp(1-life/2)*.72,tint:0xffe5ae,blend:'add'});
   }
  }
  if(state.flash>0)this.screenFlash.rect(0,0,scene.width,scene.height).fill({color:0xfff6de,alpha:state.flash});
  this.onUpdate(this);
 }
 diagnostics(){return {ready:!this.destroyed,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,cancelled:this.sample.cancelled,travel:this.sample.travel,activeFrames:this.activeFrames,visibleSprites:this.pool.filter(s=>s.visible).length,ownedTimelines:this.timeline?1:0,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,regularAllies:this.engine.allies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),clockOwner:'V3_REGISTERED_GSAP',motionFrames:26,effectFrames:28,damageAuthority:this.plan.damageAuthority,actorFoot:this.point(this.merc),targetFoot:this.point(this.targets[0]),audio:{enabled:this.audio.enabled,scheduled:this.audio.scheduled,error:this.audio.error??null},effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='RagnielSkillFX').length};}
 destroy(){if(this.destroyed)return;this.cancel();this.audio.destroy();this.layer.destroy({children:true});for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const texture of frames)texture.destroy(false);this.destroyed=true;this.pool=[];}
}
