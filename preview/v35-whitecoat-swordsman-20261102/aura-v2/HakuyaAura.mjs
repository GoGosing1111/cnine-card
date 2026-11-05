import {Assets,Container,Sprite,Texture,Rectangle,Point,ColorMatrixFilter} from 'pixi.js';
import {WhiteOutlineFilter} from '../aura-v1/WhiteOutlineFilter.mjs';

const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// The axis runs through the actual body, not the full image bounds (which
// include the sword and coat), and has no arbitrary sideways displacement.
export function bodyFrame(skeleton){
 const head=skeleton.findBone('head').appliedPose;
 const left=skeleton.findBone('foot_rear').appliedPose,right=skeleton.findBone('foot_front').appliedPose;
 const feet={x:(left.worldX+right.worldX)*.5,y:(left.worldY+right.worldY)*.5};
 const dx=head.worldX-feet.x,dy=head.worldY-feet.y,length=Math.max(120,Math.hypot(dx,dy));
 const crown={x:head.worldX+dx/length*54,y:head.worldY+dy/length*54};
 return {x:(crown.x+feet.x)*.5,y:(crown.y+feet.y)*.5,
  tilt:Math.atan2(dx,-dy),height:clamp(length+118,350,670),
  width:clamp(Math.abs(right.worldX-left.worldX)+165,420,640),
  head:{x:head.worldX,y:head.worldY},feet,crown};
}
export class HakuyaAura {
 static async load(){
  const base='/preview/v35-whitecoat-swordsman-20261102/aura-v2/runtime/';
  const manifest=await(await fetch(base+'manifest.json')).json(),layers={};
  await Promise.all(Object.entries(manifest.layers).map(async([id,s])=>{
   const atlas=await Assets.load(base+s.atlas);
   layers[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));
  }));return {manifest,layers};
 }
 constructor(adapter,assets){
  Object.assign(this,{adapter,assets,time:0,destroyed:false});
  this.root=new Container({label:'HAKUYA_INK_AURA_BACK'});
  this.front=new Container({label:'HAKUYA_INK_AURA_FRONT'});
  this.inkFilters=[];
  this.pairs={};
  for(const [id,root] of [['rear',this.root],['front',this.front]]) {
   const pair=[new Sprite(assets.layers[id][0]),new Sprite(assets.layers[id][1])];
   for(const s of pair){s.anchor.set(.5);s.blendMode='normal';root.addChild(s);}this.pairs[id]=pair;
   // Preserve black pigment with normal blending. Grade the painted energy
   // to neutral ink/pearl instead of treating dark ink as additive light.
   const grade=new ColorMatrixFilter();
   grade.matrix=[.5681,1.1153,.2166,0,-.45, .5681,1.1153,.2166,0,-.45, .5681,1.1153,.2166,0,-.45, 0,0,0,1.5,0];
   root.filters=[grade];this.inkFilters.push(grade);
  }
  const {actor,rig,effects}=adapter;
  actor.view.addChildAt(this.root,actor.view.getChildIndex(rig));
  actor.view.addChildAt(this.front,actor.view.getChildIndex(rig)+1);
  this.outline=new WhiteOutlineFilter();
  this.outline.resources.outlineUniforms.uniforms.uWidth=.55;
  rig.filters=[...(rig.filters||[]),this.outline];
  (effects.auras??=new Set()).add(this);this.render(0);
 }
 render(time){
  if(this.destroyed)return;
  this.time=time;
  const {actor,rig,effects}=this.adapter,{manifest,layers}=this.assets;
  const visible=effects.enabled&&actor.hp>0&&actor.state!=='DEAD'&&rig.visible;
  this.root.visible=this.front.visible=visible;this.outline.enabled=visible;
  const body=bodyFrame(rig.skeleton),point=actor.view.toLocal(rig.toGlobal(new Point(body.x,body.y)));
  const pulse=1+Math.sin(time*TAU/3)*.015;
  for(const root of [this.root,this.front]){
   root.position.copyFrom(point);root.rotation=body.tilt;
   root.scale.set(Math.abs(rig.scale.x)*body.width/manifest.referenceInk[0]*pulse*1.10,Math.abs(rig.scale.y)*body.height/manifest.referenceInk[1]*pulse*1.05);
  }
  this.frames={};
  for(const id of ['rear','front']) {
   const phase=((time/manifest.seconds+(id==='front'?.25:0))%1+1)%1*layers[id].length;
   const index=Math.floor(phase),mix=phase-index,[a,b]=this.pairs[id];
   a.texture=layers[id][index];b.texture=layers[id][(index+1)%layers[id].length];
   const opacity=id==='rear'?.82:.72;
   a.alpha=(1-mix)*opacity;b.alpha=mix*opacity;
   this.frames[id]={index,mix};
  }
  this.body=body;this.outline.setGlow(.50+Math.sin(time*TAU/3)*.06);
 }
 audit(){const p=this.root.getGlobalPosition(),view=this.adapter.actor.view;return {time:this.time,visible:this.root.visible,center:[p.x,p.y],body:this.body,frames:this.frames,outline:this.outline.enabled,behindBody:view.getChildIndex(this.root)<view.getChildIndex(this.adapter.rig),inFrontOfBody:view.getChildIndex(this.front)>view.getChildIndex(this.adapter.rig),frontVisible:this.front.visible,clock:'V3_REGISTERED_GSAP',destroyed:this.destroyed};}
 destroy(){
  if(this.destroyed)return;this.destroyed=true;
  this.adapter.effects.auras?.delete(this);
  this.adapter.rig.filters=(this.adapter.rig.filters||[]).filter(f=>f!==this.outline);
  this.outline.destroy();for(const filter of this.inkFilters)filter.destroy();for(const root of [this.root,this.front]){root.removeFromParent();root.destroy({children:true});}
 }
}
