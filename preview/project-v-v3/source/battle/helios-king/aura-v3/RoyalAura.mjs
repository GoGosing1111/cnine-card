import {Assets,Container,Sprite,Texture,Rectangle,Point} from 'pixi.js';
import {GoldNeonFilter} from './GoldNeonFilter.mjs';
const TAU=2*Math.PI;
export class RoyalAura{
 static async load(base){
  const manifest=await(await fetch(base+'runtime/manifest.json')).json(),layers={};
  for(const[id,s]of Object.entries(manifest.layers)){const atlas=await Assets.load(base+'runtime/'+s.atlas);layers[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));}
  const scale=await Assets.load(base+'runtime/'+manifest.scale.file);return {manifest,layers,scale};
 }
 constructor(adapter,assets){
  Object.assign(this,{adapter,assets,time:0,destroyed:false,enabled:true,frames:{}});
  const {actor,rig}=adapter;this.back=new Container({label:'HELIOS_GOLD_AURA_BACK'});this.front=new Container({label:'HELIOS_GOLD_AURA_FRONT'});
  actor.view.addChildAt(this.back,actor.view.getChildIndex(rig));actor.view.addChildAt(this.front,actor.view.getChildIndex(rig)+1);
  this.pairs={};for(const [id,parent]of [['rear',this.back],['front',this.front],['blade',this.front]]){
   this.pairs[id]=[0,1].map(()=>{const s=new Sprite(assets.layers[id][0]);s.blendMode='add';s.label='HELIOS_AURA_'+id;parent.addChild(s);return s;});
  }
  // Four separate pendant sprites retain the original chain/pan artwork.
  this.scales=Array.from({length:4},(_,i)=>{const s=new Sprite(assets.scale);s.label='HELIOS_GOLD_SCALE_'+i;this.back.addChild(s);return s;});
  this.scaleShine=this.scales.map((s,i)=>{const glow=new Sprite(assets.scale);glow.label='HELIOS_SCALE_LIGHT_'+i;glow.blendMode='add';this.back.addChild(glow);return glow;});
  this.neon=new GoldNeonFilter();rig.filters=[...(rig.filters||[]),this.neon];this.render(0);
 }
 socket(name){const rig=this.adapter.rig,b=rig.skeleton.findBone(name).appliedPose;rig.updateLocalTransform();return rig.localTransform.apply(new Point(b.worldX,b.worldY));}
 body(){const head=this.socket('head'),left=this.socket('foot_rear'),right=this.socket('foot_front'),feet={x:(left.x+right.x)*.5,y:Math.max(left.y,right.y)},h=Math.hypot(head.x-feet.x,head.y-feet.y)+27;return {head,feet,h,centerX:(head.x+feet.x)*.5};}
 blend(id,time,position,width,height,{alpha=1,angle=0,origin=[.5,.5]}={}){
  const spec=this.assets.manifest.layers[id],phase=((time/spec.period)%1+1)%1*8,index=Math.floor(phase),mix=phase-index,ink=spec.union;
  this.frames[id]={index,mix};this.pairs[id].forEach((s,i)=>{s.texture=this.assets.layers[id][(index+i)%8];s.anchor.set((ink.left+ink.width*origin[0])/320,(ink.top+ink.height*origin[1])/320);s.position.copyFrom(position);s.scale.set(width/ink.width,height/ink.height);s.rotation=angle;s.alpha=alpha*(i?mix:1-mix);});
 }
 setEnabled(value){this.enabled=!!value;this.render(this.time);}
 render(time){
  if(this.destroyed)return;this.time=time;
  const {actor,rig}=this.adapter,visible=!this.adapter.suspended&&this.enabled&&this.adapter.fxEnabled&&actor.hp>0&&actor.state!=='DEAD'&&rig.visible;
  this.back.visible=this.front.visible=visible;this.neon.enabled=visible;
  const body=this.body(),{h,feet,centerX}=body,pulse=1+Math.sin(time*TAU/4)*.012;
  this.blend('rear',time,{x:centerX,y:feet.y-h*.59},h*1.18*pulse,h*1.18,{alpha:.73});
  this.blend('front',time+1,{x:centerX,y:feet.y-h*.11},h*1.19,h*.30,{alpha:.65});
  const ink=this.assets.manifest.scale.ink,tex=this.assets.manifest.scale.size,cycle=time*TAU/6;
  this.scales.forEach((s,i)=>{
   const upper=i<2,sign=i%2?-1:1,phase=cycle+(upper?0:Math.PI),height=h*.24;
   s.anchor.set((ink.left+ink.width*.5)/tex[0],ink.top/tex[1]);s.scale.set(height/ink.height);
   s.position.set(centerX+sign*h*((upper?.45:.57)+Math.sin(phase)*.012),feet.y-h*(upper?.90:.57)+Math.sin(phase)*h*.012);
   s.rotation=sign*Math.sin(phase)*.04;s.alpha=.97;
   const glow=this.scaleShine[i];glow.anchor.copyFrom(s.anchor);glow.position.copyFrom(s.position);glow.scale.copyFrom(s.scale);glow.rotation=s.rotation;glow.alpha=.08+(Math.sin(time*TAU/3)+1)*.055;
  });
  const grip=this.socket('weapon_grip'),tip=this.socket('blade_tip'),dx=tip.x-grip.x,dy=tip.y-grip.y,length=Math.hypot(dx,dy),base={x:grip.x+dx*.20,y:grip.y+dy*.20},end={x:tip.x+dx*.015,y:tip.y+dy*.015};
  this.blend('blade',time,{x:(base.x+end.x)*.5,y:(base.y+end.y)*.5},length*.815,h*.105,{alpha:.92,angle:Math.atan2(dy,dx)});
  this.neon.setGlow(.91+Math.sin(time*TAU/3)*.10);this.bodyFrame=body;this.bladeFrame={grip,base,tip,end};
 }
 audit(){const view=this.adapter.actor.view;return {time:this.time,enabled:this.enabled,visible:this.back.visible,frames:this.frames,body:this.bodyFrame,blade:this.bladeFrame,scales:this.scales.map(s=>({x:s.x,y:s.y,rotation:s.rotation,width:s.width,height:s.height})),neon:this.neon.enabled,behind:view.getChildIndex(this.back)<view.getChildIndex(this.adapter.rig),front:view.getChildIndex(this.front)>view.getChildIndex(this.adapter.rig),destroyed:this.destroyed,clock:'V3_REGISTERED_GSAP'};}
 destroy(){if(this.destroyed)return;this.destroyed=true;const {rig}=this.adapter;rig.filters=(rig.filters||[]).filter(f=>f!==this.neon);this.neon.destroy();for(const c of [this.back,this.front]){c.removeFromParent();c.destroy({children:true,texture:false,textureSource:false});}}
}
