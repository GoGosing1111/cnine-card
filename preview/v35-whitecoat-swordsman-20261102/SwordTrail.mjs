import {Graphics, Mesh, MeshGeometry, Point} from 'pixi.js';
import registration from './pose-registration.json';

const mix=(a,b,t)=>a+(b-a)*t;
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>n*n*(3-2*n);
const SEGMENTS=32;

// These are the native attachment-change times, not a second playback clock.
// Each fast, stepped pose change reveals its swept in-between area at the new
// blade pose. A held drawing must not have a trail head moving ahead of its sword.
export const swordStrokes={
 attack_basic:[
  {id:'descending-cut',from:'windup',to:'contact',start:.282,end:.32,life:.15},
  {id:'follow-through',from:'contact',to:'follow',start:.32,end:.40,life:.18}
 ],
 skill_iai:[
  {id:'draw-cut',from:'iai_ready',to:'iai_cut',start:.26,end:.30,life:.16,draw:true},
  {id:'rising-cut',from:'iai_cut',to:'rise',start:.43,end:.51,life:.20}
 ]
};

export class SwordTrail {
 constructor(layer,adapter,texture,mode,rootAt){
  Object.assign(this,{layer,adapter,rootAt,disposed:false,enabled:true,time:0});
  this.ribbons=swordStrokes[mode].map(spec=>{
   const positions=new Float32Array((SEGMENTS+1)*4),uvs=new Float32Array(positions.length),indices=new Uint32Array(SEGMENTS*6);
   for(let i=0;i<=SEGMENTS;i++){
    uvs.set([i/SEGMENTS,1,i/SEGMENTS,0],i*4);
    if(i<SEGMENTS){const j=i*2;indices.set([j,j+1,j+2,j+1,j+3,j+2],i*6);}
   }
   const geometry=new MeshGeometry({positions,uvs,indices}),mesh=new Mesh({geometry,texture});
   mesh.label='V35_WHITECOAT_FX_TRAIL_'+spec.id;mesh.blendMode='add';mesh.visible=false;
   const edge=new Graphics();edge.label=mesh.label+'_EDGE';edge.blendMode='add';edge.visible=false;
   layer.addChild(mesh,edge);
   return {spec,geometry,mesh,edge,front:null,grip:null,visible:false};
  });
 }

 sample(spec,u){
  const poses=registration.poses,from=poses[spec.from].sockets,to=poses[spec.to].sockets;
  const a=from.weapon_grip,b=to.weapon_grip,at=from.blade_tip,bt=to.blade_tip;
  const angleB=Math.atan2(bt[1]-b[1],bt[0]-b[0]);
  const angleA=spec.draw?angleB:Math.atan2(at[1]-a[1],at[0]-a[0]);
  const delta=Math.atan2(Math.sin(angleB-angleA),Math.cos(angleB-angleA));
  const lengthA=spec.draw?0:Math.hypot(at[0]-a[0],at[1]-a[1]);
  const lengthB=Math.hypot(bt[0]-b[0],bt[1]-b[1]);
  const h=[mix(a[0],b[0],u),mix(a[1],b[1],u)],angle=angleA+delta*u,length=mix(lengthA,lengthB,u);
  const tip=[h[0]+Math.cos(angle)*length,h[1]+Math.sin(angle)*length];
  return {hand:h,tip,time:mix(spec.start,spec.end,u)};
 }

 world(point,time){
  const {actor,rig}=this.adapter;
  // Registered sockets are Spine Y-up; Pixi's native pose is Y-down.
  const p=rig.toGlobal(new Point(point[0],-point[1]));
  const now=actor.root.toGlobal(new Point(0,0)),at=this.rootAt(time);
  const past=actor.root.parent.toGlobal(new Point(at.x,at.y));
  p.x+=past.x-now.x;p.y+=past.y-now.y;
  return this.layer.toLocal(p);
 }

 render(time,enabled){
  if(this.disposed)return;
  this.time=time;this.enabled=enabled;
  for(const r of this.ribbons){
   const age=time-r.spec.end,fade=1-smooth(clamp(age/r.spec.life));
   r.visible=enabled&&age>=-1e-7&&age<r.spec.life;
   r.mesh.visible=r.edge.visible=r.visible;r.edge.clear();
   if(!r.visible)continue;
   const tips=[],oldest=clamp(age/r.spec.life)*.55;
   for(let i=0;i<=SEGMENTS;i++){
    const u=mix(oldest,1,i/SEGMENTS),sample=this.sample(r.spec,u);
    const h=this.world(sample.hand,sample.time),tip=this.world(sample.tip,sample.time);
    const inner={x:mix(h.x,tip.x,.18),y:mix(h.y,tip.y,.18)};
    r.geometry.positions.set([inner.x,inner.y,tip.x,tip.y],i*4);tips.push(tip);
    if(i===SEGMENTS){r.front={x:tip.x,y:tip.y};r.grip={x:h.x,y:h.y};}
   }
   r.geometry.getBuffer('aPosition').update();r.mesh.alpha=.84*fade;
   // A fine outer edge keeps the swept blade boundary readable at battle scale.
   const width=Math.max(.65,Math.hypot(r.front.x-r.grip.x,r.front.y-r.grip.y)*.009);
   for(const [thickness,alpha,color] of [[width*4,.12,0xffd78a],[width,.67,0xfff4d7]]){
    r.edge.moveTo(tips[0].x,tips[0].y);
    for(const p of tips.slice(1))r.edge.lineTo(p.x,p.y);
    r.edge.stroke({width:thickness,alpha:alpha*fade,color});
   }
  }
 }

 audit(){
  const attachment=this.adapter.rig.skeleton.findSlot('body').appliedPose.attachment?.name;
  const bone=this.adapter.rig.skeleton.findBone('blade_tip').appliedPose;
  const current=this.layer.toLocal(this.adapter.rig.toGlobal(new Point(bone.worldX,bone.worldY)));
  return {time:this.time,active:this.ribbons.filter(r=>r.visible).length,segments:SEGMENTS,source:'Runway textured swept blade',strokes:this.ribbons.map(r=>({
   id:r.spec.id,to:r.spec.to,end:r.spec.end,visible:r.visible,alpha:r.visible?r.mesh.alpha:0,front:r.visible?r.front:null,grip:r.visible?r.grip:null,
   bladeAnchorError:r.visible&&attachment===r.spec.to?Math.hypot(r.front.x-current.x,r.front.y-current.y):null,
   vertices:r.visible?Array.from(r.geometry.positions):[]
  }))};
 }

 destroy(){if(this.disposed)return;this.disposed=true;for(const r of this.ribbons){r.mesh.removeFromParent();r.mesh.destroy();r.geometry.destroy();r.edge.removeFromParent();r.edge.destroy();}}
}
