import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,sample,bladeContact,smooth,clamp} from '../motion.mjs';
import {makeSatinGoldFilter} from './SatinGoldFilter.js';
import {RoyalAura} from './RoyalAura.js';
const ROOT='/preview/battle-suit-crimson-gold-knight-20261005-v1/',HEIGHT=350,mix=(a,b,t)=>a+(b-a)*t;
const TIGER_HEADS=[[.84,.66],[.76,.66],[.74,.65],[.74,.65],[.85,.56],[.76,.55],[.81,.73],[.77,.73],[.83,.47],[.80,.51],[.80,.53],[.80,.53]];
export async function loadKnightAssets(m){
 const out={motion:{},effects:{},idle:await Assets.load(ROOT+m.sourceArt),auraFlash:await Assets.load('/preview/battle-suit-skill-chip-v1/assets/textures/flash.webp')};
 await Promise.all([
 ...Object.entries(m.motion).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.motion[k]=s.frames.map((f,i)=>new Texture({source:a.source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}));}),
 ...Object.entries(m.effects).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.effects[k]=s.frames.map(f=>new Texture({source:a.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));})
 ]);return out;
}
export class KnightFX{
 constructor(engine,unit,targets,assets,manifest,onUpdate){
  Object.assign(this,{engine,unit,targets,target:targets[0],assets,manifest,onUpdate,mode:'skill',speed:1,zoom:true,disposed:false,effectsEnabled:true,clock:{time:0}});
  unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.nameHud.visible=false;
  this.back=new Container({label:'CrimsonKnightBackFX'});this.front=new Container({label:'CrimsonKnightFrontFX'});
  this.back.eventMode=this.front.eventMode='none';engine.backgroundLayer.addChild(this.back);engine.effectLayer.addChild(this.front);
  this.shade=new Graphics();this.back.addChild(this.shade);
  this.ghostPool=Array.from({length:4},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.pool=Array.from({length:24},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  // A planted blade passes behind the ground plane. Atlas always preserves the full blade.
  this.groundMask=new Graphics().rect(-2000,-3000,4000,3007).fill(0xffffff);unit.root.addChild(this.groundMask);this.groundMask.visible=false;
  this.matteEnabled=true;this.materialFilter=makeSatinGoldFilter();unit.bodySprite.filters=[this.materialFilter];
  this.aura=new RoyalAura(unit,assets,manifest);
  this.capture();this.makeTimeline();this.render(0);
 }
 capture(){this.home={x:this.unit.root.baseX,y:this.unit.root.baseY};}
 get time(){return this.clock.time;}
 get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&this.time<MODES[this.mode].duration);}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();this.timeline=gsap.timeline({paused:true,repeat:this.mode==='look'||this.mode==='idle'?-1:0,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);}})
   .to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.disposed)return;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.unit.stopIdle();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(MODES[this.mode].duration,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;for(const actor of [...this.engine.allies,...this.engine.enemies])actor.root.visible=mode!=='look';if(this.engine.isoFloorLayer)this.engine.isoFloorLayer.visible=mode!=='look';this.clock.time=0;this.makeTimeline();this.render(0);}
 setSpeed(n){this.speed=Math.max(.25,Math.min(2,Number(n)||1));this.timeline?.timeScale(this.speed);}
 setEffects(v){this.effectsEnabled=v;this.back.visible=this.front.visible=v;}
 setMatte(v){this.matteEnabled=!!v;this.unit.bodySprite.filters=v?[this.materialFilter]:null;this.render(this.time);}
 setAura(v){this.aura.enabled=!!v;this.render(this.time);}
 setAuraPalette(key){this.aura.setPalette(key);this.render(this.time);}
 point(target,y=0){return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y}));}
 contact(){return this.point(this.target,-(this.target.fullBodyHeight||300)*.52);}
 targetFeet(){return this.point(this.target);}
 pose(p){return this.manifest.motion[p.bank].frames[p.index];}
 bounds(){
  const ps=this.targets.map(t=>this.point(t)),size=HEIGHT*this.unit.root.scale.x;
  const minX=Math.min(...ps.map(p=>p.x)),maxX=Math.max(...ps.map(p=>p.x)),floor=ps.reduce((n,p)=>n+p.y,0)/ps.length;
  return{points:ps,minX,maxX,floor,size,center:{x:(minX+maxX)/2,y:floor},caster:{x:minX-size*1.35,y:floor+size*.18}};
 }
 rootFor(state){
  const feet=this.targetFeet(),torso=this.contact(),size=HEIGHT*this.unit.root.scale.x,scale=size/360;
  const reach=(bank,index)=>{
   const f=this.manifest.motion[bank].frames[index],dy=(f.tip.y-f.grip.y)*scale;
   const u=Math.abs(dy)>2?Math.max(.24,Math.min(.84,(torso.y-feet.y-(f.grip.y-f.pivot.y)*scale)/dy)):.58;
   return{x:torso.x-((f.grip.x-f.pivot.x)+(f.tip.x-f.grip.x)*u)*scale,y:feet.y};
  };
  const anchors={home:this.home,strike:reach('attack',3),rise:reach('combo',1),reverse:reach('combo',5),finish:reach('skill',5),air:{x:feet.x-size*.88,y:feet.y},caster:this.bounds().caster};
  const a=anchors[state.path.from],b=anchors[state.path.to],q=state.path.mix,groundY=mix(a.y,b.y,q);
  return{x:mix(a.x,b.x,q),y:groundY-state.lift*size,groundY};
 }
 applyPose(state){
  const s=this.unit.bodySprite,p=state.pose,f=this.pose(p),original=this.mode==='look'||this.mode==='idle'||state.time<=0||state.done;
  if(original){s.texture=this.assets.idle;s.anchor.set(550/1024,1511/1536);s.scale.set(HEIGHT/1495);}
  else{s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360);}
  s.position.set(0,0);this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(original?1:p.facing,1);
  this.unit.view.mask=state.buried?this.groundMask:null;this.groundMask.visible=state.buried;
 }
 layerPoint(p,layer=this.front){return layer.toLocal(this.unit.root.parent.toGlobal(p));}
 bladePoints(state,r){
  const f=this.pose(state.pose),s=HEIGHT/360*this.unit.root.scale.x,dir=state.pose.facing;
  const point=p=>({x:r.x+(p.x-f.pivot.x)*s*dir,y:r.y+(p.y-f.pivot.y)*s});
  return{grip:point(f.grip),tip:point(f.tip)};
 }
 drawGhosts(state){
  this.ghostPool.forEach(s=>s.visible=false);if(!state.ghosts)return;
  [.035,.07,.105,.145].forEach((ago,i)=>{
   if(state.time<ago)return;const past=sample(this.mode,state.time-ago),r=this.rootFor(past),f=this.pose(past.pose),s=this.ghostPool[i];
   if(Math.hypot(r.x-this.unit.root.x,r.y-this.unit.root.y)<2&&past.pose.bank===state.pose.bank&&past.pose.index===state.pose.index)return;
   s.texture=this.assets.motion[past.pose.bank][past.pose.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360*this.unit.root.scale.x*past.pose.facing,HEIGHT/360*this.unit.root.scale.y);
   const p=this.layerPoint(r,this.back);s.position.set(p.x,p.y);s.tint=i%2?0xd09843:0xb42043;s.alpha=[.21,.14,.085,.04][i];s.blendMode='add';s.visible=true;
  });
 }
 restoreBackdrop(){for(const {layer}of this.engine.parallaxLayers||[]){if(layer.destroyed)continue;layer.scale?.set(1);layer.pivot?.set(0,0);}}
 render(t){
  if(this.disposed)return;const e=this.engine,u=this.unit,state=this.state=sample(this.mode,t),b=this.bounds(),size=b.size;
  this.pool.forEach(s=>s.visible=false);this.shade.clear();this.applyPose(state);
  const r=t<=0?{...this.home,groundY:this.home.y}:this.rootFor(state);
  u.root.position.set(r.x,r.y);u.root.depthSortY=r.groundY;e.sortCombatDepth();this.drawGhosts(state);
  this.aura.render(t,HEIGHT,state.impact,state.lift);
  const torso=this.contact(),feet=this.targetFeet(),bp=this.bladePoints(state,r),targetHeight=(this.target.fullBodyHeight||300)*this.target.root.scale.y;
  this.collision=bladeContact(bp.grip,bp.tip,torso,targetHeight*.28);
  this.groundError=Math.abs(r.y+state.lift*size-r.groundY);this.blade=bp;
  this.tigerHead=null;
  state.effects.forEach((fx,i)=>{
   const s=this.pool[i],layer=fx.back?this.back:this.front;if(s.parent!==layer)layer.addChild(s);
   s.texture=this.assets.effects[fx.key][fx.frame];s.visible=true;s.alpha=fx.alpha;s.blendMode='normal';s.rotation=fx.angle;s.anchor.set(.5);
   let p=torso,width=size*fx.width;
   if(fx.anchor==='wake'){p={x:r.x-size*.1,y:r.y-size*.48};s.anchor.set(.8,.5);s.blendMode='add';}
   if(fx.anchor==='casterBody'){p={x:r.x,y:r.y-size*.61};}
   if(fx.anchor==='ground'){p=feet;s.anchor.set(.5,fx.key==='ring'?.73:.9);}
   if(fx.anchor==='casterGround'){p={x:r.x,y:r.groundY};s.anchor.set(.5,fx.key==='ring'?.73:.9);}
   if(fx.anchor==='armyGround'){p=b.center;s.anchor.set(.5,fx.key==='ring'?.73:.9);width=Math.max(width,b.maxX-b.minX+size*1.9);}
   if(fx.anchor==='enemyGround'){p=b.points[fx.target%b.points.length];s.anchor.set(.5,.9);}
   if(fx.anchor==='enemyBody'){p=this.point(this.targets[fx.target%this.targets.length],-(this.targets[fx.target%this.targets.length].fullBodyHeight||300)*.52);}
   if(fx.anchor==='tigerGather'){
    p={x:r.x+size*.42,y:r.y-size*1.5};width=size*(1.75+smooth(fx.q)*.65);s.alpha*=Math.min(1,fx.q*7,(1-fx.q)*6);
   }
   if(fx.anchor==='tigerRush'){
    const q=fx.q,fly=smooth(q/.66),drop=smooth((q-.27)/.4);
    const start={x:b.caster.x+size*.9,y:b.floor-size*1.78},end={x:b.center.x+size*.28,y:b.floor-size*.27};
    p={x:mix(start.x,end.x,fly)+Math.sin(q*Math.PI)*size*.40,y:mix(start.y,end.y,drop)-Math.sin(q*Math.PI)*size*.52};
    this.tigerHead=p;s.anchor.set(...TIGER_HEADS[fx.frame]);s.alpha*=Math.min(1,q*9,(1-q)*3.8);width=size*(3.1+smooth(q/.3)*.7);
   }
   if(fx.key==='tiger-ring')s.anchor.set(.5,.81);
   if(fx.key==='tiger-impact')s.anchor.set(...[[.66,.884],[.685,.884],[.572,.884],[.51,.878],[.58,.79],[.57,.773],[.547,.79],[.5,.79],[.58,.70],[.577,.70],[.56,.704],[.522,.707]][fx.frame]);
   if(fx.key==='slash')s.alpha*=.82;
   s.scale.set(width/s.texture.width);const lp=this.layerPoint(p,layer);s.position.set(lp.x,lp.y);
  });
  if((this.mode==='skill'&&t>.1&&t<4.65)||(this.mode==='aoe'&&t>.3&&t<4.85)){
   const end=this.mode==='aoe'?4.85:4.65,alpha=Math.min(smooth(t/.3),smooth((end-t)/.6))*.24;
   this.shade.rect(-4000,-4000,8000,8000).fill({color:0x15040b,alpha});
  }
  this.targetContacts=this.targets.map((target,i)=>{
   const ats=this.mode==='aoe'?[MODES.aoe.contacts[i%5]]:i===0?MODES[this.mode].contacts:[];
   const at=ats.findLast(v=>v<=t),q=at===undefined?1:(t-at)/.24,recoil=q>=0&&q<1?1-q:0;
   target.view.x=Math.sin((t-(at??0))*86)*recoil*(this.mode==='skill'?9:6);target.view.y=-recoil*4;
   return{index:i,at:at??null,ground:this.point(target),hit:at!==undefined};
  });
  if(this.zoom){
   let left,right,top,bottom;
   if(this.mode==='look'){
    left=r.x-size*1.1;right=r.x+size*1.1;top=r.y-size*1.5;bottom=r.y+size*.28;
   }else if(this.mode==='aoe'){
    left=Math.min(this.home.x,b.caster.x)-size*1.65;right=b.maxX+size*1.75;top=b.floor-size*3.8;bottom=Math.max(...b.points.map(p=>p.y))+size*.55;
   }else{
    left=Math.min(r.x,torso.x)-size*1.18;right=Math.max(r.x,torso.x)+size*1.28;
    const air=this.mode==='skill'&&t>2.15&&t<3.68;
    top=feet.y-size*(air?2.72:1.65);bottom=feet.y+size*.35;
   }
   const maxZoom=this.mode==='look'?4.4:e.mobile?2.2:2.35,zoom=Math.min(maxZoom,e.scene.width*.91/(right-left),e.scene.height*.80/(bottom-top));
   const focus={x:(left+right)/2,y:(top+bottom)/2+e.scene.height*.07/zoom};
   e.camera.focusAt(focus,zoom);const shake=this.effectsEnabled?state.impact*(this.mode==='skill'?5.8:3.3):0;
   e.stage.position.set(e.camera.base.x+Math.sin(t*112)*shake,e.camera.base.y+Math.cos(t*97)*shake*.6);
   for(const {layer}of e.parallaxLayers||[]){layer.scale.set(1/zoom);layer.pivot.set(e.camera.base.x-zoom*e.stage.pivot.x,e.camera.base.y-zoom*e.stage.pivot.y);}
  }else{e.camera.reset(true);this.restoreBackdrop();}
  this.onUpdate(this);
 }
 cancel(){this.removeTimeline();this.clock.time=0;if(!this.disposed)this.render(0);this.targets.forEach(t=>t.view.position.set(0,0));}
 diagnostics(){return{ready:!this.disposed,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,phase:this.state?.phase,frame:this.state?.frame,pose:this.state?.pose,contactCount:this.state?.contactCount,bladeContact:this.collision,groundError:this.groundError,airborne:this.state?.lift>0,groundPlungeOcclusion:this.state?.buried,visibleEffects:this.pool.filter(s=>s.visible).length,visibleGhosts:this.ghostPool.filter(s=>s.visible).length,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,material:{satinGold:this.matteEnabled,sourcePixelsUnchanged:true},aura:this.aura.diagnostics(),...this.manifest.summary,weaponSha256:this.manifest.weapon.sha256,regularAllies:this.engine.allies.length,targetCount:this.targets.length,targets:this.targetContacts,clock:'V3_REGISTERED_GSAP',liveEnabled:false};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.engine.camera.reset(true);this.restoreBackdrop();this.unit.bodySprite.filters=null;this.materialFilter.destroy();this.aura.destroy();this.unit.view.mask=null;this.groundMask.destroy();this.targets.forEach(t=>t.view.position.set(0,0));this.front.destroy({children:true});this.back.destroy({children:true});for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const t of frames)t.destroy(false);}
}
