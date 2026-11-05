import {Point,Sprite} from 'pixi.js';
import {SwordTrail} from '../SwordTrail.mjs';
import registration from './pose-registration.json' with {type:'json'};
import {flightAt} from './timing.mjs';
export const tempestStrokes=[
 {id:'draw',from:'iai_ready',to:'iai_cut',start:.22,end:.30,life:.19,draw:true},
 {id:'turn',from:'v3_pivot',to:'v3_turn',start:.54,end:.64,life:.22},
 {id:'air',from:'v3_apex',to:'v3_aircut',start:.98,end:1.10,followUntil:1.22,life:.25},
 {id:'slam',from:'v3_aircut',to:'v3_slam',start:1.16,end:1.22,life:.28}
];
export class TempestEffects {
 constructor(owner,adapter,target,{rootAt}){
  Object.assign(this,{owner,adapter,target,rootAt,disposed:false,time:0,frames:{},layer:owner.engine.effectLayer,sprites:{}});
  this.trail=new SwordTrail(this.layer,adapter,owner.assets.trailTexture,'skill_tempest',rootAt,{registration,strokes:tempestStrokes,poseOffsetAt:flightAt});
  for(const [id,key]of [['draw-hit','impact-burst'],['turn-hit','impact-burst'],['slam','tempest-slam'],['debris','debris']]){
   const spec=owner.assets.manifest.effects[key],s=new Sprite(owner.assets.textures[key][0]);s.label='V35_WHITECOAT_FX_TEMPEST_'+id;s.anchor.set(spec.pivot[0]/spec.frames[0].w,spec.pivot[1]/spec.frames[0].h);s.blendMode=spec.blend;s.visible=false;this.layer.addChild(s);this.sprites[id]={s,key};
  }
  this.ghosts=[.035,.07].map((delay,i)=>{const rig=new adapter.rig.constructor({skeletonData:adapter.rig.skeleton.data,autoUpdate:false,ticker:owner.engine.app.ticker});rig.label='V35_WHITECOAT_FX_GHOST_'+i;rig.visible=false;rig.tint=0xffdda6;rig.alpha=i?.065:.13;const entry=rig.state.setAnimation(0,'skill_tempest',false);this.layer.addChildAt(rig,0);return {rig,delay,entry};});
 }
 render(time){
  if(this.disposed)return;this.time=time;const {adapter,layer,owner}=this,a=adapter.actor,rig=adapter.rig;
  const root=layer.toLocal(a.root.toGlobal(new Point())),unit=layer.toLocal(a.root.toGlobal(new Point(1,0))),scale=Math.hypot(unit.x-root.x,unit.y-root.y),f=a.view.scale.x>=0?1:-1;
  this.trail.render(time,owner.enabled);
  const show=(id,elapsed,p,mul,rotation=0,mirror=1)=>{const {s,key}=this.sprites[id],spec=owner.assets.manifest.effects[key],frame=Math.floor(elapsed*spec.fps*spec.playbackRate+1e-7);s.visible=owner.enabled&&elapsed>=0&&frame>=0&&frame<spec.frames.length;this.frames[id]=s.visible?frame:-1;if(!s.visible)return;s.texture=owner.assets.textures[key][frame];s.position.copyFrom(p);s.scale.set(scale*mul*mirror/spec.rasterScale[0],scale*mul/spec.rasterScale[1]);s.rotation=rotation;};
  for(const [id,at]of [['draw',.30],['turn',.64]]){const p=this.trail.anchor(id);show(id+'-hit',time-at,p.tip,id==='draw'?1.15:1.3,p.angle);}
  const end=this.trail.anchor('slam'),floor=layer.toLocal(this.target.root.toGlobal(new Point(0,0))),impact=new Point(end.tip.x,floor.y);
  show('slam',time-1.22,impact,1.05,0,f);show('debris',time-1.22,impact,.72,0,f);
  const active=[[.22,.39],[.54,.76],[1.02,1.36]].some(([start,end])=>time>=start&&time<=end);
  for(const ghost of this.ghosts){const g=ghost.rig;g.visible=owner.enabled&&active;if(!g.visible)continue;const oldTime=Math.max(0,time-ghost.delay),at=this.rootAt(oldTime),now=a.root.toGlobal(new Point()),past=a.root.parent.toGlobal(new Point(at.x,at.y)),m=rig.worldTransform.clone();m.tx+=past.x-now.x;m.ty+=past.y-now.y;g.setFromMatrix(layer.worldTransform.clone().invert().append(m));ghost.entry.trackTime=oldTime+1e-7;g.update(0);}
 }
 audit(){const trail=this.trail.audit();return {mode:'skill_tempest',time:this.time,frames:{...this.frames},active:Object.values(this.sprites).filter(v=>v.s.visible).length+trail.active+this.ghosts.filter(g=>g.rig.visible).length,trail,ghosts:this.ghosts.map(g=>({visible:g.rig.visible,time:g.entry.trackTime})),disposed:this.disposed};}
 destroy(){if(this.disposed)return;this.disposed=true;this.trail.destroy();for(const{s}of Object.values(this.sprites)){s.removeFromParent();s.destroy();}for(const{rig}of this.ghosts){rig.removeFromParent();rig.destroy({children:true});}if(this.owner.session===this)this.owner.session=null;this.owner.completed++;}
}
