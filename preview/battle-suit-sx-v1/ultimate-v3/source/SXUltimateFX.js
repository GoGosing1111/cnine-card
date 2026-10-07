import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {SXBodyFX} from '../../source/SXBodyFX.js';
import {DURATION,STRIKE,POSES,sampleUltimate,areaHits,clamp,smooth} from '../motion.mjs';
const ROOT='/preview/battle-suit-sx-v1/ultimate-v3/',HEIGHT=333.70859375,mix=(a,b,t)=>a+(b-a)*t;
export async function loadUltimateAssets(m){
 const out={blade:await Assets.load(ROOT+m.blade.url),effects:{}};
 await Promise.all(Object.entries(m.effects).map(async([key,bank])=>{
  const atlas=await Assets.load(ROOT+bank.url);
  out.effects[key]=bank.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
 }));
 return out;
}
// Isolated ultimate controller. The approved SXBodyFX, choreography and asset bytes are untouched.
export class SXUltimateFX extends SXBodyFX{
 constructor(engine,unit,targets,baseAssets,baseManifest,ultimateAssets,ultimateManifest,onUpdate){
  super(engine,unit,targets[0],baseAssets,baseManifest,()=>{});
  Object.assign(this,{targets,ultimateAssets,ultimateManifest,onUpdate});
  this.areaBack=new Container({label:'SXGroundStrikeBehind',eventMode:'none'});this.back.addChildAt(this.areaBack,1);
  this.areaFront=new Container({label:'SXGroundStrikeFront',eventMode:'none'});this.front.addChildAt(this.areaFront,this.front.getChildIndex(this.title.view));
  this.rays=new Graphics();this.areaBack.addChild(this.rays);
  this.flash=new Graphics();this.areaFront.addChild(this.flash);
  this.swordTrails=Array.from({length:3},()=>{const s=new Sprite(ultimateAssets.blade);s.visible=false;this.areaFront.addChild(s);return s;});
  this.giantSword=new Sprite(ultimateAssets.blade);this.giantSword.visible=false;this.areaFront.addChild(this.giantSword);
  this.groundMask=new Graphics();this.areaFront.addChild(this.groundMask);this.giantSword.mask=this.groundMask;
  this.areaPool=Array.from({length:36},()=>{const s=new Sprite();s.visible=false;this.areaFront.addChild(s);return s;});
  this.setMode('ultimate');
 }
 makeTimeline(){
  this.removeTimeline();
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(DURATION);}})
   .to(this.clock,{time:DURATION,duration:DURATION,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 seek(t){if(this.disposed)return;this.cancelled=false;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(DURATION,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 capture(){
  super.capture();
  const canvas=this.engine.app.canvas,rect=canvas.getBoundingClientRect(),doc=canvas.ownerDocument;
  const dock=doc.querySelector('.battle-v3-dock')?.getBoundingClientRect(),status=doc.querySelector('.battle-v3-status')?.getBoundingClientRect();
  this.safeFrame={left:12,right:rect.width-12,top:Math.max(12,(status?.bottom||rect.top)-rect.top+12),bottom:(dock?.top||rect.bottom)-rect.top-16};
 }
 point(target,y=0){return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y}));}
 bounds(){
  const points=this.targets.map(u=>this.point(u)),size=HEIGHT*this.unit.root.scale.x;
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),floor=points.reduce((a,p)=>a+p.y,0)/points.length;
  return{points,size,minX,maxX,floor,center:{x:(minX+maxX)/2,y:floor},caster:{x:minX-size*1.25,y:floor+size*.30}};
 }
 actorRoot(state,b){return{x:mix(this.home.x,b.caster.x,state.entry),y:mix(this.home.y,b.caster.y,state.entry),groundY:mix(this.home.y,b.caster.y,state.entry)};}
 put(key,frame,p,width,alpha=1,back=false){
  const s=this.areaPool[this.slot++];if(!s)throw Error('Area effect pool exhausted');
  const layer=back?this.areaBack:this.areaFront,def=this.ultimateManifest.effects[key].frames[frame];
  if(s.parent!==layer)layer.addChild(s);
  s.texture=this.ultimateAssets.effects[key][frame];s.anchor.set(def.origin.x/512,def.origin.y/512);
  s.scale.set(width/512);s.rotation=0;s.alpha=alpha;s.tint=0xffffff;s.blendMode='normal';
  const q=this.layerPoint(p,layer);s.position.set(q.x,q.y);s.visible=alpha>.001;return s;
 }
 animate(key,q,p,width,alpha=1,back=false){
  if(q<0||q>=1)return;
  // Eruption frames 9–12 pick up fragments of the previous sheet row.
  // Keep their source as history; fade the clean eighth frame instead of displaying clipped neighbors.
  const n=Math.min(q*11,key==='eruption'?7:11),i=Math.floor(n),f=n-i;
  if(key==='eruption')alpha*=1-smooth((q-.60)/.40);
  this.put(key,i,p,width,alpha*(1-f),back);
  if(f>.001&&i<11)this.put(key,i+1,p,width,alpha*f,back);
 }
 drawTravel(state,b){
  this.ghostPool.forEach(s=>s.visible=false);
  if(!this.effectsEnabled||this.cancelled||state.done)return;
  [.028,.055,.09,.13,.18,.24].forEach((ago,i)=>{
   if(state.time<=ago)return;const old=sampleUltimate(state.time-ago),r=this.actorRoot(old,b),distance=Math.hypot(r.x-this.unit.root.x,r.y-this.unit.root.y);
   if(distance<b.size*.018)return;
   const f=this.pose(old.pose),s=this.ghostPool[i];s.texture=this.assets.motion[old.pose.bank][old.pose.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);
   s.scale.set(HEIGHT/360*this.unit.root.scale.x);s.position.copyFrom(this.layerPoint(r,this.back));s.tint=i%2?0x2065ff:0x72b5ff;
   s.alpha=[.27,.205,.15,.105,.07,.04][i]*Math.min(1,distance/(b.size*.16));s.blendMode='add';s.visible=true;
  });
 }
 drawSword(state,b){
  const blade=state.blade,s=this.giantSword,m=this.ultimateManifest.blade,size=b.size;
  s.visible=false;this.swordTrails.forEach(s=>s.visible=false);this.groundMask.clear();this.giantTip=null;
  if(!blade.visible||!this.effectsEnabled||this.cancelled||state.done)return;
  const ground=this.layerPoint(b.center,this.areaFront),tip={x:b.center.x,y:b.floor-size*blade.tipHeight},p=this.layerPoint(tip,this.areaFront);
  const scale=size*blade.height/(m.tip.y-m.pommel.y);
  // The entire summoned sword is one rigid sprite: no blade bending, stretching or separated hilt.
  s.anchor.set(m.tip.x/m.width,m.tip.y/m.height);s.scale.set(scale);s.position.copyFrom(p);s.rotation=0;s.alpha=blade.alpha;s.tint=0xffffff;s.blendMode='normal';s.visible=true;
  this.groundMask.rect(ground.x-5000,ground.y-10000,10000,10000).fill(0xffffff);
  if(state.time>1.72&&state.time<STRIKE){
   this.swordTrails.forEach((trail,i)=>{
    trail.anchor.copyFrom(s.anchor);trail.scale.copyFrom(s.scale);trail.rotation=0;
    trail.position.set(p.x,p.y-size*(.17+i*.20)*blade.drop);trail.alpha=(.15-i*.04)*blade.alpha*blade.drop;trail.tint=0x408aff;trail.blendMode='add';trail.visible=true;
   });
  }
  this.giantTip={world:tip,ground:b.center,buried:state.time>=STRIKE,burialDepth:state.time>=STRIKE?size*.07:0,rigidScale:s.scale.x===s.scale.y};
 }
 drawArea(state,b){
  this.slot=0;this.areaPool.forEach(s=>s.visible=false);this.rays.clear();this.flash.clear();
  if(!this.effectsEnabled||this.cancelled||state.done)return;
  const t=state.time,size=b.size,c=b.center,span=b.maxX-b.minX,wide=Math.max(size*5.9,span+size*2.2);
  if(t>.38&&t<1.96){
   const q=clamp((t-.38)/1.58),alpha=Math.min(smooth(q*4),smooth((1.96-t)*6))*.62;
   this.animate('ring',.14+q*.28,c,wide*(.67+q*.12),alpha,true);
   // Rising motes and long, fine vertical rays tie the hovering sword to its ground mark.
   const p=this.layerPoint(c,this.areaBack);
   for(let i=0;i<28;i++){
    const k=(t*.38+i*.071)%1,x=p.x+Math.sin(i*2.47)*size*.68,y=p.y-size*(.10+k*3.8);
    this.rays.moveTo(x,y).lineTo(x,y+size*(.10+.10*(i%3))).stroke({color:i%3?0x2375ff:0xb8edff,width:size*.006,alpha:Math.sin(k*Math.PI)*alpha});
   }
  }
  this.animate('ring',(t-STRIKE-.02)/2.42,c,wide*1.22,1,true);
  const burst=(t-STRIKE+.025)/1.58;
  this.animate('eruption',burst<0?-1:burst**.55,c,wide,1);
  // A later, low aftershock expands across the whole front and back row.
  this.animate('ring',(t-STRIKE-.37)/1.95,c,wide*1.42,.67,true);
  const envelope=state.impact,p=this.layerPoint(c,this.areaFront);
  if(envelope>0)this.flash.ellipse(p.x,p.y,size*2.7,size*.40).fill({color:0x80cfff,alpha:envelope*.36});
  for(const hit of this.hits){
   const q=(t-hit.at)/.72;
   this.animate('eruption',q<0?-1:q**.65,b.points[hit.index],size*1.10,.82);
  }
 }
 frameActor(state,r){
  const u=this.unit,e=this.engine,idle=state.standing||state.done,dir=1,f=idle?null:this.pose(state.pose),scale=idle?HEIGHT/this.manifest.idle.bodyPixels:HEIGHT/360;
  const box=idle?{left:18,top:132,width:990,height:1347}:f.componentBox,sourceScale=idle?scale:f.uniformScale*scale,foot=idle?[485,1474]:f.sourceFoot;
  const left=r.x+(box.left-foot[0])*sourceScale*u.root.scale.x,right=r.x+(box.left+box.width-foot[0])*sourceScale*u.root.scale.x;
  const top=r.y+(box.top-foot[1])*sourceScale*u.root.scale.y,bottom=r.y+(box.top+box.height-foot[1])*sourceScale*u.root.scale.y;
  const titleScale=u.root.scale.x*(e.mobile?1.30:1),titlePoint={x:r.x,y:r.y-HEIGHT*1.42*u.root.scale.y-(this.title.bottom+18)*titleScale};
  this.title.render(state.time,this.layerPoint(titlePoint),this.effectsEnabled&&!this.cancelled&&!state.done&&state.time>0,titleScale);
  this.actorBox={left,right,top,bottom};
 }
 restoreBackdrop(){for(const {layer}of this.engine.parallaxLayers||[]){if(layer.destroyed)continue;layer.scale.set(1);layer.pivot.set(0,0);}}
 render(t){
  // Parent construction initializes the approved reusable actor/aura parts first.
  if(!this.targets)return super.render(t);
  if(this.disposed)return;
  const state=this.state=sampleUltimate(t),e=this.engine,u=this.unit,b=this.bounds(),r=this.actorRoot(state,b),size=b.size;
  this.pool.forEach(s=>s.visible=false);this.shade.clear();
  this.applyPose(state.pose,state.standing||state.done);u.root.position.set(r.x,r.y);u.root.depthSortY=r.groundY;e.sortCombatDepth();
  this.drawAmbient(t,state,r,state.standing||state.done);this.drawTravel(state,b);
  this.drawBladeAura(t,state,this.bladePoints(state,r,state.standing||state.done));
  this.groundError=0;this.collision=null;
  this.hits=areaHits(b.points,b.center,size);this.drawSword(state,b);this.drawArea(state,b);this.frameActor(state,r);
  if(this.effectsEnabled&&!this.cancelled&&t>.3&&t<4.45){
   const alpha=Math.min(smooth((t-.3)/.40),smooth((4.45-t)/.8))*.45;
   this.shade.rect(-5000,-5000,10000,10000).fill({color:0x01091c,alpha});
  }
  this.targetContacts=this.targets.map((target,index)=>{
   const at=this.hits[index].at,q=(t-at)/.30,recoil=q>=0&&q<1?1-q:0,hit=t>=at;
   target.view.x=Math.sin((t-at)*88)*recoil*8;target.view.y=-Math.sin(clamp(q)*Math.PI)*recoil*7;
   return{id:target.id??index,index,at,hit,ground:b.points[index],visible:target.root.visible&&target.root.alpha>0};
  });
  state.contactCount=this.targetContacts.filter(p=>p.hit).length;
  if(this.zoom){
   const left=Math.min(this.home.x,b.caster.x)-size*.94,right=b.maxX+size*1.13,top=b.floor-size*4.55,bottom=Math.max(...b.points.map(p=>p.y),b.caster.y)+size*.22;
   const safe=this.safeFrame,parent=e.stage.parent,base=parent.toGlobal(e.camera.base),outerScale=parent.worldTransform.a;
   const zoom=Math.min(2.05,(safe.right-safe.left)/(right-left)/outerScale,(safe.bottom-safe.top)/(bottom-top)/outerScale);
   const focus={x:(left+right)/2+(base.x-(safe.left+safe.right)/2)/(outerScale*zoom),y:(top+bottom)/2+(base.y-(safe.top+safe.bottom)/2)/(outerScale*zoom)};
   e.camera.focusAt(focus,zoom);
   const shake=this.effectsEnabled&&!this.cancelled?state.impact*7:0;
   e.stage.position.set(e.camera.base.x+Math.sin(t*107)*shake,e.camera.base.y+Math.cos(t*99)*shake*.58);
   for(const {layer}of e.parallaxLayers||[]){layer.scale.set(1/zoom);layer.pivot.set(e.camera.base.x-zoom*e.stage.pivot.x,e.camera.base.y-zoom*e.stage.pivot.y);}
  }else{e.camera.reset(true);this.restoreBackdrop();}
  const a=u.root.parent.toGlobal({x:this.actorBox.left,y:this.actorBox.top}),z=u.root.parent.toGlobal({x:this.actorBox.right,y:this.actorBox.bottom});
  this.artScreenBounds={x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y};
  this.onUpdate(this);
 }
 diagnostics(){
  if(!this.targets)return super.diagnostics();
  return{ready:!this.disposed,version:this.ultimateManifest.version,mode:'ultimate',time:this.time,playing:this.playing,speed:this.speed,frame:this.state.frame,phase:this.state.phase,pose:this.state.pose,
   targetCount:this.targets.length,contactCount:this.state.contactCount,targets:this.targetContacts,groundError:this.groundError,giantTip:this.giantTip,
   visibleEffects:this.effectsEnabled?[...this.areaPool,this.giantSword,...this.swordTrails,...this.ambient,...this.rims,this.bladeAura].filter(s=>s.visible).length:0,
   visibleGhosts:this.effectsEnabled?this.ghostPool.filter(s=>s.visible).length:0,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,
   bodyAuraAlpha:this.ambient[0].visible?this.ambient[0].alpha:0,bladeAuraVisible:this.bladeAura.visible,bladeAuraAttachmentError:this.bladeAuraError,mainBodyTint:this.unit.bodySprite.tint,
   bodyUniformScale:this.unit.bodySprite.scale.x===this.unit.bodySprite.scale.y,artScreenBounds:this.artScreenBounds,title:this.title.diagnostics(),
   giantSwordBounds:this.giantSword.visible?this.giantSword.getBounds():null,safeFrame:this.safeFrame,clock:'V3_REGISTERED_GSAP',liveEnabled:false,damageAuthority:'NONE_PREVIEW_VISUAL_ONLY',regularAllies:this.engine.allies.length};
 }
 cancel(){super.cancel();this.targets?.forEach(t=>t.view.position.set(0,0));}
 destroy(){
  if(this.disposed)return;
  this.restoreBackdrop();this.targets?.forEach(t=>t.view.position.set(0,0));
  if(this.giantSword)this.giantSword.mask=null;
  super.destroy();
  this.restoreBackdrop();
  for(const frames of Object.values(this.ultimateAssets.effects))for(const texture of frames)texture.destroy(false);
 }
}
