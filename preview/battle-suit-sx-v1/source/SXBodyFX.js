import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,EFFECT_BANKS,sample,bladeContact,smooth} from '../motion.mjs';
import {SXTitle} from './SXTitle.js';
const ROOT='/preview/battle-suit-sx-v1/',HEIGHT=333.70859375,mix=(a,b,t)=>a+(b-a)*t;
export async function loadSXAssets(m){
 const out={motion:{},effects:{},idle:await Assets.load(ROOT+m.sourceArt),title:await Assets.load(ROOT+m.titleArt)};
 await Promise.all([
  ...Object.entries(m.motion).filter(([k])=>Object.values(MODES).some(mode=>mode.poses.some(p=>p.bank===k))).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.motion[k]=s.frames.map((f,i)=>new Texture({source:a.source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}));}),
  ...Object.entries(m.effects).filter(([key])=>EFFECT_BANKS.includes(key)).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.effects[k]=s.frames.map(f=>new Texture({source:a.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));})
 ]);return out;
}
export class SXBodyFX{
 constructor(engine,unit,target,assets,manifest,onUpdate){
  Object.assign(this,{engine,unit,target,assets,manifest,onUpdate,mode:'idle',speed:1,zoom:true,disposed:false,effectsEnabled:true,clock:{time:0},cancelled:false});
  unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.nameHud.visible=false;
  this.back=new Container({label:'SXBehindActorFX',eventMode:'none'});engine.backgroundLayer.addChild(this.back);
  this.front=new Container({label:'SXBladeAndImpactFX',eventMode:'none'});engine.effectLayer.addChild(this.front);
  this.shade=new Graphics();this.back.addChild(this.shade);
  this.ambient=Array.from({length:2},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.ghostPool=Array.from({length:6},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.rims=Array.from({length:4},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.bladeAura=new Sprite();this.bladeAura.visible=false;this.front.addChild(this.bladeAura);
  this.pool=Array.from({length:16},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.particles=new Graphics();this.back.addChild(this.particles);
  this.title=new SXTitle(unit,assets.title);this.front.addChild(this.title.view);this.capture();this.makeTimeline();this.render(0);
 }
 capture(){this.home={x:this.unit.root.baseX,y:this.unit.root.baseY};}
 get time(){return this.clock.time;}
 get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&(MODES[this.mode].loop||this.time<MODES[this.mode].duration));}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();this.timeline=gsap.timeline({paused:true,repeat:MODES[this.mode].loop?-1:0,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);}}).to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.disposed)return;this.cancelled=false;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.unit.stopIdle();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;this.cancelled=false;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(MODES[this.mode].duration,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;this.clock.time=0;this.cancelled=false;this.makeTimeline();this.render(0);}
 setSpeed(n){this.speed=Math.max(.25,Math.min(2,Number(n)||1));this.timeline?.timeScale(this.speed);}
 setEffects(enabled){this.effectsEnabled=Boolean(enabled);this.back.visible=this.effectsEnabled;this.render(this.time);}
 contact(){const h=this.target.fullBodyHeight||300;return this.unit.root.parent.toLocal(this.target.root.toGlobal({x:0,y:-h*.52}));}
 targetFeet(){return this.unit.root.parent.toLocal(this.target.root.toGlobal({x:0,y:0}));}
 pose(p){return this.manifest.motion[p.bank].frames[p.index];}
 rootFor(state){
  const feet=this.targetFeet(),torso=this.contact(),size=HEIGHT*this.unit.root.scale.x,scale=size/360;
  // Find the crossing of the diagonal blade and target torso without lifting or deforming the grounded actor.
  const reach=(bank,index,dir)=>{const f=this.manifest.motion[bank].frames[index],dy=(f.tip.y-f.grip.y)*scale,u=Math.max(.12,Math.min(.88,(torso.y-feet.y-(f.grip.y-f.pivot.y)*scale)/dy));return torso.x-dir*((f.grip.x-f.pivot.x)+(f.tip.x-f.grip.x)*u)*scale;};
  const anchors={home:this.home,left:{x:reach('sweep',2,1),y:feet.y},right:{x:reach('rise',1,-1),y:feet.y},sweepRight:{x:reach('sweep',2,-1),y:feet.y},rise:{x:reach('rise',1,1),y:feet.y},finish:{x:reach('sweep',2,1),y:feet.y},ultimateFinish:{x:reach('spin',3,1),y:feet.y},charge:{x:feet.x-size*.9,y:feet.y},air:{x:feet.x-size*.68,y:feet.y}};
  const a=anchors[state.path.from],b=anchors[state.path.to],q=state.path.mix,groundY=mix(a.y,b.y,q);return{x:mix(a.x,b.x,q),y:groundY-state.lift*size,groundY};
 }
 applyPose(p,idle){
  const s=this.unit.bodySprite;
  if(idle){s.texture=this.assets.idle;s.anchor.set(this.manifest.idle.pivot.x/s.texture.width,this.manifest.idle.pivot.y/s.texture.height);s.scale.set(HEIGHT/this.manifest.idle.bodyPixels);}
  else{const f=this.pose(p);s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360);}
  // Color lock applies to the actor; blue is restricted to separate effect/afterimage sprites.
  s.tint=0xffffff;s.alpha=1;s.blendMode='normal';s.position.set(0,0);this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(idle?1:p.facing,1);
 }
 layerPoint(p,layer=this.front){return layer.toLocal(this.unit.root.parent.toGlobal(p));}
 bladePoints(state,r,idle=false){const f=idle?this.manifest.idle:this.pose(state.pose),s=HEIGHT/f.bodyPixels*this.unit.root.scale.x,dir=idle?1:state.pose.facing,point=p=>({x:r.x+(p.x-f.pivot.x)*s*dir,y:r.y+(p.y-f.pivot.y)*s});return{grip:point(f.grip),tip:point(f.tip)};}
 drawBladeAura(t,state,bp){
  const s=this.bladeAura;s.visible=false;this.bladeAuraError=null;
  if(!this.effectsEnabled||this.cancelled||state.done||t<=0)return;
  const frame=Math.floor(t*12)%12,a=this.manifest.effects.blade.frames[frame].attachment;
  const start=this.layerPoint({x:mix(bp.grip.x,bp.tip.x,.065),y:mix(bp.grip.y,bp.tip.y,.065)}),end=this.layerPoint(bp.tip),dx=end.x-start.x,dy=end.y-start.y;
  const scale=Math.hypot(dx,dy)/(a.tip.x-a.root.x);s.texture=this.assets.effects.blade[frame];s.anchor.set(a.root.x/512,a.root.y/512);s.position.set(start.x,start.y);s.rotation=Math.atan2(dy,dx);s.scale.set(scale,scale*.82);s.alpha=1;s.tint=0xffffff;s.blendMode='normal';s.visible=true;
  const actual=s.toGlobal({x:a.tip.x-a.root.x,y:a.tip.y-a.root.y}),expected=this.front.toGlobal(end);this.bladeAuraError=Math.hypot(actual.x-expected.x,actual.y-expected.y);
 }
 drawGhosts(state){
  this.ghostPool.forEach(s=>s.visible=false);if(!this.effectsEnabled||state.done||this.cancelled)return;
  const offsets=[.028,.055,.09,.13,.18,.24],alphas=[.27,.205,.15,.105,.07,.04],size=HEIGHT*this.unit.root.scale.x;
  offsets.forEach((ago,i)=>{
   if(state.time<=ago)return;const past=sample(this.mode,state.time-ago),r=this.rootFor(past),f=this.pose(past.pose),s=this.ghostPool[i],distance=Math.hypot(r.x-this.unit.root.x,r.y-this.unit.root.y);
   if(distance<Math.max(1,size*.018))return;
   s.texture=this.assets.motion[past.pose.bank][past.pose.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360*this.unit.root.scale.x*past.pose.facing,HEIGHT/360*this.unit.root.scale.y);
   const p=this.layerPoint(r,this.back);s.position.set(p.x,p.y);s.tint=i%2?0x2065ff:0x72b5ff;s.alpha=alphas[i]*Math.min(1,distance/(size*.16));s.blendMode='add';s.visible=true;
  });
 }
 drawAmbient(t,state,r,idle){
  this.ambient.forEach(s=>s.visible=false);this.rims.forEach(s=>s.visible=false);this.particles.clear();
  if(!this.effectsEnabled||this.cancelled||state.done||t<=0)return;
  const size=HEIGHT*this.unit.root.scale.x,p=this.layerPoint(r,this.back),ground=this.layerPoint({x:r.x,y:r.groundY},this.back),frame=Math.floor(t*10)%12;
  const aura=this.ambient[0];aura.texture=this.assets.effects.aura[frame];aura.anchor.set(.5,.53);aura.width=size*1.55;aura.height=size*1.40;aura.position.set(p.x,p.y-size*.49);aura.alpha=1;aura.blendMode='normal';aura.visible=true;
  const light=this.ambient[1];light.texture=this.assets.effects.light[Math.floor(t*8)%12];light.anchor.set(.5);light.width=size*1.65;light.height=size*1.2;light.position.set(ground.x,ground.y);light.alpha=.55;light.blendMode='add';light.visible=true;
  const body=this.unit.bodySprite,dir=idle?1:state.pose.facing;
  this.rims.forEach((s,i)=>{s.texture=body.texture;s.anchor.copyFrom(body.anchor);s.scale.set(body.scale.x*this.unit.root.scale.x*dir,body.scale.y*this.unit.root.scale.y);s.position.set(p.x+(i%2?1:-1)*size*.006,p.y+(i<2?-1:1)*size*.006);s.tint=0x3982ff;s.alpha=.16+.03*Math.sin(t*3);s.blendMode='add';s.visible=true;});
  for(let i=0;i<16;i++){const q=(t*.28+i*.0617)%1,side=i%2?-1:1,x=p.x+side*size*(.2+.22*Math.sin(i*2.1)),y=p.y-size*q;this.particles.circle(x,y,Math.max(.5,size*.009*(1-q))).fill({color:i%3?0x438aff:0xa3dfff,alpha:Math.sin(q*Math.PI)*.42});}
 }
 render(t){
  if(this.disposed)return;const u=this.unit,e=this.engine,state=this.state=sample(this.mode,t),size=HEIGHT*u.root.scale.x,idle=this.mode==='idle'||t<=0||state.done;
  this.pool.forEach(s=>s.visible=false);this.shade.clear();this.applyPose(state.pose,idle);
  const r=t<=0||state.done?{...this.home,groundY:this.home.y}:this.rootFor(state);u.root.position.set(r.x,r.y);u.root.depthSortY=r.groundY;e.sortCombatDepth();
  this.drawAmbient(t,state,r,idle);this.drawGhosts(state);
  const torso=this.contact(),feet=this.targetFeet(),bodyPoint=this.layerPoint(torso),groundPoint=this.layerPoint(feet),actorPoint=this.layerPoint(r),bp=this.bladePoints(state,r,idle),targetHeight=(this.target.fullBodyHeight||300)*this.target.root.scale.y;
  this.drawBladeAura(t,state,bp);
  this.collision=bladeContact(bp.grip,bp.tip,torso,targetHeight*.34);this.groundError=Math.abs(r.y+state.lift*size-r.groundY);
  if(this.effectsEnabled&&!this.cancelled&&!state.done)state.effects.slice(0,this.pool.length).forEach((fx,i)=>{
   const s=this.pool[i];s.texture=this.assets.effects[fx.key][fx.frame];s.anchor.set(.5);s.scale.set(size*fx.width/s.texture.width);s.alpha=fx.alpha;s.rotation=fx.angle;s.blendMode='normal';s.visible=true;let p=bodyPoint;
   if(fx.anchor==='wake'){const past=this.rootFor(sample(this.mode,Math.max(0,t-.035))),dir=Math.sign(r.x-past.x)||state.pose.facing;p={x:actorPoint.x-size*.08*dir,y:actorPoint.y-size*.43};s.anchor.set(.78,.5);s.scale.x*=dir;s.blendMode='add';}
   if(fx.anchor==='ground'){p=groundPoint;s.anchor.set(.5,fx.key==='ground'?.78:.86);}
   if(fx.anchor==='cleave'){p=groundPoint;s.anchor.set(.84,.83);}
   if(fx.anchor==='orbit')p={x:mix(actorPoint.x,bodyPoint.x,.45),y:actorPoint.y-size*.51};
   if(fx.anchor==='charge')p={x:actorPoint.x+size*.05,y:actorPoint.y-size*.83};
   s.position.set(p.x,p.y);
  });
  if(this.effectsEnabled&&this.mode==='ultimate'&&t>.12&&t<4.65)this.shade.rect(-2000,-2000,6000,6000).fill({color:0x030717,alpha:Math.min(.22,smooth((t-.12)/.3)*.22,smooth((4.65-t)/.5)*.22)});
  this.target.view.x=state.impact*Math.sin(t*91)*(this.mode==='ultimate'?7:4);this.target.view.y=-state.impact*3;
  const f=this.pose(state.pose),dir=idle?1:state.pose.facing,bodyScale=idle?HEIGHT/1330:HEIGHT/360;
  const box=idle?{left:18,top:132,width:990,height:1347}:f.componentBox;
  const sourceScale=idle?bodyScale:f.uniformScale*bodyScale,foot=idle?[485,1474]:f.sourceFoot;
  const lx=(box.left-foot[0])*sourceScale*dir,rx=(box.left+box.width-foot[0])*sourceScale*dir;
  const artTop=(box.top-foot[1])*sourceScale,artBottom=(box.top+box.height-foot[1])*sourceScale;
  const headX=idle?7.5:(f.head.x-f.pivot.x)*bodyScale*dir,titleScale=u.root.scale.x*(e.mobile?1.30:1);
  // Reserve the mode's highest sword pose once, so the title and camera do not jump with every rapid cut.
  const modeTop=idle?-HEIGHT:Math.min(-HEIGHT,...MODES[this.mode].poses.map(p=>{const f=this.pose(p);return(f.componentBox.top-f.sourceFoot[1])*f.uniformScale*HEIGHT/360;}));
  const titleWorld={x:r.x+headX*u.root.scale.x,y:r.y+Math.min(modeTop,artTop)*u.root.scale.y-(this.title.bottom+18)*titleScale};
  this.title.render(t,this.layerPoint(titleWorld),this.effectsEnabled&&!this.cancelled&&t>0&&!state.done,titleScale);
  if(this.zoom){
   // Frame the actual complete drawing (including an upright sword) and title.
   let minX=Math.min(r.x+Math.min(lx,rx)*u.root.scale.x,titleWorld.x-this.title.halfWidth*titleScale),maxX=Math.max(r.x+Math.max(lx,rx)*u.root.scale.x,titleWorld.x+this.title.halfWidth*titleScale);
   let minY=Math.min(r.y+artTop*u.root.scale.y,titleWorld.y-this.title.top*titleScale),maxY=Math.max(r.groundY+size*.12,r.y+artBottom*u.root.scale.y);
   if(this.mode!=='idle'){minX=Math.min(minX,feet.x-targetHeight*.60);maxX=Math.max(maxX,feet.x+targetHeight*.60);minY=Math.min(minY,feet.y-targetHeight*1.22);maxY=Math.max(maxY,feet.y+size*.20);}
   if(this.effectsEnabled&&state.effects.some(x=>x.key==='execution'))minY=Math.min(minY,feet.y-size*(this.mode==='ultimate'?2.25:1.85));
   // Keep the actor readable during the huge finisher; wind and light may bloom to the screen edges.
   const width=Math.max(size*(this.mode==='idle'?1.80:2.60),maxX-minX+size*.18),height=Math.max(size*1.80,maxY-minY+size*.15);
   const zoom=Math.min(e.mobile?2.25:2.05,e.scene.width*.89/width,e.scene.height*.70/height);
   const focus={x:(minX+maxX)*.5,y:(minY+maxY)*.5};
   e.camera.focusAt({x:focus.x,y:focus.y+e.scene.height*.04/zoom},zoom);const shake=this.effectsEnabled?state.impact*(this.mode==='ultimate'?4.5:1.8):0;e.stage.position.set(e.camera.base.x+Math.sin(t*112)*shake,e.camera.base.y+Math.cos(t*97)*shake*.5);
  }else e.camera.reset(true);
  const a=u.root.parent.toGlobal({x:r.x+Math.min(lx,rx)*u.root.scale.x,y:r.y+artTop*u.root.scale.y}),b=u.root.parent.toGlobal({x:r.x+Math.max(lx,rx)*u.root.scale.x,y:r.y+artBottom*u.root.scale.y});
  this.artScreenBounds={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)};
  this.onUpdate(this);
 }
 cancel(){this.removeTimeline();this.clock.time=0;this.cancelled=true;if(!this.disposed)this.render(0);}
 diagnostics(){return{ready:!this.disposed,version:this.manifest.version,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,frame:this.state?.frame,pose:this.state?.pose,phase:this.state?.phase,contactCount:this.state?.contactCount,bladeContact:this.collision,groundError:this.groundError,airborne:this.state?.lift>0,visibleEffects:this.effectsEnabled?[...this.pool,...this.ambient,...this.rims,this.bladeAura].filter(s=>s.visible).length:0,bodyAuraAlpha:this.ambient[0].visible?this.ambient[0].alpha:0,bladeAuraVisible:this.bladeAura.visible,bladeAuraAttachmentError:this.bladeAuraError,visibleGhosts:this.effectsEnabled?this.ghostPool.filter(s=>s.visible).length:0,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,...this.manifest.summary,artScreenBounds:this.artScreenBounds,mainBodyTint:this.unit.bodySprite.tint,bodyUniformScale:Math.abs(this.unit.bodySprite.scale.x)===Math.abs(this.unit.bodySprite.scale.y),title:this.title.diagnostics(),regularAllies:this.engine.allies.length,clock:'V3_REGISTERED_GSAP',liveEnabled:false,actor:{x:this.unit.root.x,y:this.unit.root.y},contact:this.contact(),ground:this.targetFeet(),actorScale:this.unit.root.scale.x,source:this.manifest.sourceSha256};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.engine.camera.reset(true);this.target.view.position.set(0,0);this.unit.view.scale.set(1);this.title.destroy();this.front.destroy({children:true});this.back.destroy({children:true});for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const t of frames)t.destroy(false);}
}
