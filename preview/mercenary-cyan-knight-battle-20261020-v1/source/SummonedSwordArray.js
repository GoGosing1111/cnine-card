import{Container,Sprite,Graphics,BlurFilter,MeshRope,Point}from'pixi.js';
import{phantomSample,traceSegments,cornerEvents,impactEvents,PHANTOM_COUNT,ARRAY_ROUTE_EXTENTS}from'../array-motion-v4.mjs';
import{bladeContact}from'../motion.mjs';
const mix=(a,b,t)=>a+(b-a)*t;
export class SummonedSwordArray{
 constructor(owner){
  this.owner=owner;this.root=new Container({label:'CyanKnightSummonedSwordArrayV4'});this.root.eventMode='none';owner.engine.effectLayer.addChild(this.root);
  this.trails=new Container();this.echoes=new Container();this.snaps=new Container();this.halo=new Container();this.blades=new Container();this.root.addChild(this.trails,this.echoes,this.snaps,this.halo,this.blades);
  this.haloFilter=new BlurFilter({strength:4,quality:3});this.halo.filters=[this.haloFilter];
  this.core=new Graphics();this.trails.addChild(this.core);
  this.railPool=Array.from({length:32},()=>{const s=new MeshRope({texture:owner.assets.effects['rail-v4'][0],points:Array.from({length:24},(_,i)=>new Point(i,0)),textureScale:0});s.visible=false;this.trails.addChild(s);return s;});
  this.echoPool=Array.from({length:15},()=>{const s=new Sprite();s.visible=false;this.echoes.addChild(s);return s;});
  this.snapPool=Array.from({length:40},()=>{const s=new Sprite();s.visible=false;this.snaps.addChild(s);return s;});
  this.swordPool=Array.from({length:PHANTOM_COUNT},(_,i)=>{const s=new Sprite(owner.assets.summoned[i]);s.visible=false;this.blades.addChild(s);return s;});
  this.haloPool=Array.from({length:PHANTOM_COUNT},(_,i)=>{const s=new Sprite(owner.assets.summoned[i]);s.visible=false;this.halo.addChild(s);return s;});
  this.contacts=[];this.segments=[];this.activeCorners=0;this.fit={left:1,right:1,up:1,down:1};
 }
 point(p){return this.owner.layerPoint(p,this.root);}
 fitRoutes(size){
  const o=this.owner;if(o.zoom)return;o.engine.camera.reset(true);
  const parent=o.unit.root.parent,screen=o.engine.app.screen,topLeft=parent.toLocal({x:0,y:0}),bottomRight=parent.toLocal({x:screen.width,y:screen.height});
  const radius=Math.max(...o.manifest.summonedWeapons.frames.map(w=>{
   const mid={x:mix(w.grip.x,w.tip.x,.40),y:mix(w.grip.y,w.tip.y,.40)},b=w.silhouetteBounds;
   return Math.max(...[[b.x,b.y],[b.right,b.y],[b.x,b.bottom],[b.right,b.bottom]].map(([x,y])=>Math.hypot(x-mid.x,y-mid.y)))*size*w.lengthInBodies/w.weaponLength;
  }))+12;
  const centers=o.targets.map(t=>o.contact(t)),limit=(space,extent)=>Math.max(.1,Math.min(1,(space-radius)/(extent*size)));
  // Fit only route extents to the available margins. Sword scale and the fixed camera never change.
  this.fit={left:limit(Math.min(...centers.map(c=>c.x-topLeft.x)),ARRAY_ROUTE_EXTENTS.left),right:limit(Math.min(...centers.map(c=>bottomRight.x-c.x)),ARRAY_ROUTE_EXTENTS.right),up:limit(Math.min(...centers.map(c=>c.y-topLeft.y)),ARRAY_ROUTE_EXTENTS.up),down:limit(Math.min(...centers.map(c=>bottomRight.y-c.y)),ARRAY_ROUTE_EXTENTS.down)};
 }
 routePoint(torso,p,size){return{x:torso.x+p.x*size*this.fit[p.x<0?'left':'right'],y:torso.y+p.y*size*this.fit[p.y<0?'up':'down']};}
 geometry(f,size){
  const owner=this.owner,w=owner.manifest.summonedWeapons.frames[f.index],target=owner.targets[f.targetIndex%owner.targets.length],torso=owner.contact(target);
  const mid={x:mix(w.grip.x,w.tip.x,.40),y:mix(w.grip.y,w.tip.y,.40)},scale=size*w.lengthInBodies/w.weaponLength;
  const center=this.routePoint(torso,f,size),ahead=this.routePoint(torso,{x:f.x+Math.cos(f.angle)*.001,y:f.y+Math.sin(f.angle)*.001},size),rotation=Math.atan2(ahead.y-center.y,ahead.x-center.x)-Math.atan2(w.tip.y-w.grip.y,w.tip.x-w.grip.x);
  const point=p=>{const x=(p.x-mid.x)*scale,y=(p.y-mid.y)*scale;return{x:center.x+x*Math.cos(rotation)-y*Math.sin(rotation),y:center.y+x*Math.sin(rotation)+y*Math.cos(rotation)};};
  return{w,target,torso,mid,scale,rotation,center,grip:point(w.grip),tip:point(w.tip)};
 }
 blade(sprite,f,size,alpha=1){
  const g=this.geometry(f,size);sprite.texture=this.owner.assets.summoned[f.index];sprite.anchor.set(g.mid.x/g.w.rect.width,g.mid.y/g.w.rect.height);sprite.scale.set(g.scale);sprite.rotation=g.rotation;
  const q=this.point(g.center);sprite.position.set(q.x,q.y);sprite.alpha=f.alpha*alpha;sprite.visible=sprite.alpha>.01;return g;
 }
 draw(state,size){
  const o=this.owner;for(const s of[...this.swordPool,...this.haloPool,...this.railPool,...this.echoPool,...this.snapPool])s.visible=false;
  this.core.clear();this.contacts=[];this.segments=[];this.activeCorners=0;
  this.trails.visible=this.echoes.visible=this.snaps.visible=this.halo.visible=o.effectsEnabled;
  if(o.mode!=='array')return;
  this.fitRoutes(size);const t=state.time;this.segments=traceSegments(t,.31);
  this.segments.forEach((seg,i)=>{
   const torso=o.contact(o.targets[seg.targetIndex%o.targets.length]),points=seg.points.map(p=>this.point(this.routePoint(torso,p,size))),a=points[0];
   const length=points.slice(1).reduce((n,p,k)=>n+Math.hypot(p.x-points[k].x,p.y-points[k].y),0);if(length<2)return;
   const age=Math.max(0,seg.age/seg.lifetime),alpha=(1-age)*.90,frame=Math.min(11,Math.floor(age*12)),s=this.railPool[i];
   s.texture=o.assets.effects['rail-v4'][frame];const ribbonScale=size*.24/s.texture.height;s.scale.set(ribbonScale);points.forEach((p,k)=>s.geometry.points[k].set(p.x/ribbonScale,p.y/ribbonScale));s.alpha=alpha;s.blendMode='normal';s.visible=true;
   // One painted texture bends along the actual path, without stamping separate straight strips.
   this.core.moveTo(a.x,a.y);points.slice(1).forEach(p=>this.core.lineTo(p.x,p.y));this.core.stroke({color:0x62dfff,width:size*.055,alpha:alpha*.20});
   this.core.moveTo(a.x,a.y);points.slice(1).forEach(p=>this.core.lineTo(p.x,p.y));this.core.stroke({color:0xe7ffff,width:size*.013,alpha:alpha*.82});
  });
  [.022,.049,.083].forEach((ago,k)=>{
   for(const f of phantomSample(Math.max(0,t-ago))){if(f.velocity<3||t<.68)continue;const s=this.echoPool[k*5+f.index];this.blade(s,f,size,[.23,.13,.065][k]);s.tint=0x83dfff;s.blendMode='add';}
  });
  const events=[...cornerEvents.filter(e=>t>=e.at&&t<e.at+.21).map(e=>({...e,life:.21,kind:'corner'})),...impactEvents.filter(e=>t>=e.at&&t<e.at+.25).map(e=>({...e,life:.25,kind:'hit'}))];
  this.activeCorners=events.filter(e=>e.kind==='corner').length;
  events.forEach((ev,i)=>{
   const progress=(t-ev.at)/ev.life,frame=Math.min(11,Math.floor(progress*12)),art=o.manifest.effects['snap-v4'].frames[frame],s=this.snapPool[i],target=o.targets[ev.targetIndex%o.targets.length],center=o.contact(target);
   const q=this.point(this.routePoint(center,ev,size));s.texture=o.assets.effects['snap-v4'][frame];s.anchor.set(art.pivot.x,art.pivot.y);s.position.set(q.x,q.y);s.scale.set(size*(ev.kind==='hit'?1.10:.70)/s.texture.width);s.rotation=0;s.alpha=ev.kind==='hit'?1:.83;s.visible=true;s.blendMode='normal';
  });
  for(const f of state.phantoms){
   const halo=this.haloPool[f.index];this.blade(halo,f,size,.65);halo.tint=0x48d5ff;halo.blendMode='add';halo.scale.set(halo.scale.x*1.04);
   const g=this.blade(this.swordPool[f.index],f,size);this.swordPool[f.index].tint=0xffffff;this.swordPool[f.index].blendMode='normal';
   const h=(g.target.fullBodyHeight||300)*g.target.root.scale.y;
   this.contacts.push({index:f.index,targetIndex:f.targetIndex%o.targets.length,grip:g.grip,tip:g.tip,...bladeContact(g.grip,g.tip,g.torso,h*.27)});
  }
 }
 diagnostics(){return{designs:5,heldWeaponReused:false,routeFit:this.fit,paintedRailSegments:this.owner.effectsEnabled?this.segments.length:0,activeCorners:this.owner.effectsEnabled?this.activeCorners:0,activeSwordEchoes:this.owner.effectsEnabled?this.echoPool.filter(s=>s.visible).length:0,visibleEffects:this.owner.effectsEnabled?[...this.railPool,...this.snapPool,...this.echoPool,...this.haloPool].filter(s=>s.visible).length:0};}
 destroy(){const geometries=this.railPool.map(s=>s.geometry);this.haloFilter.destroy();this.root.destroy({children:true});for(const g of geometries)g.destroy(true);}
}
