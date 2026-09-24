import {Container,Sprite,Graphics,Assets,Texture,Rectangle,BlurFilter,ColorMatrixFilter} from 'pixi.js';
import {gsap} from 'gsap';
import {sample} from '../skill.mjs';
import {CueAudio} from './CueAudio.js';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),mix=(a,b,t)=>a+(b-a)*t;
export async function loadIceAssets(manifest){
 const root='/preview/mercenary-ice-crystal-dual-sword-v1/',result={motion:{},effects:{}};
 const frames=async spec=>{const atlas=await Assets.load(root+spec.atlas);return Array.from({length:spec.frameCount},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));};
 await Promise.all([...Object.entries(manifest.motion).map(async([key,spec])=>{result.motion[key]=await frames(spec);}),...Object.entries(manifest.effects).map(async([key,spec])=>{result.effects[key]=await frames(spec);})]);
 result.flash=await Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/flash.webp');
 result.smoke=await Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/smoke.webp');return result;
}
function solidColor(rgb){
 const f=new ColorMatrixFilter();const [r,g,b]=rgb;
 // Only RGB changes: all generated alpha and cutout holes remain intact.
 f.matrix=[0,0,0,0,r,0,0,0,0,g,0,0,0,0,b,0,0,0,1,0];return f;
}
export class IceDualSwordFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{},options={}){
  Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate,options});merc.animationController.kill();
  this.clock={time:0};this.speed=1;this.destroyed=false;this.timeline=null;this.registration=null;this.audio=new CueAudio();this.auraEnabled=true;
  this.layer=new Container({label:'IceDualSwordFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.dim=new Graphics();this.ground=new Graphics();this.trails=new Graphics();this.screenFlash=new Graphics();this.layer.addChild(this.dim,this.ground,this.trails);
  this.pool=Array.from({length:80},()=>{const s=new Sprite(assets.flash);s.visible=false;s.anchor.set(.5);this.layer.addChild(s);return s;});this.layer.addChild(this.screenFlash);
  const s=merc.fullBodySprite;this.idle={texture:s.texture,width:s.width,height:s.height,anchorX:s.anchor.x,anchorY:s.anchor.y};
  this.bodyHeight=this.idle.height*manifest.bodyPixels/manifest.battleSpriteInfo.height;
  this.targetDefaults=targets.map(t=>({viewX:t.view.x,tint:t.fullBodySprite.tint}));
  this.makeAura();this.captureFormation();if(!options.authoritative)this.makeTimeline();this.render(0);
 }
 makeAura(){
  this.aura=new Container({label:'IceEnhancementSilhouette',sortableChildren:true});this.aura.eventMode='none';this.aura.zIndex=10.5;
  const view=this.merc.view;view.addChildAt(this.aura,Math.max(0,view.getChildIndex(this.merc.fullBodySprite)));view.sortChildren();
  this.auraSheets=[new Sprite(),new Sprite()];this.auraSheets.forEach(s=>{s.blendMode='add';this.aura.addChild(s);});
  this.outer=new Sprite(this.idle.texture);this.inner=new Sprite(this.idle.texture);this.cobalt=new Container();this.rim=new Container();
  this.outer.blendMode=this.inner.blendMode='add';this.aura.addChild(this.outer,this.cobalt,this.inner,this.rim);
  this.cobaltCopies=Array.from({length:8},()=>{const s=new Sprite(this.idle.texture);this.cobalt.addChild(s);return s;});
  this.rimCopies=Array.from({length:8},()=>{const s=new Sprite(this.idle.texture);this.rim.addChild(s);return s;});
  this.auraFilters=[];
  if(this.engine.app?.renderer){
   const outerColor=solidColor([.025,.19,1]),innerColor=solidColor([.04,.72,1]),cobaltColor=solidColor([.025,.33,1]),rimColor=solidColor([.46,.92,1]);
   this.outerBlur=new BlurFilter({strength:14,quality:2,resolution:.65});this.innerBlur=new BlurFilter({strength:5,quality:2,resolution:1});
   this.outer.filters=[outerColor,this.outerBlur];this.inner.filters=[innerColor,this.innerBlur];this.cobalt.filters=[cobaltColor];this.rim.filters=[rimColor];
   this.auraFilters=[outerColor,innerColor,cobaltColor,rimColor,this.outerBlur,this.innerBlur];
  }else{this.outer.tint=0x1552ff;this.inner.tint=0x32cfff;this.cobaltCopies.forEach(s=>s.tint=0x0854ff);this.rimCopies.forEach(s=>s.tint=0x89edff);}
 }
 updateAura(state){
  this.aura.visible=this.auraEnabled;if(!this.auraEnabled)return;
  const main=this.merc.fullBodySprite,t=state.cancelled||state.done?0:state.time,pulse=.5+.5*Math.sin(t*4.2),boost=state.auraBoost;
  for(const sprite of [this.outer,this.inner,...this.cobaltCopies,...this.rimCopies]){
   sprite.texture=main.texture;sprite.anchor.copyFrom(main.anchor);sprite.position.copyFrom(main.position);sprite.scale.copyFrom(main.scale);sprite.rotation=main.rotation;
  }
  this.outer.alpha=clamp(.94+.06*pulse+boost*.1);this.inner.alpha=clamp(.88+.1*pulse+boost*.1);this.cobalt.alpha=.88+.1*pulse;this.rim.alpha=.93+.07*pulse;
  const radius=2.75+pulse*.55+boost*.9,cobaltRadius=5.7+pulse*.9+boost*1.4;
  this.cobaltCopies.forEach((sprite,i)=>{const a=i/8*Math.PI*2;sprite.x+=Math.cos(a)*cobaltRadius;sprite.y+=Math.sin(a)*cobaltRadius;});
  this.rimCopies.forEach((sprite,i)=>{const a=i/8*Math.PI*2;sprite.x+=Math.cos(a)*radius;sprite.y+=Math.sin(a)*radius;});
  if(this.outerBlur)this.outerBlur.strength=12+pulse*3+boost*4;
  if(this.innerBlur)this.innerBlur.strength=4.7+pulse*.8+boost;
  const spec=this.manifest.effects.aura,f=(t*6)%spec.frameCount,i=Math.floor(f),next=(i+1)%spec.frameCount,q=f-i;
  this.auraSheets.forEach((sprite,n)=>{const at=n?next:i;sprite.texture=this.assets.effects.aura[at];sprite.anchor.set(spec.frames[at].anchor.x,spec.frames[at].anchor.y);sprite.position.set(0,0);sprite.width=this.bodyHeight*1.85;sprite.height=sprite.width;sprite.alpha=(n?q:1-q)*(.38+boost*.14);});
 }
 captureFormation(){
  this.start={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};this.destinations={};
  const target=this.targets[0];
  for(const [key,spec] of Object.entries(this.manifest.motion))this.destinations[key]=(spec.contacts||[]).map(contact=>{
   const point=this.merc.root.parent.toLocal(target.root.toGlobal({x:0,y:-target.fullBodyHeight*contact.targetHeightFraction})),scale=this.bodyHeight/spec.bodyPixels;
   return {x:point.x-(contact.sourcePoint[0]-contact.sourceFoot[0])*scale*this.merc.root.scale.x*this.merc.view.scale.x,y:point.y-(contact.sourcePoint[1]-contact.sourceFoot[1])*scale*this.merc.root.scale.y*this.merc.view.scale.y};
  });
  this.destination=this.destinations.attack[0];
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
 setAura(enabled){this.auraEnabled=!!enabled;this.render(this.time);}
 setPlan(plan){this.cancel();this.plan=plan;this.makeTimeline();this.render(0);}
 cancel(){this.audio.stop();this.removeTimeline();this.clock.time=0;this.render(0);}
 positionAt(state){
  const contact=state.contactTrack,candidates=contact?this.destinations[contact.key]:null;
  const a=candidates?.[0]||this.destination,b=candidates?.[1]||a,q=contact?.blend||0;
  return {x:mix(this.start.x,mix(a.x,b.x,q),state.travel),y:mix(this.start.y,mix(a.y,b.y,q),state.travel)};
 }
 applyPose(pose){
  if(this.options.useAuthoredPose===false)return;
  const s=this.merc.fullBodySprite;
  // A concurrent hit/idle tween captures the authored atlas scale. Stop that
  // competing writer before restoring the larger idle texture, or its cached
  // scale enlarges the body again after this render. Normal idle stays active
  // outside authored poses; no per-frame tween teardown when none exists.
  if(this.merc.animationController.timeline&&(pose||s.texture!==this.idle.texture))this.merc.animationController.kill();
  if(!pose){s.texture=this.idle.texture;s.anchor.set(this.idle.anchorX,this.idle.anchorY);s.width=this.idle.width;s.height=this.idle.height;}
  else{const spec=this.manifest.motion[pose.key],f=spec.frames[pose.frame];s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.height=this.bodyHeight*spec.cellSize/spec.bodyPixels;s.width=s.height;}
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral){neutral.scaleX=s.scale.x;neutral.scaleY=s.scale.y;}
 }
 point(actor,fraction=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*fraction}));}
 draw(texture,p,size,{alpha=1,height=size,angle=0,tint=0xffffff,blend='normal',anchor={x:.5,y:.5}}={}){
  if(this.used>=this.pool.length)throw Error('Ice effect sprite pool exhausted');const s=this.pool[this.used++];s.texture=texture;s.visible=alpha>0;s.anchor.set(anchor.x,anchor.y);s.position.set(p.x,p.y);s.width=size;s.height=height;s.alpha=clamp(alpha);s.rotation=angle;s.tint=tint;s.blendMode=blend;return s;
 }
 drawSequence(key,state,p,size){
  const spec=this.manifest.effects[key],f=clamp(state.frame,0,spec.frameCount-1),i=Math.floor(f),j=Math.min(i+1,spec.frameCount-1),q=f-i;
  this.activeFrames.push({key,index:i,next:j,anchor:{...p},sourceAnchor:spec.frames[i].anchor});
  this.draw(this.assets.effects[key][i],p,size,{alpha:state.alpha*(1-q),anchor:spec.frames[i].anchor});
  if(q>.001)this.draw(this.assets.effects[key][j],p,size,{alpha:state.alpha*q,anchor:spec.frames[j].anchor});
 }
 render(time){
  if(this.destroyed)return;for(const s of this.pool)s.visible=false;this.used=0;this.activeFrames=[];this.dim.clear();this.ground.clear();this.trails.clear();this.screenFlash.clear();
  const state=sample(this.plan,time);this.sample=state;this.applyPose(state.pose);this.updateAura(state);const position=this.positionAt(state);this.merc.root.position.set(position.x,position.y);
  const guard=this.plan.mode==='guard';this.targets.forEach((target,i)=>{target.view.x=this.targetDefaults[i].viewX+(guard?0:(i===0?state.recoil:state.recoil*.5));target.fullBodySprite.tint=state.flash>.01&&!guard?0xc2f6ff:this.targetDefaults[i].tint;});this.engine.sortCombatDepth();
  if(time<=0||state.done||state.cancelled){if(state.cancelled)this.audio.stop();this.onUpdate(this);return;}
  const scene=this.engine.scene,foot=this.point(this.merc),impact=this.point(this.targets[0]),torso=this.point(this.targets[0],.46),unit=Math.max(90,this.targets[0].fullBodyHeight*Math.abs(this.targets[0].root.scale.y));
  if(state.dim>0)this.dim.rect(0,0,scene.width,scene.height).fill({color:0x07152c,alpha:state.dim*.48});
  if(this.auraEnabled){
   const ownHeight=this.bodyHeight*Math.abs(this.merc.root.scale.y),radius=ownHeight*.43;
   this.ground.ellipse(foot.x,foot.y+2,radius,radius*.24).stroke({color:0x66dfff,width:1.5,alpha:.28+state.charge*.5});
   for(let i=0;i<12;i++){const q=(time*.35+i*.083333)%1,a=i*2.399963,p={x:foot.x+Math.cos(a+time*.12)*radius*(.5+q*.5),y:foot.y-ownHeight*q*1.13};this.draw(this.assets.flash,p,3+i%3,{height:5+i%4,angle:a,alpha:Math.sin(q*Math.PI)*(.45+state.charge*.3),tint:i%3===0?0xe6fbff:0x4fcfff,blend:'add'});}
  }
  if(state.trail){
   const s=this.merc.fullBodySprite,main=this.engine.effectLayer.toLocal(s.toGlobal({x:0,y:0})),layerScale=Math.hypot(this.engine.effectLayer.worldTransform.a,this.engine.effectLayer.worldTransform.b)||1;
   const width=s.texture.width*Math.hypot(s.worldTransform.a,s.worldTransform.b)/layerScale,height=s.texture.height*Math.hypot(s.worldTransform.c,s.worldTransform.d)/layerScale;
   for(let i=3;i>=1;i--){const previous=sample(this.plan,Math.max(0,time-i*.03)),p=this.positionAt(previous);this.draw(s.texture,{x:main.x+(p.x-position.x),y:main.y+(p.y-position.y)},width,{height,anchor:{x:s.anchor.x,y:s.anchor.y},alpha:.10+(3-i)*.035,tint:0x49bdff,blend:'add'});}
   this.draw(this.assets.smoke,{x:foot.x-unit*.3,y:foot.y},unit*.8,{height:unit*.22,alpha:.32,tint:0x91d3ef});
  }
  for(const effect of state.effects){
   let p={...torso},size=unit*3.15;
   if(effect.anchor==='guard'){p={x:foot.x+unit*.43,y:foot.y};size=Math.min(unit*2.6,(foot.y-24)/.72);}
   else if(effect.anchor==='targetGround'){
    p={...impact};const ultimate=effect.key==='ultimate';size=ultimate?Math.max(180,Math.min(unit*6.3,(impact.y-24)/.59,scene.width*1.13)):unit*4.6;
    if(ultimate)p.x=clamp(p.x,size*.35+16,scene.width-size*.35-16);
   }
   this.drawSequence(effect.key,effect,p,size);
   if(state.flash>0)this.draw(this.assets.flash,effect.anchor==='guard'?{x:p.x,y:p.y-unit*.8}:torso,unit*1.4,{alpha:state.flash*2.5,tint:0xc8faff,blend:'add'});
  }
  if(this.plan.mode==='ultimate'){
   const age=time-2.62;
   if(age>=0&&age<1.7){const q=age/1.7,r=unit*(.4+q*2.5),alpha=(1-q)*.7;this.ground.ellipse(impact.x,impact.y,r,r*.25).stroke({color:0xb5f3ff,width:4-2*q,alpha});this.ground.ellipse(impact.x,impact.y,r*.8,r*.2).stroke({color:0x358cff,width:2,alpha:alpha*.6});}
   if(age>=0&&age<2.2)for(let i=0;i<30;i++){const life=age-(i%6)*.025;if(life<0)continue;const a=i*2.399963,v=unit*(.6+(i%5)*.26),p={x:impact.x+Math.cos(a)*v*life,y:impact.y-Math.abs(Math.sin(a))*v*life+unit*.5*life*life};if(p.y>impact.y+15)continue;this.draw(this.assets.flash,p,4+i%4,{height:13+i%7,angle:a+.7,alpha:clamp(1-life/2.2)*.78,tint:i%4===0?0xffffff:0x70d7ff,blend:'add'});}
  }
  if(state.flash>0)this.screenFlash.rect(0,0,scene.width,scene.height).fill({color:0xdbf8ff,alpha:state.flash});
  this.onUpdate(this);
 }
 diagnostics(){return {ready:!this.destroyed,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,cancelled:this.sample.cancelled,travel:this.sample.travel,activeFrames:this.activeFrames,visibleSprites:this.pool.filter(s=>s.visible).length,ownedTimelines:this.timeline?1:0,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,regularAllies:this.engine.allies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),clockOwner:'V3_REGISTERED_GSAP',motionFrames:54,effectFrames:80,damageAuthority:this.plan.damageAuthority,actorFoot:this.point(this.merc),targetFoot:this.point(this.targets[0]),aura:{enabled:this.auraEnabled,textureMatchesPose:[this.outer,this.inner,...this.cobaltCopies,...this.rimCopies].every(s=>s.texture===this.merc.fullBodySprite.texture),silhouetteCopies:18,filterCount:this.auraFilters.length,independentClock:false},audio:{enabled:this.audio.enabled,scheduled:this.audio.scheduled,error:this.audio.error??null},effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='IceDualSwordFX').length};}
 destroy(){if(this.destroyed)return;this.cancel();this.audio.destroy();this.aura.destroy({children:true});this.auraFilters.forEach(f=>f.destroy());this.layer.destroy({children:true});for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const texture of frames)texture.destroy(false);this.destroyed=true;this.pool=[];}
}
