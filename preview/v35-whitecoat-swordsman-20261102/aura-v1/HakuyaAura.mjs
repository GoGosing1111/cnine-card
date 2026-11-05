import {Assets,Container,Sprite,Texture,Rectangle,Point} from 'pixi.js';
import {WhiteOutlineFilter} from './WhiteOutlineFilter.mjs';

const TAU=Math.PI*2;
export class HakuyaAura {
 static async load(){
  const base='/preview/v35-whitecoat-swordsman-20261102/aura-v1/runtime/';
  const manifest=await(await fetch(base+'manifest.json')).json();
  const [emblem,atlas]=await Promise.all([Assets.load(base+manifest.emblem),Assets.load(base+manifest.orbit)]);
  const frames=Array.from({length:manifest.frames},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle((i%manifest.columns)*manifest.cell,Math.floor(i/manifest.columns)*manifest.cell,manifest.cell,manifest.cell)}));
  return {manifest,emblem,frames};
 }
 constructor(adapter,assets){
  Object.assign(this,{adapter,assets,time:0,destroyed:false});
  const {rig,actor,effects}=adapter;
  this.root=new Container({label:'HAKUYA_BACK_AURA'});
  this.orbitA=new Sprite(assets.frames[0]);this.orbitB=new Sprite(assets.frames[1]);
  this.symbol=new Sprite(assets.emblem);
  for(const s of [this.symbol,this.orbitA,this.orbitB]){s.anchor.set(.5);this.root.addChild(s);}
  this.symbol.alpha=.64;
  this.orbitA.blendMode=this.orbitB.blendMode='add';
  actor.view.addChildAt(this.root,actor.view.getChildIndex(rig));
  this.outline=new WhiteOutlineFilter();
  rig.filters=[...(rig.filters||[]),this.outline];
  (effects.auras??=new Set()).add(this);
  this.render(0);
 }
 render(time){
  if(this.destroyed)return;
  this.time=time;
  const {actor,rig,effects}=this.adapter,assets=this.assets;
  const visible=effects.enabled&&actor.hp>0&&actor.state!=='DEAD'&&rig.visible;
  this.root.visible=visible;this.outline.enabled=visible;
  // The head socket follows the actual substituted pose and airborne root.
  // Offset down to the upper back in skeleton coordinates, then transform
  // once into the actor's already-mirrored view.
  const head=rig.skeleton.findBone('head').appliedPose;
  const offset=new Point(head.worldX-175,head.worldY+135);
  const p=actor.view.toLocal(rig.toGlobal(offset));
  this.root.position.set(p.x,p.y+Math.sin(time*TAU/5)*1.25);
  const scale=Math.abs(rig.scale.x)*(1+Math.sin(time*TAU/4)*.022);
  this.root.scale.set(scale);
  this.symbol.scale.set(680/assets.emblem.width);
  this.symbol.rotation=time*TAU/10;
  this.symbol.alpha=.62+Math.sin(time*TAU/4)*.055;
  const phase=((time%assets.manifest.seconds)+assets.manifest.seconds)%assets.manifest.seconds/assets.manifest.seconds*assets.frames.length;
  const index=Math.floor(phase),mix=phase-index;
  this.orbitA.texture=assets.frames[index];this.orbitB.texture=assets.frames[(index+1)%assets.frames.length];
  for(const s of [this.orbitA,this.orbitB])s.scale.set(760/assets.manifest.cell);
  this.orbitA.alpha=(1-mix)*.84;this.orbitB.alpha=mix*.84;
  this.outline.setGlow(1+Math.sin(time*TAU/4)*.10);
 }
 audit(){const p=this.root.getGlobalPosition();return {time:this.time,visible:this.root.visible,rotation:this.symbol.rotation,center:[p.x,p.y],frame:this.assets.frames.indexOf(this.orbitA.texture),outline:this.outline.enabled,behindBody:this.root.parent?.getChildIndex(this.root)<this.root.parent?.getChildIndex(this.adapter.rig),clock:'V3_REGISTERED_GSAP',destroyed:this.destroyed};}
 destroy(){
  if(this.destroyed)return;this.destroyed=true;
  this.adapter.effects.auras?.delete(this);
  this.adapter.rig.filters=(this.adapter.rig.filters||[]).filter(f=>f!==this.outline);
  this.outline.destroy();this.root.removeFromParent();this.root.destroy({children:true});
 }
}
