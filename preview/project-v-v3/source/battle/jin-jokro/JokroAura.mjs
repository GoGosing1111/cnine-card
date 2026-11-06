import {Assets,Container,Sprite,Texture,Rectangle,Point} from 'pixi.js';
import {CrimsonOutlineFilter} from './CrimsonOutlineFilter.mjs';

const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const AURA_COVERAGE={crownWidth:1.8,crownHeight:1.38,dischargeWidth:2.65,dischargeHeight:1.58,groundWidth:1.72,wrapWidth:1.58};
export class JokroAura{
 static async load(base){
  const url=base+'effects/aura-v8/runtime/',manifest=await(await fetch(url+'fx-manifest.json')).json(),outer=await(await fetch(base+'effects/aura-v9/runtime/fx-manifest.json')).json(),textures={};
  for(const[id,s]of Object.entries(outer.effects))manifest.effects[id]={...s,atlas:'../../aura-v9/runtime/'+s.atlas};
  await Promise.all(Object.entries(manifest.effects).map(async([id,s])=>{
   const atlas=await Assets.load(url+s.atlas);
   textures[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));
  }));return{manifest,textures};
 }
 constructor(adapter,assets){
  Object.assign(this,{adapter,assets,time:0,destroyed:false,rows:new Map(),frames:{},weapons:{}});
  this.back=new Container({label:'JOKRO_AURA_BACK'});this.front=new Container({label:'JOKRO_AURA_FRONT'});
  const {actor,rig}=adapter;
  actor.view.addChildAt(this.back,actor.view.getChildIndex(rig));
  actor.view.addChildAt(this.front,actor.view.getChildIndex(rig)+1);
  this.add('discharge','sovereign-discharge',this.back);
  this.add('discharge-light','sovereign-discharge',this.back);
  this.rows.get('discharge-light').sprite.blendMode='add';
  this.add('crown','pressure-crown',this.back);
  this.add('ground','pressure-wrap',this.back);
  this.add('wrap','pressure-wrap',this.front);
  for(const id of ['front','rear','mouth'])this.add('blade-'+id,'katana-current',this.front);
  this.outline=new CrimsonOutlineFilter();rig.filters=[...(rig.filters||[]),this.outline];
 }
 add(id,asset,parent){
  const sprite=new Sprite(this.assets.textures[asset][0]);sprite.label='JOKRO_AURA_'+id;
  sprite.anchor.set(.5);sprite.blendMode='normal';parent.addChild(sprite);
  this.rows.set(id,{sprite,asset,spec:this.assets.manifest.effects[asset]});
 }
 point(name){
  const p=this.adapter.rig.skeleton.findBone(name).appliedPose;
  return this.adapter.actor.view.toLocal(this.adapter.rig.toGlobal(new Point(p.worldX,p.worldY)));
 }
 paint(id,phase,x,y,width,height,{angle=0,alpha=1,mirror=1}={}){
  const row=this.rows.get(id),{sprite,asset,spec}=row;
  const index=Math.floor(((phase%1+1)%1)*spec.frames.length)%spec.frames.length,f=spec.frames[index],ink=spec.inkBounds;
  sprite.texture=this.assets.textures[asset][index];
  sprite.anchor.set(((ink.left+ink.width/2)-spec.crop.left)*spec.rasterScale[0]/f.w,((ink.top+ink.height/2)-spec.crop.top)*spec.rasterScale[1]/f.h);
  sprite.scale.set(mirror*width/ink.width/spec.rasterScale[0],height/ink.height/spec.rasterScale[1]);
  sprite.position.set(x,y);sprite.rotation=angle;sprite.alpha=alpha;
  this.frames[id]=index;row.geometry={x,y,width,height,angle,alpha,mirror};
 }
 render(time){
  if(this.destroyed)return;this.time=time;
  const ad=this.adapter,{actor,rig}=ad;
  const visible=ad.fxEnabled&&!ad.suspended&&actor.hp>0&&actor.state!=='DEAD'&&rig.visible;
  this.back.visible=this.front.visible=visible;this.outline.enabled=visible;
  const head=this.point('head'),left=this.point('foot_rear'),right=this.point('foot_front');
  const feet={x:(left.x+right.x)/2,y:(left.y+right.y)/2};
  const scale=Math.abs(rig.scale.x),height=clamp(Math.abs(feet.y-head.y)+96*scale,340*scale,735*scale);
  const width=clamp(Math.abs(right.x-left.x)+390*scale,580*scale,760*scale);
  const center={x:(head.x+feet.x)/2,y:(head.y+feet.y)/2-12*scale};
  const pulse=1+Math.sin(time*TAU/1.4)*.025;
  // Fixed body axis from head and planted feet, never the image/weapon bounds.
  // Enlarge away from the feet so the crown reaches above the shoulders
  // instead of moving the lower half of the effect below the floor.
  const crownHeight=height*AURA_COVERAGE.crownHeight*pulse,dischargeHeight=height*AURA_COVERAGE.dischargeHeight*pulse;
  const floor=feet.y+height*.08,charge=.86+Math.sin(time*TAU/1.4)*.10;
  this.paint('discharge',time/1.4+.12,center.x,floor-dischargeHeight/2,width*AURA_COVERAGE.dischargeWidth*pulse,dischargeHeight,{alpha:charge});
  this.paint('discharge-light',time/1.4+.12,center.x,floor-dischargeHeight/2,width*AURA_COVERAGE.dischargeWidth*pulse,dischargeHeight,{alpha:.43*charge});
  this.paint('crown',time/1.4,center.x,floor-crownHeight/2,width*AURA_COVERAGE.crownWidth*pulse,crownHeight,{alpha:.98});
  this.paint('ground',time/1.4+.5,feet.x,feet.y-7*scale,width*AURA_COVERAGE.groundWidth,160*scale,{alpha:.84,mirror:-1});
  this.paint('wrap',time/1.4+.25,center.x,center.y+height*.21,width*AURA_COVERAGE.wrapWidth,175*scale,{alpha:.88,angle:-.08});
  for(const[id,offset]of [['front',0],['rear',.34],['mouth',.67]]){
   const grip=this.point('grip_'+id),tip=this.point('tip_'+id),dx=tip.x-grip.x,dy=tip.y-grip.y,len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
   // The sockets are keyed alongside every whole-pose Spine attachment,
   // including MOVE/HIT/DEAD; no guard-only or screen-space approximation.
   const start={x:grip.x+dx*.055,y:grip.y+dy*.055};
   this.paint('blade-'+id,time/.7+offset,(start.x+tip.x)/2,(start.y+tip.y)/2,len*.945,clamp(len*.12,14*scale,40*scale),{angle,alpha:.96});
   this.weapons[id]={grip,tip,start,length:len,angle};
  }
  this.body={head,feet,center,width,height};
  this.outline.setGlow(.92+Math.sin(time*TAU/1.4)*.13);
 }
 audit(){
  const view=this.adapter.actor.view,p=this.back.getGlobalPosition();
  return{time:this.time,visible:this.back.visible,frontVisible:this.front.visible,outline:this.outline.enabled,body:structuredClone(this.body),weapons:structuredClone(this.weapons),coverage:AURA_COVERAGE,frames:{...this.frames},layers:Object.fromEntries([...this.rows].map(([id,r])=>[id,{...r.geometry}])),root:[p.x,p.y],behindBody:view.getChildIndex(this.back)<view.getChildIndex(this.adapter.rig),inFrontOfBody:view.getChildIndex(this.front)>view.getChildIndex(this.adapter.rig),clock:'V3_REGISTERED_GSAP',native:'Effekseer 1.70e',destroyed:this.destroyed};
 }
 destroy(){
  if(this.destroyed)return;this.destroyed=true;
  this.adapter.rig.filters=(this.adapter.rig.filters||[]).filter(f=>f!==this.outline);
  this.outline.destroy();for(const root of[this.back,this.front]){root.removeFromParent();root.destroy({children:true,texture:false,textureSource:false});}
 }
}
