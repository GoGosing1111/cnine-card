import {gsap} from 'gsap';
import {POSES,SKILLS,posePlan,sampleMovement,sampleStep} from './skills.mjs';
export const ROOT='/assets/ui/project-v/mercenaries/eunseol-20261023/';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,p)=>a+(b-a)*p;
export async function loadSeolhwiAssets(manifest,runtime){
 const assets={motion:{},effects:{}};const{Assets,Texture,Rectangle}=runtime;
 await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(manifest[kind]).map(async([key,spec])=>{
  const atlas=await Assets.load(ROOT+spec.atlas+'?v='+spec.sha256.slice(0,12));
  assets[kind][key]=spec.frames.map((_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));
 })));return assets;
}

// Only authored actor motion and its own FX are added to the deployed engine.
// The live engine remains the sole owner of formation, camera, field and HUD.
export class SeolhwiFX{
 constructor(engine,merc,assets,manifest,runtime,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,assets,manifest,runtime,onUpdate});
  this.bodyHeight=285;this.speed=2;this.mode='idle';this.plan=posePlan('idle');this.clock={time:0};this.auraEnabled=true;this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.destroyed=false;this.activeFrames=[];this.activeImpacts=0;
  this.targets=engine.enemies.slice();this.targetTints=this.targets.map(a=>a.fullBodySprite.tint);
  merc.art={...(merc.art||{}),code:'SEOLHWI_REVIEW',bodyHeight:this.bodyHeight,calmIdle:true};
  merc.animationController.kill();merc.restoreNeutralAvatarPose?.();
  const{Container,Sprite}=runtime;
  this.layer=new Container({label:'SeolhwiAuthoredFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.effects=Array.from({length:5},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
  this.impacts=Array.from({length:15},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
  this.aura=new Sprite(assets.effects.aura[0]);this.aura.anchor.set(.5);this.aura.zIndex=merc.fullBodySprite.zIndex-.01;merc.view.addChild(this.aura);
  this.ghost=new Sprite();this.ghost.visible=false;this.ghost.zIndex=merc.fullBodySprite.zIndex-.001;merc.view.addChild(this.ghost);merc.view.sortChildren();
  this.captureFormation();this.render(0);merc.captureNeutralAvatarPose?.();this.startAmbient();
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){
  this.start={x:this.merc.baseX,y:this.merc.baseY};
  const nearest=this.targets.slice().sort((a,b)=>Math.hypot(a.baseX-this.start.x,a.baseY-this.start.y)-Math.hypot(b.baseX-this.start.x,b.baseY-this.start.y))[0];
  const floor=this.merc.root.parent.toLocal(nearest.root.toGlobal({x:0,y:0}));
  const frame=this.manifest.motion.slash.frames[3],dx=(frame.contactPoint.x-frame.footAnchor.x*this.manifest.motion.slash.cellSize)*this.bodyHeight/frame.bodyPixels;
  const origin=this.merc.root.parent.toLocal(this.merc.view.toGlobal({x:0,y:0})),tip=this.merc.root.parent.toLocal(this.merc.view.toGlobal({x:dx,y:0}));
  this.destination={x:floor.x-(tip.x-origin.x)*.9,y:floor.y};
 }
 stopAmbient(){if(!this.ambient)return;this.engine.simpleTimelines.delete(this.ambient);this.ambient.instance.kill();this.ambient=null;}
 startAmbient(){
  this.stopAmbient();if(this.destroyed||this.reducedMotion)return;
  const clock={time:0},instance=gsap.timeline({repeat:-1,onUpdate:()=>{if(!this.destroyed)this.updateAura(clock.time,1);}}).to(clock,{time:3,duration:3,ease:'none'});
  this.ambient={instance,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambient);
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();if(this.mode==='idle')return;
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);if(this.pose.key==='idle')this.startAmbient();this.onUpdate(this);}}).fromTo(this.clock,{time:0},{time:this.plan.duration,duration:this.plan.duration,ease:'none',immediateRender:false}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 configure(mode,{autoplay=true}={}){this.stopAmbient();this.removeTimeline();this.mode=mode;this.plan=mode.startsWith('skill:')?SKILLS[mode.slice(6)]:posePlan(mode);this.clock.time=0;this.makeTimeline();this.render(0);if(mode==='idle')this.startAmbient();else if(autoplay)this.play();}
 play(){if(this.mode==='idle'){this.startAmbient();this.onUpdate(this);return;}if(this.time>=this.plan.duration)this.seek(0);this.stopAmbient();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.stopAmbient();this.onUpdate(this);}
 seek(time){this.pause();const target=clamp(time,0,this.plan.duration);this.timeline?.time(target,true);this.clock.time=target;this.render(target);}
 replay(){this.seek(0);this.play();}
 cancel(){if(this.destroyed)return;this.configure('idle',{autoplay:false});}
 setSpeed(speed){this.speed=clamp(Number(speed)||2,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setAura(on){this.auraEnabled=!!on;this.render(this.time);}
 setMotionOnly(on){this.motionOnly=!!on;this.render(this.time);}
 setReducedMotion(on){this.reducedMotion=!!on;this.stopAmbient();this.render(this.time);if(this.mode==='idle')this.startAmbient();}
 samplePose(t){
  let step=0;for(let i=0;i<this.plan.poses.length;i++){if(this.plan.poses[i][0]>t)break;step=i;}
  const[start,phase]=this.plan.poses[step],end=this.plan.poses[step+1]?.[0]??this.plan.duration,p=clamp((t-start)/Math.max(.001,end-start));
  if(phase==='idle')return{key:'idle',frame:0,phase:'idle',blend:1};
  let key=phase,from=0,to;
  if(phase==='windup'){key='slash';to=1;}else if(phase==='recover'){key='slash';from=to=this.manifest.motion.slash.frameCount-1;}else if(phase==='slash'&&this.mode.startsWith('skill:')){from=2;to=4;}
  const count=this.manifest.motion[key].frameCount;to??=count-1;
  return{key,frame:Math.min(to,from+Math.floor(p*(to-from+1))),phase,blend:key==='defeat'&&p<1?clamp((p*count-Math.floor(p*count))/.24):1};
 }
 applyPose(p){
  const key=p.key,spec=this.manifest.motion[key],index=key==='idle'?0:clamp(p.frame,0,spec.frameCount-1),f=spec.frames[index],s=this.merc.fullBodySprite;
  s.texture=this.assets.motion[key][index];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(0,0);s.scale.set(this.bodyHeight/f.bodyPixels);s.rotation=0;s.alpha=1;
  this.ghost.visible=key==='defeat'&&index>0&&(p.blend??1)<1;
  if(this.ghost.visible){const previous=spec.frames[index-1];this.ghost.texture=this.assets.motion[key][index-1];this.ghost.anchor.set(previous.footAnchor.x,previous.footAnchor.y);this.ghost.position.set(0,0);this.ghost.scale.set(this.bodyHeight/previous.bodyPixels);this.ghost.alpha=1-p.blend;s.alpha=p.blend;}
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral){neutral.scaleX=s.scale.x;neutral.scaleY=s.scale.y;neutral.x=0;neutral.y=0;neutral.rotation=0;}
  this.pose={key,frame:index,phase:p.phase??key};
 }
 ownPoint(x=0,y=0){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal({x,y}));}
 point(actor,fraction=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-(actor.art?.bodyHeight||actor.fullBodyHeight)*fraction}));}
 bladePoint(){const f=this.manifest.motion[this.pose.key].frames[this.pose.frame],spec=this.manifest.motion[this.pose.key],s=this.merc.fullBodySprite,p=f.contactPoint;return p?this.ownPoint((p.x-spec.cellSize*f.footAnchor.x)*s.scale.x,(p.y-spec.cellSize*f.footAnchor.y)*s.scale.y):this.ownPoint(this.bodyHeight*.4,-this.bodyHeight*.6);}
 updateAura(time,charge=1){
  this.aura.visible=this.auraEnabled&&!this.motionOnly&&this.pose.key!=='defeat';if(!this.aura.visible)return;
  const spec=this.manifest.effects.aura,index=this.reducedMotion?0:Math.floor((time%3)/3*spec.frameCount),size=this.bodyHeight*1.32/((spec.visibleBounds.bottom-spec.visibleBounds.top)/spec.cellSize)*(1+(charge-1)*.05);
  this.aura.texture=this.assets.effects.aura[index];this.aura.width=this.aura.height=size;this.aura.position.set(0,-this.bodyHeight*.53);this.aura.alpha=1;this.auraFrame=index;
 }
 contain(sprite,key,index){
  const spec=this.manifest.effects[key],b=spec.frames[index].visibleBounds,c=spec.cellSize,scale=sprite.width/c,points=[[b.left-c/2,b.top-c/2],[b.right-c/2,b.top-c/2],[b.right-c/2,b.bottom-c/2],[b.left-c/2,b.bottom-c/2]].map(([x,y])=>({x:(x*Math.cos(sprite.rotation)-y*Math.sin(sprite.rotation))*scale,y:(x*Math.sin(sprite.rotation)+y*Math.cos(sprite.rotation))*scale})),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),{width,height}=this.engine.scene,margin=20;
  if(maxX-minX>width-40||maxY-minY>height-40){sprite.scale.set(sprite.scale.x*Math.min((width-40)/(maxX-minX),(height-40)/(maxY-minY)));return this.contain(sprite,key,index);}
  sprite.x=clamp(sprite.x,margin-minX,width-margin-maxX);sprite.y=clamp(sprite.y,margin-minY,height-margin-maxY);
  sprite.envelope={left:sprite.x+minX,top:sprite.y+minY,right:sprite.x+maxX,bottom:sprite.y+maxY};
 }
 render(time){
  if(this.destroyed)return;this.clock.time=clamp(time,0,this.plan.duration);const t=this.time;
  this.applyPose(this.samplePose(t));const maxTravel=Math.max(1,...this.plan.movement.map(p=>p[1])),travel=this.mode==='idle'?0:sampleMovement(this.plan.movement,t)/maxTravel*(this.reducedMotion?.18:1);
  this.merc.root.position.set(mix(this.start.x,this.destination.x,travel),mix(this.start.y,this.destination.y,travel));this.merc.root.depthSortY=this.merc.root.y;
  const windup=this.plan.poses.find(p=>['slash','ultimate'].includes(p[1]))?.[0]||1,charge=this.mode.startsWith('skill:')?1+(this.plan.auraBoost-1)*(t<windup?clamp(t/windup):1-clamp((t-windup)/(this.plan.duration-windup))):this.plan.auraBoost;
  this.updateAura(t,charge);this.effects.forEach(s=>s.visible=false);this.impacts.forEach(s=>s.visible=false);this.activeFrames=[];this.activeImpacts=0;
  for(let i=0;i<this.targets.length;i++)this.targets[i].fullBodySprite.tint=this.targetTints[i];
  this.engine.sortCombatDepth();
  if(!this.motionOnly){
   const foot=this.ownPoint(),head=this.ownPoint(0,-this.bodyHeight),unit=Math.hypot(head.x-foot.x,head.y-foot.y),army=this.targets.map(a=>this.point(a,.45)),center={x:army.reduce((v,p)=>v+p.x,0)/army.length,y:army.reduce((v,p)=>v+p.y,0)/army.length},span=Math.max(...army.map(p=>p.x))-Math.min(...army.map(p=>p.x)),blade=this.bladePoint();this.currentUnit=unit;
   for(let i=0;i<this.plan.effects.length;i++){
    const e=this.plan.effects[i];if(t<e.start||t>e.end)continue;const p=clamp((t-e.start)/(e.end-e.start)),spec=this.manifest.effects[e.kind],index=clamp(Math.floor(p*spec.frameCount),0,spec.frameCount-1),sprite=this.effects[i],size=Math.max(unit*2.5,span*1.25)*e.width/.66/(spec.contentScale||1);
    sprite.texture=this.assets.effects[e.kind][index];sprite.width=sprite.height=size;sprite.position.set(mix(blade.x,center.x+unit*.3*(this.direction||1),p),mix(blade.y,center.y,p));sprite.rotation=e.angle;sprite.alpha=Math.min(1,p*9)*Math.min(1,(1-p)*5)*(this.reducedMotion?.65:1);sprite.visible=true;this.contain(sprite,e.kind,index);this.activeFrames.push({key:e.kind,frame:index,bounds:sprite.envelope});
   }
   // One authored wave reaches every existing opposing card. No HP or combat
   // result is written; these contacts only select the visual impact frames.
   const events=[];for(let wave=0;wave<this.plan.impacts.length;wave+=3)for(let i=0;i<this.targets.length;i++)events.push({at:this.plan.impacts[wave]+i*.05,target:i});
   for(let i=0;i<events.length;i++){
    const e=events[i],p=(t-e.at)/.6;if(p<0||p>1)continue;const sprite=this.impacts[i],spec=this.manifest.effects.impact,index=clamp(Math.floor(p*spec.frameCount),0,spec.frameCount-1),point=this.point(this.targets[e.target],.45);sprite.texture=this.assets.effects.impact[index];sprite.width=sprite.height=unit*1.35/(spec.contentScale||1);sprite.position.set(point.x,point.y);sprite.rotation=0;sprite.alpha=(1-p*.65)*(this.reducedMotion?.65:1);sprite.visible=true;this.contain(sprite,'impact',index);this.activeImpacts++;if(p<.3)this.targets[e.target].fullBodySprite.tint=0xe6d1ff;
   }
  }
  this.onUpdate(this);
 }
 diagnostics(){
  const spec=this.manifest.motion[this.pose.key],f=spec.frames[this.pose.frame],s=this.merc.fullBodySprite,b=f.visibleBounds,toScreen=(x,y)=>this.merc.view.toGlobal({x:(x-spec.cellSize*f.footAnchor.x)*s.scale.x,y:(y-spec.cellSize*f.footAnchor.y)*s.scale.y}),a=toScreen(b.left,b.top),z=toScreen(b.right,b.bottom),e=this.engine;
  return{ready:!this.destroyed,mode:this.mode,time:this.time,duration:this.plan.duration,pose:{...this.pose},playing:this.playing,speed:this.speed,aura:this.auraEnabled,auraFrame:this.auraFrame,motionOnly:this.motionOnly,reduced:this.reducedMotion,actorBounds:{left:Math.min(a.x,z.x),top:Math.min(a.y,z.y),right:Math.max(a.x,z.x),bottom:Math.max(a.y,z.y)},effectBounds:this.activeFrames.map(f=>f.bounds),activeEffects:this.activeFrames.length,activeImpacts:this.activeImpacts,viewport:{width:e.app.screen.width,height:e.app.screen.height,mobile:e.mobile},scene:{...e.scene},bodyRegistration:{physicalBodyHeight:this.bodyHeight,renderedBodyReference:f.bodyPixels*s.scale.y,uniformScale:s.scale.x===s.scale.y,scale:s.scale.y,rootScale:this.merc.root.scale.y,footAnchor:f.footAnchor,bodyPixels:f.bodyPixels,facing:'RIGHT'},idleBodyFixed:true,idleFrame:0,idleControllerTimeline:!!this.merc.animationController.timeline,ambientAuraOnly:true,regularAllies:e.allies.length,regularEnemies:e.enemies.length,mercenaryInRegularArray:e.allies.includes(this.merc),formationSlot:{x:this.merc.baseX,y:this.merc.baseY,scale:this.merc.restScale},formationVersion:e.gridDiagnostics?.().layoutVersion,registeredTimelines:e.simpleTimelines.size,counts:this.manifest.counts,targets:this.targets.length,visualOnly:true,renderer:'DEPLOYED_V3_7D0DC1C07',clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'NONE_VISUAL_ONLY',blade:this.bladePoint(),cue:sampleStep(this.plan.cues,this.time),name:POSES[this.mode]||this.plan.name};
 }
 destroy(){if(this.destroyed)return;this.stopAmbient();this.removeTimeline();for(let i=0;i<this.targets.length;i++)if(!this.targets[i].root.destroyed)this.targets[i].fullBodySprite.tint=this.targetTints[i];this.aura.destroy();this.ghost.destroy();this.layer.destroy({children:true});this.destroyed=true;}
}
