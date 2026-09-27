import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,sample,bladeContact,smooth} from '../motion.mjs';
const ROOT='/preview/battle-suit-x-v1/',HEIGHT=333.70859375,mix=(a,b,t)=>a+(b-a)*t;
export async function loadXAssets(m){
 const out={motion:{},effects:{},idle:await Assets.load(ROOT+m.sourceArt)};
 await Promise.all([
  ...Object.entries(m.motion).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.motion[k]=s.frames.map((f,i)=>new Texture({source:a.source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}));}),
  ...Object.entries(m.effects).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.effects[k]=s.frames.map(f=>new Texture({source:a.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));})
 ]);
 return out;
}
export class XBodyFX{
 constructor(engine,unit,target,assets,manifest,onUpdate){
  Object.assign(this,{engine,unit,target,assets,manifest,onUpdate,mode:'skill',speed:1,zoom:true,disposed:false,effectsEnabled:true,clock:{time:0}});
  unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.nameHud.visible=false;
  this.back=new Container({label:'XBodyPreviewBackFX'});this.back.eventMode='none';engine.backgroundLayer.addChild(this.back);
  this.front=new Container({label:'XBodyPreviewFrontFX'});this.front.eventMode='none';engine.effectLayer.addChild(this.front);
  this.shade=new Graphics();this.back.addChild(this.shade);
  this.ghostPool=Array.from({length:4},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.pool=Array.from({length:8},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.capture();this.makeTimeline();this.render(0);
 }
 capture(){this.home={x:this.unit.root.baseX,y:this.unit.root.baseY};}
 get time(){return this.clock.time;}
 get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&this.time<MODES[this.mode].duration);}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);}})
   .to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.disposed)return;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.unit.stopIdle();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(MODES[this.mode].duration,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;this.clock.time=0;this.makeTimeline();this.render(0);}
 setSpeed(n){this.speed=Math.max(.25,Math.min(2,Number(n)||1));this.timeline?.timeScale(this.speed);}
 setEffects(enabled){this.effectsEnabled=enabled;this.back.visible=enabled;this.front.visible=enabled;}
 contact(){const h=this.target.fullBodyHeight||300;return this.unit.root.parent.toLocal(this.target.root.toGlobal({x:0,y:-h*.52}));}
 targetFeet(){return this.unit.root.parent.toLocal(this.target.root.toGlobal({x:0,y:0}));}
 pose(p){return this.manifest.motion[p.bank].frames[p.index];}
 rootFor(state){
  const feet=this.targetFeet(),size=HEIGHT*this.unit.root.scale.x,scale=size/360;
  // Only choose lateral reach. Ground Y is the enemy's ground plane, never solved from sword tip Y.
  const reach=(bank,index,dir)=>{const f=this.manifest.motion[bank].frames[index];return feet.x-dir*((f.grip.x-f.pivot.x)+(f.tip.x-f.grip.x)*.58)*scale;};
  const anchors={
   home:this.home,
   left:{x:reach('combo',1,1),y:feet.y},
   right:{x:reach('combo',2,-1),y:feet.y},
   rise:{x:reach('combo',3,1),y:feet.y},
   finish:{x:reach('combo',7,1),y:feet.y},
   air:{x:feet.x-size*.74,y:feet.y}
  };
  const a=anchors[state.path.from],b=anchors[state.path.to],q=state.path.mix;
  return{x:mix(a.x,b.x,q),y:mix(a.y,b.y,q)-state.lift*size,groundY:mix(a.y,b.y,q)};
 }
 applyPose(p,idle=false){
  const s=this.unit.bodySprite;
  if(idle){
   s.texture=this.assets.idle;s.anchor.set(600/1145,1351/1374);s.scale.set(HEIGHT/1317);
  }else{
   const f=this.pose(p);s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360);
  }
  s.position.set(0,0);this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(idle?1:p.facing,1);
 }
 layerPoint(p,layer=this.front){return layer.toLocal(this.unit.root.parent.toGlobal(p));}
 bladePoints(state,root){
  const f=this.pose(state.pose),s=HEIGHT/360*this.unit.root.scale.x,dir=state.pose.facing;
  const point=p=>({x:root.x+(p.x-f.pivot.x)*s*dir,y:root.y+(p.y-f.pivot.y)*s});
  return{grip:point(f.grip),tip:point(f.tip)};
 }
 drawGhosts(state){
  this.ghostPool.forEach(s=>s.visible=false);
  if(!state.ghosts)return;
  const offsets=[.032,.063,.10,.145];
  offsets.forEach((ago,i)=>{
   if(state.time<ago)return;const past=sample(this.mode,state.time-ago),r=this.rootFor(past),f=this.pose(past.pose),s=this.ghostPool[i];
   const distance=Math.hypot(r.x-this.unit.root.x,r.y-this.unit.root.y);
   // Draw pose history only while actually traveling or changing articulated drawing.
   if(distance<2&&past.pose.bank===state.pose.bank&&past.pose.index===state.pose.index)return;
   s.texture=this.assets.motion[past.pose.bank][past.pose.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);
   s.scale.set(HEIGHT/360*this.unit.root.scale.x*past.pose.facing,HEIGHT/360*this.unit.root.scale.y);
   const p=this.layerPoint(r,this.back);s.position.set(p.x,p.y);s.tint=i%2?0x6ad5ff:0xd7c5a0;s.alpha=[.28,.19,.12,.07][i];s.blendMode='add';s.visible=true;
  });
 }
 render(t){
  if(this.disposed)return;
  const u=this.unit,e=this.engine,state=this.state=sample(this.mode,t),size=HEIGHT*u.root.scale.x;
  this.pool.forEach(p=>p.visible=false);this.shade.clear();
  const idle=t<=0||state.done;this.applyPose(state.pose,idle);
  const r=t<=0?{...this.home,groundY:this.home.y}:this.rootFor(state);
  u.root.position.set(r.x,r.y);u.root.depthSortY=r.groundY;e.sortCombatDepth();
  if(t<=0)state.phase='대기';
  const torso=this.contact(),targetFeet=this.targetFeet(),bodyPoint=this.layerPoint(torso),groundPoint=this.layerPoint(targetFeet),actorFeet=this.layerPoint(r);
  this.drawGhosts(state);
  const bp=this.bladePoints(state,r),targetHeight=(this.target.fullBodyHeight||300)*this.target.root.scale.y;
  this.collision=bladeContact(bp.grip,bp.tip,torso,targetHeight*.34);
  this.groundError=Math.abs(r.y+state.lift*size-r.groundY);
  state.effects.forEach((fx,i)=>{
   const s=this.pool[i];s.texture=this.assets.effects[fx.key][fx.frame];s.visible=true;s.alpha=fx.alpha;s.blendMode='normal';s.rotation=fx.angle;s.anchor.set(.5);
   let p=bodyPoint,width=size*fx.width;
   if(fx.anchor==='wake'){
    p={x:actorFeet.x-size*.05*state.pose.facing,y:actorFeet.y-size*.46};
    s.anchor.set(.82,.55);s.blendMode='add';
   }
   if(fx.anchor==='ground'){
    p=groundPoint;s.anchor.set(.5,fx.key==='ground-v2'?.88:.83);
   }
   if(fx.key==='cut-v2')s.alpha*=.83;
   if(fx.key==='cross-v2')s.alpha*=.86;
   s.scale.set(width/s.texture.width);
   if(fx.anchor==='wake')s.scale.x*=state.pose.facing;
   s.position.set(p.x,p.y);
  });
  if(this.mode==='skill'&&t>.16&&t<3.18){
   const opacity=Math.min(.28,smooth((t-.16)/.2)*.28,smooth((3.18-t)/.5)*.28);
   this.shade.rect(-2000,-2000,6000,6000).fill({color:0x030b16,alpha:opacity});
  }
  const last=this.mode==='skill'&&t>=2.18;
  this.target.view.x=state.impact*Math.sin((t-(last?2.18:0))*90)*(last?10:5);
  this.target.view.y=-state.impact*(last?4:1.5);
  if(this.zoom){
   // Stable two-fighter framing for the flurry; widen and rise for the overhead windup.
   const airborne=this.mode==='skill'?smooth((t-1.48)/.24)*(1-smooth((t-2.85)/.30)):0;
   const entry=smooth(t/.34);
   const pairCenter=(u.root.x+torso.x)/2+Math.sign(u.root.x-torso.x)*size*.16;
   const closeCenter=e.mobile?mix(pairCenter,torso.x-size*.04,airborne):torso.x-size*.08;
   const focus={x:mix((this.home.x+torso.x)/2,closeCenter,entry),y:targetFeet.y-size*(.62+airborne*.60)};
   const desired=(e.mobile?2.45:2.15)-airborne*.70;
   const available=e.scene.width*.92/Math.max(size*(e.mobile?2.25:3.05),Math.abs(u.root.x-torso.x)+size*1.2);
   const zoom=Math.min(desired,available);
   const shake=state.impact*(last?5.5:1.8);
   // Keep Stage at CameraController's base position. Framing lives in the pivot;
   // otherwise the shared parallax bands treat a review offset as camera shake and split apart.
   e.camera.focusAt({x:focus.x,y:focus.y+e.scene.height*.10/zoom},zoom);
   e.stage.position.set(e.camera.base.x+Math.sin(t*112)*shake,e.camera.base.y+Math.cos(t*97)*shake*.6);
  }else e.camera.reset(true);
  this.onUpdate(this);
 }
 cancel(){this.removeTimeline();this.clock.time=0;if(!this.disposed)this.render(0);}
 diagnostics(){
  return{ready:!this.disposed,version:this.manifest.version,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,frame:this.state?.frame,pose:this.state?.pose,phase:this.state?.phase,
   contactCount:this.state?.contactCount,bladeContact:this.collision,groundError:this.groundError,airborne:this.state?.lift>0,
   visibleEffects:this.pool.filter(s=>s.visible).length,visibleGhosts:this.ghostPool.filter(s=>s.visible).length,
   registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,...this.manifest.summary,
   weaponSha256:this.manifest.weapon.sha256,regularAllies:this.engine.allies.length,clock:'V3_REGISTERED_GSAP',liveEnabled:false,
   actor:{x:this.unit.root.x,y:this.unit.root.y},contact:this.contact(),ground:this.targetFeet()};
 }
 destroy(){
  if(this.disposed)return;this.cancel();this.disposed=true;this.engine.camera.reset(true);this.target.view.position.set(0,0);this.unit.view.scale.set(1);
  this.front.destroy({children:true});this.back.destroy({children:true});this.unit.swordAnimation?.ready();
  for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const t of frames)t.destroy(false);
 }
}
