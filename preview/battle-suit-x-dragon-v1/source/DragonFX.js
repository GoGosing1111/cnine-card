import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {DURATION,CONTACTS,POSES,sampleDragon,smooth,clamp} from '../motion.mjs';
const ROOT='/preview/battle-suit-x-dragon-v1/',HEIGHT=333.70859375,mix=(a,b,t)=>a+(b-a)*t;
const HEADS=[[.92,.40],[.91,.41],[.93,.42],[.94,.39],[.93,.53],[.90,.67],[.93,.75],[.91,.85],[.88,.86],[.80,.84],[.72,.83],[.70,.84]];
export async function loadDragonAssets(m,base){
 const out={idle:base.idle,motion:{dash:base.motion.dash},effects:{dash:base.effects.dash}};
 await Promise.all([
  ...Object.entries(m.motion).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.motion[k]=s.frames.map((f,i)=>new Texture({source:a.source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}));}),
  ...Object.entries(m.effects).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.effects[k]=s.frames.map(f=>new Texture({source:a.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));})
 ]);return out;
}
export class DragonFX{
 constructor(engine,unit,targets,assets,manifest,baseManifest,onUpdate){
  Object.assign(this,{engine,unit,targets,assets,manifest,baseManifest,onUpdate,mode:'dragon',speed:1,zoom:true,effectsEnabled:true,disposed:false,clock:{time:0}});
  unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.nameHud.visible=false;
  this.back=new Container({label:'XDragonBack'});this.front=new Container({label:'XDragonFront'});
  this.back.eventMode=this.front.eventMode='none';engine.backgroundLayer.addChild(this.back);engine.effectLayer.addChild(this.front);
  this.shade=new Graphics();this.back.addChild(this.shade);
  this.pool=Array.from({length:12},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.capture();this.makeTimeline();this.render(0);
 }
 capture(){this.home={x:this.unit.root.baseX,y:this.unit.root.baseY};}
 get time(){return this.clock.time;}
 get playing(){return !!(this.timeline&&!this.timeline.paused()&&this.time<DURATION);}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(DURATION);}})
   .to(this.clock,{time:DURATION,duration:DURATION,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.disposed)return;if(!this.timeline)this.makeTimeline();if(this.time>=DURATION)this.seek(0);this.unit.stopIdle();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(DURATION,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setSpeed(n){this.speed=Math.max(.25,Math.min(2,Number(n)||1));this.timeline?.timeScale(this.speed);}
 setEffects(v){this.effectsEnabled=v;this.back.visible=this.front.visible=v;}
 point(target,y=0){return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y}));}
 bounds(){
  const points=this.targets.map(u=>this.point(u)),size=HEIGHT*this.unit.root.scale.x;
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),floor=points.reduce((n,p)=>n+p.y,0)/points.length;
  return{points,minX,maxX,floor,size,center:{x:(minX+maxX)/2,y:floor},launch:{x:minX-size*1.15,y:floor+size*.16}};
 }
 pose(p){return(p.bank==='dragon'?this.manifest:this.baseManifest).motion[p.bank].frames[p.index];}
 applyPose(state){
  const s=this.unit.bodySprite,p=state.pose;
  if(state.time<=0||state.done){s.texture=this.assets.idle;s.anchor.set(600/1145,1351/1374);s.scale.set(HEIGHT/1317);}
  else{const f=this.pose(p);s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360);}
  s.position.set(0,0);this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(1);
 }
 layerPoint(p,layer=this.front){return layer.toLocal(this.unit.root.parent.toGlobal(p));}
 put(slot,key,frame,p,width,{anchor=[.5,.5],alpha=1,layer=this.front,blend='normal',angle=0}={}){
  const s=this.pool[slot];if(s.parent!==layer)layer.addChild(s);
  s.texture=this.assets.effects[key][frame];s.anchor.set(...anchor);s.scale.set(width/s.texture.width);s.alpha=alpha;s.rotation=angle;s.blendMode=blend;
  const q=this.layerPoint(p,layer);s.position.set(q.x,q.y);s.visible=true;return s;
 }
 render(t){
  if(this.disposed)return;const e=this.engine,u=this.unit,b=this.bounds(),size=b.size,state=this.state=sampleDragon(t);
  this.pool.forEach(s=>s.visible=false);this.shade.clear();this.applyPose(state);
  const entry=smooth((t-.10)/.23),r={x:mix(this.home.x,b.launch.x,entry),y:mix(this.home.y,b.launch.y,entry)};
  u.root.position.set(r.x,r.y);u.root.depthSortY=r.y;e.sortCombatDepth();this.groundError=0;
  const focus=this.layerPoint({x:b.center.x,y:b.floor-size*.90},this.back);
  if(t>.28&&t<4.24){const a=Math.min(smooth((t-.28)/.32),smooth((4.24-t)/.72))*.46;this.shade.rect(focus.x-5000,focus.y-5000,10000,10000).fill({color:0x010b17,alpha:a});}
  let slot=0;this.dragonHead=null;
  for(const fx of state.effects){
   if(fx.layer==='wake')this.put(slot++,fx.key,fx.frame,{x:r.x-size*.08,y:r.y-size*.44},size*1.8,{anchor:[.82,.55],alpha:.6,blend:'add',layer:this.back});
   if(fx.layer==='caster')this.put(slot++,fx.key,fx.frame,{x:r.x,y:r.y},size*1.65,{anchor:[.5,.89],alpha:fx.alpha,layer:this.back});
   if(fx.layer==='summon'){
    const width=size*(1.45+smooth(fx.q)*1.30),p={x:r.x+size*.18,y:r.y-size*(1.12+smooth(fx.q)*.36)};
    this.put(slot++,fx.key,fx.frame,p,width,{alpha:Math.min(1,fx.q*7,1+(1-fx.q)*2),layer:this.back});
   }
   if(fx.layer==='dragon'){
    const q=fx.q,fly=smooth(q/.65),drop=smooth((q-.28)/.42),width=size*(2.75+smooth(q/.4)*.72);
    const start={x:b.launch.x+size*1.25,y:b.launch.y-size*2.05},end={x:b.center.x+size*.12,y:b.floor-size*.20};
    const mouth={x:mix(start.x,end.x,fly)+Math.sin(q*Math.PI)*size*.42,y:mix(start.y,end.y,drop)-Math.sin(q*Math.PI)*size*.65};
    this.dragonHead=mouth;
    this.put(slot++,fx.key,fx.frame,mouth,width,{anchor:HEADS[fx.frame],alpha:Math.min(1,(1-q)*3.4),layer:this.front});
   }
   if(fx.layer==='crater')this.put(slot++,fx.key,fx.frame,b.center,Math.max(size*4.2,b.maxX-b.minX+size*1.7),{anchor:[.5,.91],alpha:Math.min(1,(1-fx.q)*3)});
   if(fx.layer==='wave')this.put(slot++,fx.key,fx.frame,b.center,Math.max(size*4.6,b.maxX-b.minX+size*2.2),{anchor:[.5,.89],alpha:fx.alpha,layer:this.back});
  }
  this.targetContacts=this.targets.map((target,i)=>{
   const at=CONTACTS[i%CONTACTS.length],q=(t-at)/.80,hit=t>=at;
   if(q>=0&&q<1){const p=this.point(target),f=Math.min(11,Math.floor(q*12));this.put(slot++,'dragon-impact',f,p,size*.94,{anchor:[.5,.91],alpha:.72*(1-q*.5)});}
   const recoil=t>=at&&t<at+.24?(1-(t-at)/.24):0;
   target.view.x=recoil*Math.sin((t-at)*84)*7;target.view.y=-recoil*6;
   return{id:target.id??target.unit?.id??i,at,hit,ground:this.point(target)};
  });
  if(this.zoom){
   const opening=smooth((t-.10)/.62),release=smooth((t-3.62)/.98);
   const left=Math.min(b.launch.x-size*2.35,this.home.x+(b.launch.x-this.home.x)*entry-size*.5),right=b.maxX+size*1.20;
   const top=Math.min(b.floor-size*3.8,b.launch.y-size*3.35,Math.min(...b.points.map(p=>p.y))-size*1.15),bottom=Math.max(...b.points.map(p=>p.y))+size*.22;
   const z=Math.min(2.05,e.scene.width*.91/(right-left),e.scene.height*.80/(bottom-top));
   const close=e.mobile?1.45:1.65,zoom=mix(close,z,opening*(1-release*.12));
   const center={x:(left+right)/2,y:(top+bottom)/2};
   e.camera.focusAt({x:center.x,y:center.y+e.scene.height*.045/zoom},zoom);
   const shake=state.impact*5.2;e.stage.position.set(e.camera.base.x+Math.sin(t*111)*shake,e.camera.base.y+Math.cos(t*93)*shake*.6);
   // Keep the existing parallax bands covering their viewport during a wide
   // cinematic camera. Reuse their textures/masks; do not add a second backdrop.
   for(const {layer}of e.parallaxLayers){layer.scale.set(1/zoom);layer.pivot.set(e.camera.base.x/zoom-e.stage.pivot.x,e.camera.base.y/zoom-e.stage.pivot.y);}
  }else{e.camera.reset(true);this.restoreBackdrop();}
  this.onUpdate(this);
 }
 restoreBackdrop(){for(const {layer}of this.engine.parallaxLayers||[]){if(layer.destroyed)continue;layer.scale?.set(1);layer.pivot?.set(0,0);}}
 cancel(){this.removeTimeline();this.clock.time=0;if(!this.disposed)this.render(0);this.restoreBackdrop();}
 diagnostics(){return{ready:!this.disposed,mode:this.mode,time:this.time,phase:this.state?.phase,playing:this.playing,speed:this.speed,frame:this.state?.frame,pose:this.state?.pose,
  contactCount:this.state?.contactCount,targetCount:this.targets.length,targets:this.targetContacts,dragonHead:this.dragonHead,groundError:this.groundError,
  visibleEffects:this.pool.filter(s=>s.visible).length,visibleGhosts:0,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,
  ...this.manifest.summary,weaponSha256:this.manifest.weapon.sha256,regularAllies:this.engine.allies.length,clock:'V3_REGISTERED_GSAP',liveEnabled:false,damageAuthority:'NONE_PREVIEW_VISUAL_ONLY'};}
 destroy(){
  if(this.disposed)return;this.cancel();this.disposed=true;this.engine.camera.reset(true);this.targets.forEach(t=>t.view.position.set(0,0));
  this.front.destroy({children:true});this.back.destroy({children:true});
  for(const key of Object.keys(this.manifest.motion))for(const t of this.assets.motion[key])t.destroy(false);
  for(const key of Object.keys(this.manifest.effects))for(const t of this.assets.effects[key])t.destroy(false);
 }
}
