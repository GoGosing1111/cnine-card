import {Container,Sprite,Graphics,Assets,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {sample,clamp,track} from '../skill.mjs';
import {CueAudio} from '../../mercenary-crimson-silver-knight-battle-v1/source/CueAudio.js';
const ROOT='/preview/mercenary-golden-dragon-battle-v1/';
const mix=(a,b,t)=>a+(b-a)*t;
export async function loadDragonAssets(manifest){
 const result={motion:{},effects:{}};
 await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(manifest[kind]).map(async([key,spec])=>{
  const atlas=await Assets.load(ROOT+spec.atlas);
  result[kind][key]=Array.from({length:spec.frameCount},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));
 })));
 result.flash=await Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/flash.webp');
 return result;
}
export class GoldenDragonFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate});
  merc.animationController.kill();this.clock={time:0};this.speed=1;this.bodyHeight=manifest.displaySizing.physicalBodyHeight;
  this.auraEnabled=true;this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.audio=new CueAudio();this.destroyed=false;
  this.layer=new Container({label:'GoldenDragonFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.ground=new Graphics();this.layer.addChild(this.ground);
  this.pool=Array.from({length:140},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
  this.targetsBase=targets.map(a=>({x:a.view.x,tint:a.fullBodySprite.tint}));
  this.makeAura();this.captureFormation();this.makeTimeline();this.render(0);
 }
 makeAura(){
  const view=this.merc.view,main=this.merc.fullBodySprite;
  this.auraBack=new Container({label:'GoldenDragonAuraBack'});this.auraBack.zIndex=main.zIndex-.01;view.addChildAt(this.auraBack,Math.max(0,view.getChildIndex(main)));
  this.auraFront=new Container({label:'GoldenDragonAuraFront'});this.auraFront.zIndex=main.zIndex+.01;view.addChild(this.auraFront);
  this.auraSprites=Array.from({length:2},(_,i)=>{const s=new Sprite();s.anchor.set(.5);(i===0?this.auraBack:this.auraFront).addChild(s);return s;});
  this.dragonSprites=Array.from({length:1},()=>{const s=new Sprite();s.anchor.set(.5);this.auraBack.addChild(s);return s;});
  this.auraMask=new Graphics().rect(-400,-this.bodyHeight*.28,800,this.bodyHeight*.40).fill(0xffffff);this.auraFront.addChild(this.auraMask);this.auraFront.mask=this.auraMask;
  view.sortChildren();
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){
  this.start={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};
  const floor=this.merc.root.parent.toLocal(this.targets[0].root.toGlobal({x:0,y:0}));
  // Contact pose 3: complete original straight blade ends at source (587,825).
  const f=this.manifest.motion.slash.frames[3],s=this.bodyHeight/f.bodyPixels,dx=(587-f.sourceFoot[0])*s;
  const a=this.merc.root.parent.toLocal(this.merc.view.toGlobal({x:0,y:0})),b=this.merc.root.parent.toLocal(this.merc.view.toGlobal({x:dx,y:0}));
  this.destination={x:floor.x-(b.x-a.x)*.93,y:floor.y};
 }
 makeTimeline(){
  this.removeTimeline();this.clock.time=0;
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.audio.stop();this.render(this.plan.duration);this.onComplete?.();}})
   .to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
  if(!this.reducedMotion&&!this.motionOnly)for(const at of this.plan.contacts){
   if(this.plan.stop!==null&&this.plan.stop<=at)continue;
   this.engine.camera?.addShake(this.timeline,{at,intensity:this.plan.mode==='ultimate'?23:9,duration:.20,rotation:.002});
  }
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();void this.audio.play(this.plan,this.time,this.speed,()=>this.time);this.onUpdate(this)}
 pause(){this.timeline?.pause();this.audio.stop();this.onUpdate(this)}
 seek(t){if(this.destroyed)return;this.audio.stop();if(!this.timeline)this.makeTimeline();t=clamp(t,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.render(t)}
 setSpeed(s){this.speed=clamp(Number(s)||1,.25,2);this.timeline?.timeScale(this.speed);if(this.playing)void this.audio.play(this.plan,this.time,this.speed,()=>this.time);this.onUpdate(this)}
 setSound(on){this.audio.enabled=!!on;if(this.playing)void this.audio.play(this.plan,this.time,this.speed,()=>this.time);else this.audio.stop()}
 setAura(on){this.auraEnabled=!!on;this.render(this.time)}
 setMotionOnly(on){const at=this.time;this.motionOnly=!!on;this.pause();this.makeTimeline();this.seek(at)}
 setReducedMotion(on){const at=this.time;this.reducedMotion=!!on;this.pause();this.engine.camera?.reset(true);this.makeTimeline();this.seek(at)}
 setPlan(plan){this.cancel(false);this.plan=plan;this.makeTimeline();this.render(0)}
 cancel(notify=true){if(this.destroyed)return;if(notify)this.onCancel?.();this.audio.stop();this.removeTimeline();this.engine.camera?.reset(true);this.clock.time=0;this.render(0)}
 point(actor,fraction=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*fraction}))}
 ownPoint(x=0,y=0){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal({x,y}))}
 positionAt(s){return {x:mix(this.start.x,this.destination.x,s.travel),y:mix(this.start.y,this.destination.y,s.travel)}}
 applyPose(pose){
  const f=this.manifest.motion[pose.key].frames[pose.frame],sprite=this.merc.fullBodySprite;
  sprite.texture=this.assets.motion[pose.key][pose.frame];sprite.anchor.set(f.footAnchor.x,f.footAnchor.y);sprite.position.set(0,0);sprite.scale.set(this.bodyHeight/f.bodyPixels);
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral){neutral.scaleX=sprite.scale.x;neutral.scaleY=sprite.scale.y;}
 }
 updateAura(state){
  const enabled=this.auraEnabled&&!this.motionOnly&&!state.cancelled&&!(this.plan.mode==='defeat'&&(state.done||state.time>=1.65));
  this.auraBack.visible=this.auraFront.visible=enabled;if(!enabled)return;
  const t=state.done?0:state.time,boost=1+Math.max(0,state.auraBoost)*.035,i=Math.floor(t*5%12);
  // User correction: the native dragon and scale ring stay at full opacity.
  // Swap authored frames directly so crossfades cannot make the dragon ghostly.
  this.auraSprites.forEach(s=>{s.texture=this.assets.effects.aura[i];s.position.set(0,-this.bodyHeight*.68);s.width=s.height=this.bodyHeight*2.12*boost;s.alpha=1;});
  const di=Math.round(track([[0,2],[1.8,5],[3.6,2]],t%3.6));
  this.dragonSprites.forEach(s=>{s.texture=this.assets.effects.dragon[di];s.position.set(this.bodyHeight*.22,-this.bodyHeight*.87);s.width=s.height=this.bodyHeight*1.87*boost;s.alpha=1;});
 }
 draw(texture,p,size,{height=size,alpha=1,rotation=0,tint=0xffffff,blend='normal',anchor={x:.5,y:.5}}={}){
  if(this.used>=this.pool.length)return;
  const s=this.pool[this.used++];s.texture=texture;s.visible=alpha>.001;s.position.set(p.x,p.y);s.anchor.set(anchor.x,anchor.y);s.width=size;s.height=height;s.alpha=clamp(alpha);s.rotation=rotation;s.tint=tint;s.blendMode=blend;return s;
 }
 sequence(f,p,size){
  // Native alpha already feathers the art. Crossfading two half-alpha dragons
  // made the body transparent; show one complete authored frame for these VFX.
  const spec=this.manifest.effects[f.key],v=clamp(f.frame,0,11),solid=['dragon','eruption','impact'].includes(f.key),i=solid?Math.round(v):Math.floor(v),q=solid?0:v-i,scale=spec.cellSize/spec.sourceCell.width;
  // Keep the real alpha silhouette, including wide dragon horns and ground burst,
  // within the V3 camera. Padded texture dimensions are not visible-art bounds.
  const a=spec.frames[i].anchor,b=spec.visibleBounds,scene=this.engine.scene,margin=36;
  const left=(a.x*spec.cellSize-b.left)/spec.sourceCell.width,right=(b.right-a.x*spec.cellSize)/spec.sourceCell.width;
  const top=(a.y*spec.cellSize-b.top)/spec.sourceCell.width,bottom=(b.bottom-a.y*spec.cellSize)/spec.sourceCell.width;
  size=Math.min(size,(scene.width-margin*2)/(left+right),(scene.height-margin*2)/(top+bottom));
  p={x:clamp(p.x,margin+left*size,scene.width-margin-right*size),y:clamp(p.y,margin+top*size,scene.height-margin-bottom*size)};
  this.activeFrames.push({key:f.key,frame:i,alpha:f.alpha,anchor:{...p},size,targetId:f.targetId??null,solid,bounds:{left:p.x-left*size,right:p.x+right*size,top:p.y-top*size,bottom:p.y+bottom*size}});
  this.draw(this.assets.effects[f.key][i],p,size*scale,{alpha:f.alpha*(1-q),anchor:spec.frames[i].anchor});
  if(q>.001)this.draw(this.assets.effects[f.key][Math.min(11,i+1)],p,size*scale,{alpha:f.alpha*q,anchor:spec.frames[Math.min(11,i+1)].anchor});
 }
 render(t){
  if(this.destroyed)return;this.pool.forEach(s=>s.visible=false);this.used=0;this.activeFrames=[];this.cutinBounds=null;this.areaBounds=null;this.ground.clear();
  const s=sample(this.plan,t);this.sample=s;this.applyPose(s.pose);const p=this.positionAt(s);this.merc.root.position.set(p.x,p.y);this.updateAura(s);
  this.targets.forEach((a,i)=>{a.view.x=this.targetsBase[i].x;a.fullBodySprite.tint=this.targetsBase[i].tint;});
  this.engine.sortCombatDepth();
  if(s.cancelled||s.done||this.motionOnly){if(s.cancelled)this.audio.stop();this.onUpdate(this);return;}
  const scene=this.engine.scene,foot=this.ownPoint(),chest=this.ownPoint(0,-this.bodyHeight*.57),own=this.ownPoint(0,-this.bodyHeight);
  const unit=Math.max(65,Math.hypot(own.x-foot.x,own.y-foot.y)),target=this.point(this.targets[0],.40),floor=this.point(this.targets[0]);
  const army=this.targets.map(a=>this.point(a)),heads=this.targets.map(a=>this.point(a,.85));
  const formation={left:Math.min(...army.map(p=>p.x))-unit*.30,right:Math.max(...army.map(p=>p.x))+unit*.30,top:Math.min(...heads.map(p=>p.y)),bottom:Math.max(...army.map(p=>p.y))+unit*.12};
  const center={x:(formation.left+formation.right)/2,y:Math.max(...army.map(p=>p.y))};
  if(this.plan.mode==='ultimate')this.areaBounds=formation;
  this.currentUnit=unit;
  if(this.auraEnabled){
   this.ground.ellipse(foot.x,foot.y+1,unit*.54,unit*.14).stroke({color:0xe8bf6c,width:1.3,alpha:.35+s.charge*.25});
   for(let i=0;i<20;i++){const phase=(t*.30+i/20)%1,a=i*2.39996+t*.15;this.draw(this.assets.flash,{x:foot.x+Math.cos(a)*unit*(.3+phase*.5),y:foot.y-unit*phase*1.4},2.2+i%3,{height:4+i%4,alpha:Math.sin(phase*Math.PI)*.55,tint:i%3?0xf4bd5e:0xffedbd,blend:'add',rotation:a});}
  }
  if(s.trail){
   for(let i=3;i>=1;i--){const before=sample(this.plan,Math.max(0,t-i*.038)),pos=this.positionAt(before),f=this.manifest.motion[before.pose.key].frames[before.pose.frame],main=this.merc.fullBodySprite;
    const pt=this.engine.effectLayer.toLocal(this.merc.root.parent.toGlobal(pos));const spriteSize=768*this.bodyHeight/f.bodyPixels*Math.abs(this.merc.root.scale.y*this.merc.view.scale.y);
    this.draw(this.assets.motion[before.pose.key][before.pose.frame],pt,spriteSize,{anchor:f.footAnchor,alpha:(4-i)*.058,tint:0xffcd74,blend:'add'});
   }
  }
  for(const e of s.effects){
   if(e.anchor==='allEnemies'){
    for(const a of this.targets)this.sequence({...e,targetId:a.id},this.point(a,.43),unit*1.25);
    continue;
   }
   let point={...target},size=unit*1.7;
   if(e.anchor==='dash'){point={x:chest.x-unit*.45,y:chest.y+unit*.10};size=unit*1.9;}
   if(e.anchor==='selfGround'){point={...foot};size=unit*2.15;}
   if(e.anchor==='blade'){point={x:floor.x-unit*.12,y:target.y};size=unit*1.55;}
   if(e.anchor==='projectile'){const q=clamp((t-.75)/.75);point={x:mix(chest.x+unit*.35,target.x,q),y:mix(chest.y,target.y,q)};size=unit*(1.35+q*.70);}
   if(e.anchor==='ascend'){point={x:chest.x+unit*.32,y:chest.y-unit*.15};size=unit*2.2;}
   if(e.anchor==='armyGround'){
    const spec=this.manifest.effects[e.key],bounds=spec.visibleBounds;
    // Fit the entire actual formation instead of a fixed-size burst at its last row.
    size=Math.max(unit*2,(formation.right-formation.left)*spec.sourceCell.width/(bounds.right-bounds.left),(formation.bottom-formation.top)*spec.sourceCell.width/(bounds.bottom-bounds.top));
    point={x:center.x,y:formation.bottom-(bounds.bottom-spec.frames[0].anchor.y*spec.cellSize)/spec.sourceCell.width*size};
   }
   if(e.anchor==='enemy'){const a=this.targets[e.offset%this.targets.length];point=this.point(a,.43);size=unit*1.25;}
   this.sequence(e,point,size);
  }
  for(const hit of s.impacts){
   const q=hit.age/1.3,fade=(1-q)**2,isUlt=this.plan.mode==='ultimate',origin=isUlt?center:floor;
   const radius=unit*(.20+q*(isUlt?3.1:1.65));
   this.ground.ellipse(origin.x,origin.y+2,radius,radius*.25).stroke({color:0xf7d795,width:2.6*(1-q)+.4,alpha:fade*.8});
   this.ground.ellipse(origin.x,origin.y+2,radius*.71,radius*.18).stroke({color:0xc68130,width:1.4,alpha:fade*.55});
   for(let i=0;i<(isUlt?22:12);i++){const a=i*2.3999,v=unit*(.3+i%6*.11),life=hit.age;const point={x:origin.x+Math.cos(a)*v*life,y:origin.y-unit*.08-Math.abs(Math.sin(a))*v*life+unit*.43*life*life};if(point.y>origin.y+8)continue;this.draw(this.assets.flash,point,3+i%2,{height:7+i%4,rotation:a,alpha:fade*.8,tint:i%3?0xf5c468:0xffedc5,blend:'add'});}
  }
  // No full illustration over the battlefield. Jinmu's small face/dialogue
  // panel lives in its own measured DOM row, and is absent from all raids.
  if(s.flash)for(let i=0;i<this.targets.length;i++){if(this.plan.mode==='attack'&&i>0)break;this.targets[i].fullBodySprite.tint=0xffdd97;this.targets[i].view.x+=Math.sin(s.flash*25)*2;}
  this.onUpdate(this);
 }
 diagnostics(){return {ready:!this.destroyed,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,cancelled:this.sample.cancelled,visibleSprites:this.pool.filter(s=>s.visible).length,activeFrames:this.activeFrames,cutinBounds:this.cutinBounds,areaBounds:this.areaBounds,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,regularAllies:this.engine.allies.length,regularEnemies:this.engine.enemies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='GoldenDragonFX').length,auraVisible:this.auraBack.visible,auraEnabled:this.auraEnabled,motionOnly:this.motionOnly,reducedMotion:this.reducedMotion,audio:{enabled:this.audio.enabled,scheduled:this.audio.scheduled,error:this.audio.error||null},unit:this.currentUnit,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'NONE_VISUAL_PREVIEW',counts:this.manifest.counts}}
 destroy(){if(this.destroyed)return;this.cancel();this.audio.destroy();this.auraBack.destroy({children:true});this.auraFront.destroy({children:true});this.layer.destroy({children:true});for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const texture of frames)texture.destroy(false);this.destroyed=true;this.pool=[];}
}
