import {plan,clamp,track} from './skills.mjs';
import {createNeonPurpleRim} from './NeonPurpleRim.js';
import {createDragonAuraTint} from './DragonAuraTint.js';
import {AreaSkillFX} from './AreaSkillFX.js';
export const ROOT='/assets/ui/project-v/mercenaries/heukmu-20261029/';
const mix=(a,b,t)=>a+(b-a)*t;
export async function loadAssets(spec,runtime){
 const result={motion:{},effects:{},hands:{}},{Assets,Texture,Rectangle}=runtime;
 await Promise.all(['motion','effects'].flatMap(type=>Object.entries(spec[type]).map(async([key,def])=>{const atlas=await Assets.load(ROOT+def.file);result[type][key]=def.frames.map((f,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%def.columns*def.cellWidth,Math.floor(i/def.columns)*def.cellHeight,def.cellWidth,def.cellHeight)}));})));
 await Promise.all(Object.entries(spec.motion).map(async([key,def])=>{const atlas=await Assets.load(ROOT+def.handAtlas.file);result.hands[key]=def.frames.map((f,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%def.columns*def.cellWidth,Math.floor(i/def.columns)*def.cellHeight,def.cellWidth,def.cellHeight)}));}));
 const coil=spec.idleCoil,coilAtlas=await Assets.load(ROOT+coil.file);result.idleCoil=Array.from({length:coil.frameCount},(_,i)=>new Texture({source:coilAtlas.source,frame:new Rectangle(i%coil.columns*coil.cellSize,Math.floor(i/coil.columns)*coil.cellSize,coil.cellSize,coil.cellSize)}));
 result.sword=await Assets.load(ROOT+spec.sword.file);return result;
}
export class HeukmuFX{
 constructor(engine,merc,assets,spec,runtime,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,assets,spec,runtime,onUpdate});this.bodyHeight=spec.bodyHeight;this.clock={time:0};this.speed=2;this.mode='idle';this.plan=plan();this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.targets=engine.enemies.slice();this.tints=this.targets.map(t=>t.fullBodySprite.tint);
  merc.animationController.playFullSpriteMoveAnimation();const Timeline=merc.animationController.timeline?.constructor;merc.animationController.kill();merc.animationAdapter?.kill?.();merc.restoreNeutralAvatarPose?.();if(!Timeline)throw Error('운영 GSAP 시계 누락');this.timelineFactory=o=>new Timeline(o);
  const {Container,Sprite,Graphics}=runtime;this.layer=new Container({label:'HeukmuAuthoredEffects'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);this.sprites=Array.from({length:48},()=>{const s=new Sprite();s.visible=false;this.layer.addChild(s);return s});
  this.area=new AreaSkillFX(this);
  this.previousBodyFilters=merc.fullBodySprite.filters;this.rimFilter=createNeonPurpleRim(engine.app.stage,runtime,spec.outline);merc.fullBodySprite.filters=[...(this.previousBodyFilters||[]),this.rimFilter];
  const z=merc.fullBodySprite.zIndex;merc.view.sortableChildren=true;this.rear=new Container({label:'HeukmuRearAura'});this.rear.zIndex=z-2;merc.view.addChild(this.rear);this.auraSprites=Array.from({length:2},()=>{const s=new Sprite();this.rear.addChild(s);return s});
  this.coilTint=createDragonAuraTint(engine.app.stage,runtime,true);this.dragonTint=createDragonAuraTint(engine.app.stage,runtime,false);this.auraSprites[1].filters=[this.dragonTint];
  this.coilBack=new Sprite({label:'HeukmuUprightCoilBack'});this.coilBack.filters=[this.coilTint];this.rear.addChildAt(this.coilBack,1);
  this.coilFrontGroup=new Container({label:'HeukmuUprightCoilFront'});this.coilFrontGroup.zIndex=z+.5;merc.view.addChild(this.coilFrontGroup);
  this.coilFront=new Sprite();this.coilFront.filters=[this.coilTint];this.coilFrontGroup.addChild(this.coilFront);
  this.coilMask=new Graphics().rect(-400,-this.bodyHeight*.28,800,this.bodyHeight*.40).fill(0xffffff);this.coilFrontGroup.addChild(this.coilMask);this.coilFrontGroup.mask=this.coilMask;
  this.sword=new Sprite({texture:assets.sword,label:'FLAT_PLANAR_SWORD'});this.sword.zIndex=z+1;merc.view.addChild(this.sword);
  this.swordRimFilter=createNeonPurpleRim(engine.app.stage,runtime,spec.outline?.sword||{radius:1.1,strength:2,opacity:.75,haloStrength:.55});this.sword.filters=[this.swordRimFilter];
  this.handOverlay=new Sprite();this.handOverlay.zIndex=z+2;merc.view.addChild(this.handOverlay);merc.view.sortChildren();
  const idle=spec.motion.idle.frames[0],idleAnchor=idle.swordAnchor||spec.sword.grip,length=Math.hypot(spec.sword.tip.x-idleAnchor.x,spec.sword.tip.y-idleAnchor.y);
  this.swordDisplayScale=spec.sword.displayLengthWorld/spec.sword.visibleSwordLengthPixels;
  this.sword.anchor.set(spec.sword.grip.x/assets.sword.width,spec.sword.grip.y/assets.sword.height);this.sword.scale.set(this.swordDisplayScale);this.swordAxis=Math.atan2(spec.sword.tip.y-spec.sword.grip.y,spec.sword.tip.x-spec.sword.grip.x);
  this.auraTime=0;this.auraOffset=0;this.captureFormation();this.render(0);merc.captureNeutralAvatarPose?.();
 }
 get time(){return this.clock.time}get playing(){return this.mode==='idle'||this.time>=this.plan.duration?!!this.ambientTimeline&&!this.ambientTimeline.paused():!!this.timeline&&!this.timeline.paused()}
 captureFormation(){this.start={x:this.merc.baseX,y:this.merc.baseY}}
 stopAmbient(){if(this.ambientRegistration)this.engine.simpleTimelines.delete(this.ambientRegistration);this.ambientTimeline?.kill();this.ambientTimeline=null;this.ambientRegistration=null}
 startAmbient(at=this.auraTime||0){
  this.stopAmbient();if(this.destroyed)return;this.renderAura(at);
  if(!this.reducedMotion){const cycle=this.spec.idleCoil.cycleSeconds,clock={time:at%cycle};this.ambientTimeline=this.timelineFactory({repeat:-1,onUpdate:()=>{if(!this.destroyed)this.renderAura(clock.time)}}).to(clock,{time:clock.time+cycle,duration:cycle,ease:'none'});this.ambientRegistration={instance:this.ambientTimeline,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambientRegistration);}
  this.onUpdate(this);
 }
 removeTimeline(){this.stopAmbient();if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null}
 configure(mode,{autoplay=true}={}){this.auraOffset=this.auraTime;this.removeTimeline();this.mode=mode;this.plan=plan(mode,this.targets.length);this.clock.time=0;this.registration=null;if(mode!=='idle'){this.timeline=this.timelineFactory({paused:true,onUpdate:()=>this.render(this.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);if(this.mode!=='defeat')this.startAmbient();this.onUpdate(this)}}).fromTo(this.clock,{time:0},{time:this.plan.duration,duration:this.plan.duration,ease:'none',immediateRender:false}).timeScale(this.speed);this.registration={instance:this.timeline,settle:()=>this.cancel()}}this.render(0);if(mode==='idle')this.startAmbient(this.auraOffset);else if(autoplay)this.play()}
 play(){if(this.mode==='idle'||this.time>=this.plan.duration){if(this.ambientTimeline)this.ambientTimeline.play();else if(this.mode==='idle')this.startAmbient();else{this.seek(0);this.play()}this.onUpdate(this);return}this.stopAmbient();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this)}
 pause(){this.timeline?.pause();this.ambientTimeline?.pause();this.onUpdate(this)}
 seek(t){this.pause();this.stopAmbient();this.clock.time=clamp(Number(t)||0,0,this.plan.duration);this.timeline?.time(this.time,true);this.render(this.time)}
 replay(){this.seek(0);this.play()}cancel(){if(!this.destroyed)this.configure('idle',{autoplay:false})}
 setSpeed(v){this.speed=clamp(Number(v)||2,.25,2);this.timeline?.timeScale(this.speed);this.ambientTimeline?.timeScale(this.speed);this.onUpdate(this)}
 setMotionOnly(v){this.motionOnly=!!v;this.render(this.time)}setReducedMotion(v){this.reducedMotion=!!v;this.render(this.time);if(this.mode==='idle'||this.time>=this.plan.duration)this.startAmbient(this.auraTime)}
 sample(t){let p=this.plan.poses[0];for(const row of this.plan.poses){if(row[0]>t)break;p=row}return{key:p[1],frame:p[2]}}
 metadata(pose=this.pose){return this.spec.motion[pose.key].frames[pose.frame]}
 applyPose(pose){this.pose=pose;const f=this.metadata(),s=this.merc.fullBodySprite,k=this.bodyHeight/f.bodyPixels;s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.foot.x/f.width,f.foot.y/f.height);s.position.set(0,0);s.rotation=0;s.alpha=1;s.scale.set(k);const n=this.merc.neutralAvatarPose?.mainSprite;if(n)Object.assign(n,{scaleX:k,scaleY:k,x:0,y:0,rotation:0});
  const anchor=f.swordAnchor||this.spec.sword.grip,axis=Math.atan2(this.spec.sword.tip.y-anchor.y,this.spec.sword.tip.x-anchor.x);this.sword.anchor.set(anchor.x/this.assets.sword.width,anchor.y/this.assets.sword.height);this.sword.position.set((f.hand.x-f.foot.x)*k,(f.hand.y-f.foot.y)*k);this.sword.rotation=f.swordAngle*Math.PI/180-axis;this.sword.alpha=1;this.sword.visible=true;
  const h=this.handOverlay;h.texture=this.assets.hands[pose.key][pose.frame];h.anchor.copyFrom(s.anchor);h.position.copyFrom(s.position);h.scale.copyFrom(s.scale);h.rotation=0;h.alpha=1;
 }
 ownPoint(local={x:0,y:0}){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal(local))}
 emission(pose=this.pose){const f=this.metadata(pose);return this.ownPoint({x:(f.emission.x-f.foot.x)*this.bodyHeight/f.bodyPixels,y:(f.emission.y-f.foot.y)*this.bodyHeight/f.bodyPixels})}
 swordTip(){const q=this.spec.sword,a=this.metadata().swordAnchor||q.grip;return this.engine.effectLayer.toLocal(this.sword.toGlobal({x:q.tip.x-a.x,y:q.tip.y-a.y}))}
 targetPoint(actor){const s=actor.fullBodySprite,b=s.getLocalBounds();return this.engine.effectLayer.toLocal(s.toGlobal({x:b.x+b.width*.5,y:b.y+b.height*.49}))}
 draw(bank,frame,p,size,opts={}){if(!this.assets.effects[bank]||this.slot>=this.sprites.length)return;const index=clamp(Math.floor(frame),0,11),s=this.sprites[this.slot++],f=this.spec.effects[bank].frames[index];s.texture=this.assets.effects[bank][index];s.anchor.set(f.anchor.x,f.anchor.y);s.scale.set(size/f.width);if(opts.mirror)s.scale.x*=-1;s.position.set(p.x,p.y);s.rotation=opts.rotation||0;s.alpha=(opts.alpha??1)*(this.reducedMotion?.75:1);s.visible=true;this.effectFrames.push({bank,index,x:p.x,y:p.y,size,role:opts.role||'main'})}
 sequence(bank,t,from,to,p,size,opts={}){if(t<from||t>=to)return;const u=(t-from)/(to-from);this.draw(bank,u*12,p,size,{...opts,alpha:(opts.alpha??1)*Math.min(1,u*12+.3,(1-u)*7)});}
 renderAura(time=0){this.auraTime=time;const coil=this.spec.idleCoil;this.auraFrame=this.reducedMotion?0:Math.floor(time*coil.framesPerSecond)%coil.frameCount;const H=this.bodyHeight,show=!this.motionOnly&&!(this.mode==='defeat'&&this.time>.65);this.rear.visible=this.coilFrontGroup.visible=show;this.auraSprites.forEach(s=>s.visible=false);if(!show)return;
  const dragon=this.spec.idleDragon||{frame:7,xRatio:0,yRatio:-.7,sizeRatio:1.65,alpha:1};
  const fixed=[['aura',0,0,H*1.15,.85,0],['dragon',H*dragon.xRatio,H*dragon.yRatio,H*dragon.sizeRatio,dragon.alpha,dragon.frame]];
  fixed.forEach(([key,x,y,size,alpha,index],i)=>{const a=this.assets.effects[key];if(!a)return;const f=this.spec.effects[key].frames[index],s=this.auraSprites[i];s.texture=a[index];s.anchor.set(f.anchor.x,i===0?(f.visibleBounds.top+f.visibleBounds.bottom)/2/f.height:f.anchor.y);s.position.set(x,y);s.scale.set(size/f.width);s.rotation=0;s.alpha=alpha;s.visible=true;});
  for(const s of [this.coilBack,this.coilFront]){s.texture=this.assets.idleCoil[this.auraFrame];s.anchor.set(.5);s.position.set(0,H*coil.yRatio);s.scale.set(H*coil.sizeRatio/coil.cellSize);s.rotation=0;s.alpha=1;s.visible=true;}
 }
 render(time){if(this.destroyed)return;this.clock.time=clamp(time,0,this.plan.duration);const t=this.time,m=this.merc;this.applyPose(this.sample(t));m.root.position.set(this.start.x,this.start.y);
  if(['attack','cross'].includes(this.mode)&&this.targets.length){const target=this.targets[0],end=this.engine.combatLayer.toLocal(target.root.getGlobalPosition()),q=this.spec.sword,reach=f=>((f.hand.x-f.foot.x)*this.bodyHeight/f.bodyPixels+Math.cos(f.swordAngle*Math.PI/180)*Math.hypot(q.tip.x-q.grip.x,q.tip.y-q.grip.y)*this.sword.scale.x)*m.root.scale.x;
   const span=this.mode==='attack'?reach(this.spec.motion.slash.frames[3]):track([[0,reach(this.spec.motion.cross.frames[2])],[.9,reach(this.spec.motion.cross.frames[2])],[1.18,reach(this.spec.motion.cross.frames[3])]],t),move=this.mode==='attack'?track([[0,0],[.1,0],[.43,1],[1.4,1],[1.82,0]],t):track([[0,0],[.1,0],[.42,1],[2,1],[2.34,0]],t);m.root.x=mix(this.start.x,end.x-span*(this.facing?.()||1),move);m.root.y=mix(this.start.y,end.y,move)}
  if(this.mode==='dash')m.root.x+=Math.sin(clamp(t/this.plan.duration)*Math.PI)*70;
  if(this.mode==='hit'&&!this.reducedMotion)m.root.x-=Math.sin(clamp((t-.08)/.57)*Math.PI)*9;
  m.root.depthSortY=m.root.y;this.engine.sortCombatDepth();this.sprites.forEach(s=>s.visible=false);this.slot=0;this.effectFrames=[];this.contacts=[];this.targets.forEach((n,i)=>n.fullBodySprite.tint=this.tints[i]);
  const foot=this.ownPoint(),head=this.ownPoint({x:0,y:-this.bodyHeight}),unit=Math.hypot(head.x-foot.x,head.y-foot.y),points=this.targets.map(a=>this.targetPoint(a)),center={x:points.reduce((a,p)=>a+p.x,0)/points.length,y:points.reduce((a,p)=>a+p.y,0)/points.length},primary=points[0];
  if(!this.motionOnly){
   if(['dash','attack','cross'].includes(this.mode)){const begin=this.mode==='dash'?.08:.1;this.sequence('dashfx',t,begin,.65,{x:foot.x-unit*.25,y:foot.y-unit*.27},unit*1.15,{alpha:.8,role:'dash-wake'});}
   if(this.mode==='attack'){this.sequence('blade',t,.64,1.36,{x:primary.x-unit*.15,y:primary.y},unit*1.26,{role:'sword-arc'});this.sequence('impact',t,.8,1.65,primary,unit*.95,{role:'contact'});}
   if(this.mode==='cross'){this.sequence('blade',t,.72,1.22,primary,unit*1.2,{rotation:-.3,role:'first-cut'});this.sequence('crossfx',t,1.02,2.02,primary,unit*1.55,{role:'cross-cut'});this.sequence('impact',t,1.24,2.16,primary,unit*.95,{role:'contact'});}
  }
  const screen=this.engine.app.renderer.screen,topLeft=this.engine.effectLayer.toLocal({x:0,y:0}),bottomRight=this.engine.effectLayer.toLocal({x:screen.width,y:screen.height});
  this.area.render(this.mode,t,{foot,unit,points,center,bounds:{left:topLeft.x,top:topLeft.y,right:bottomRight.x,bottom:bottomRight.y}});
  for(const hit of this.plan.hits){const age=t-hit.at;if(age>=0&&age<.15){const p=points[hit.target];if(!p)continue;this.contacts.push({...hit,x:p.x,y:p.y});if(!this.motionOnly)this.targets[hit.target].fullBodySprite.tint=0xc0a6e7;}}
  this.renderAura(t+this.auraOffset);this.onUpdate(this);
 }
 diagnostics(){const f=this.metadata(),s=this.merc.fullBodySprite,b=s.getBounds(),q=this.spec.sword;return{ready:!this.destroyed,id:'heukmu',mode:this.mode,pose:this.pose,time:this.time,duration:this.plan.duration,playing:this.playing,speed:this.speed,motionOnly:this.motionOnly,activeEffects:this.effectFrames.length,effectFrames:this.effectFrames,contacts:this.contacts,actorBounds:{left:b.x,top:b.y,right:b.x+b.width,bottom:b.y+b.height},bodyRegistration:{bodyHeight:this.bodyHeight,renderedReference:f.bodyPixels*s.scale.y,uniform:s.scale.x===s.scale.y},sword:{file:q.file,sha256:q.sha256,generatedReplacementUsed:!!q.generatedReplacementUsed,sourcePixelMismatch:q.rgbMismatch,scaleX:this.sword.scale.x,scaleY:this.sword.scale.y,expectedScale:this.swordDisplayScale,relativeLength:q.visibleSwordLengthPixels*this.swordDisplayScale/this.bodyHeight,aspectRatioPreserved:true,handError:Math.hypot(this.sword.x-(f.hand.x-f.foot.x)*s.scale.x,this.sword.y-(f.hand.y-f.foot.y)*s.scale.y),tip:this.swordTip()},formationSlot:{x:this.merc.baseX,y:this.merc.baseY,scale:this.merc.restScale},outline:{enabled:true,color:0xd12eff,radius:this.spec.outline?.radius??1.6,attachedToBody:true},idleBodyFixed:true,idleTimeline:!!this.merc.animationController.timeline,areaSkill:this.area.diagnostics(),regularAllies:this.engine.allies.length,regularEnemies:this.engine.enemies.length,idleDragon:this.spec.idleDragon,swordOutline:this.spec.outline?.sword,auraFrame:this.auraFrame,auraTime:this.auraTime,auraFixed:true,auraPositionFixed:true,floorAuraFrame:0,idleCoil:{frame:this.auraFrame,frontLayer:true,animated:!this.reducedMotion},registeredTimelines:this.engine.simpleTimelines.size,visualOnly:true,clock:'DEPLOYED_V3_GSAP'}}
 destroy(){if(this.destroyed)return;this.removeTimeline();this.targets.forEach((n,i)=>{if(!n.root.destroyed)n.fullBodySprite.tint=this.tints[i]});if(!this.merc.fullBodySprite.destroyed)this.merc.fullBodySprite.filters=this.previousBodyFilters;this.rimFilter.destroy();this.swordRimFilter.destroy();this.layer.destroy({children:true});this.rear.destroy({children:true});this.coilFrontGroup.destroy({children:true});this.coilTint.destroy();this.dragonTint.destroy();this.assets.idleCoil.forEach(t=>t.destroy(false));this.handOverlay.destroy();this.sword.destroy();for(const type of ['motion','effects','hands'])for(const bank of Object.values(this.assets[type]))bank.forEach(t=>t.destroy(false));this.destroyed=true}
}
