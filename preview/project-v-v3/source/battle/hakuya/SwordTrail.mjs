import {Graphics, Mesh, MeshGeometry, Point} from 'pixi.js';
import registration from './pose-registration.json' with {type:'json'};

const mix=(a,b,t)=>a+(b-a)*t;
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>n*n*(3-2*n);
const SEGMENTS=32;

// These are the native attachment-change times, not a second playback clock.
// Each fast, stepped pose change reveals its swept in-between area at the new
// blade pose. A held drawing must not have a trail head moving ahead of its sword.
export const swordStrokes={
 attack_basic:[
  {id:'descending-cut',from:'windup',to:'contact',start:.282,end:.32,life:.20},
  {id:'follow-through',from:'contact',to:'follow',start:.32,end:.40,life:.23}
 ],
 skill_iai:[
  {id:'draw-cut',from:'iai_ready',to:'iai_cut',start:.26,end:.30,life:.19,draw:true},
  {id:'rising-cut',from:'iai_cut',to:'rise',start:.43,end:.51,life:.25}
 ]
};

export class SwordTrail {
 constructor(layer,adapter,texture,mode,rootAt,options={}){
  Object.assign(this,{layer,adapter,rootAt,registration:options.registration||registration,poseOffsetAt:options.poseOffsetAt||(()=>({x:0,y:0})),disposed:false,enabled:true,time:0});
  this.ribbons=(options.strokes||swordStrokes[mode]).map(spec=>{
   const positions=new Float32Array((SEGMENTS+1)*4),uvs=new Float32Array(positions.length),indices=new Uint32Array(SEGMENTS*6);
   for(let i=0;i<=SEGMENTS;i++){
    uvs.set([i/SEGMENTS,1,i/SEGMENTS,0],i*4);
    if(i<SEGMENTS){const j=i*2;indices.set([j,j+1,j+2,j+1,j+3,j+2],i*6);}
   }
   const geometry=new MeshGeometry({positions,uvs,indices}),mesh=new Mesh({geometry,texture});
   mesh.label='V35_WHITECOAT_FX_TRAIL_'+spec.id;mesh.blendMode='add';mesh.visible=false;
   const glowGeometry=new MeshGeometry({positions:new Float32Array(positions.length),uvs:uvs.slice(),indices:indices.slice()}),glow=new Mesh({geometry:glowGeometry,texture});
   glow.label=mesh.label+'_GOLD_WAKE';glow.blendMode='add';glow.tint=0xffa844;glow.visible=false;
   const edge=new Graphics();edge.label=mesh.label+'_EDGE';edge.blendMode='add';edge.visible=false;
   layer.addChild(glow,mesh,edge);
   return {spec,geometry,mesh,glowGeometry,glow,edge,front:null,grip:null,visible:false};
  });
 }

 sample(spec,u,endTime=spec.end){
  const poses=this.registration.poses,from=poses[spec.from].sockets,to=poses[spec.to].sockets;
  const a=from.weapon_grip,b=to.weapon_grip,at=from.blade_tip,bt=to.blade_tip;
  const angleB=Math.atan2(bt[1]-b[1],bt[0]-b[0]);
  const angleA=spec.draw?angleB:Math.atan2(at[1]-a[1],at[0]-a[0]);
  const delta=Math.atan2(Math.sin(angleB-angleA),Math.cos(angleB-angleA));
  const lengthA=spec.draw?0:Math.hypot(at[0]-a[0],at[1]-a[1]);
  const lengthB=Math.hypot(bt[0]-b[0],bt[1]-b[1]);
  const h=[mix(a[0],b[0],u),mix(a[1],b[1],u)],angle=angleA+delta*u,length=mix(lengthA,lengthB,u);
  const tip=[h[0]+Math.cos(angle)*length,h[1]+Math.sin(angle)*length];
  return {hand:h,tip,time:mix(spec.start,endTime,u)};
 }

 world(point,time){
  const {actor,rig}=this.adapter;
  // Registered sockets are Spine Y-up; Pixi's native pose is Y-down.
  const offset=this.poseOffsetAt(time),p=rig.toGlobal(new Point(point[0]+offset.x,-point[1]-offset.y));
  const now=actor.root.toGlobal(new Point(0,0)),at=this.rootAt(time);
  const past=actor.root.parent.toGlobal(new Point(at.x,at.y));
  p.x+=past.x-now.x;p.y+=past.y-now.y;
  return this.layer.toLocal(p);
 }

 anchor(id,u=1){const r=this.ribbons.find(r=>r.spec.id===id),s=this.sample(r.spec,u),hand=this.world(s.hand,s.time),tip=this.world(s.tip,s.time);return {hand,tip,angle:Math.atan2(tip.y-hand.y,tip.x-hand.x)};}

 render(time,enabled){
  if(this.disposed)return;
  this.time=time;this.enabled=enabled;
  for(const r of this.ribbons){
   const age=time-r.spec.end,fade=1-smooth(clamp(age/r.spec.life));
   r.visible=enabled&&age>=-1e-7&&age<r.spec.life;
   r.mesh.visible=r.glow.visible=r.edge.visible=r.visible;r.edge.clear();
   if(!r.visible)continue;
   const tips=[],innerEdge=[],oldest=clamp(age/r.spec.life)*.55,headTime=r.spec.followUntil?Math.min(Math.max(time,r.spec.end),r.spec.followUntil):r.spec.end;
   for(let i=0;i<=SEGMENTS;i++){
    const u=mix(oldest,1,i/SEGMENTS),sample=this.sample(r.spec,u,headTime);
    const h=this.world(sample.hand,sample.time),tip=this.world(sample.tip,sample.time);
    const inner={x:mix(h.x,tip.x,.12),y:mix(h.y,tip.y,.12)},spread=Math.sin(Math.PI*i/SEGMENTS)*.18;
    r.geometry.positions.set([inner.x,inner.y,tip.x,tip.y],i*4);tips.push(tip);
    r.glowGeometry.positions.set([mix(h.x,tip.x,.10-spread*.3),mix(h.y,tip.y,.10-spread*.3),mix(h.x,tip.x,1+spread),mix(h.y,tip.y,1+spread)],i*4);
    innerEdge.push({x:mix(h.x,tip.x,.72),y:mix(h.y,tip.y,.72)});
    if(i===SEGMENTS){r.front={x:tip.x,y:tip.y};r.grip={x:h.x,y:h.y};}
   }
   r.geometry.getBuffer('aPosition').update();r.mesh.alpha=(r.spec.draw?.76:.88)*fade;
   r.glowGeometry.getBuffer('aPosition').update();r.glow.alpha=(r.spec.draw?.22:.30)*fade;
   // A fine outer edge keeps the swept blade boundary readable at battle scale.
   const length=Math.hypot(r.front.x-r.grip.x,r.front.y-r.grip.y),width=Math.max(.8,length*.016);
   for(const [thickness,alpha,color] of [[width*7,.14,0xffc563],[width*3,.25,0xffd88d],[width,.92,0xfff8e8]]){
    r.edge.moveTo(tips[0].x,tips[0].y);
    for(const p of tips.slice(1))r.edge.lineTo(p.x,p.y);
    r.edge.stroke({width:thickness,alpha:alpha*fade,color});
   }
   r.edge.moveTo(innerEdge[5].x,innerEdge[5].y);for(const p of innerEdge.slice(6,-4))r.edge.lineTo(p.x,p.y);r.edge.stroke({width:width*.7,alpha:.56*fade,color:0xffd18b});
   // Deterministic fragments leave different points of the same swept edge.
   for(let i=0;i<7;i++){
    const j=6+i*3,p=tips[j],prev=tips[j-1],dx=p.x-prev.x,dy=p.y-prev.y,n=Math.hypot(dx,dy)||1;
    const travel=clamp(age/r.spec.life)*length*(.28+i*.025),nx=dy/n,ny=-dx/n;
    const x=p.x+nx*travel,y=p.y+ny*travel,tail=length*(.035+i%3*.012)*fade;
    r.edge.moveTo(x,y).lineTo(x-nx*tail,y-ny*tail).stroke({width:Math.max(.6,width*.55),alpha:.8*fade,color:i%3===0?0xfff7de:0xffbd52});
   }
  }
 }

 audit(){
  const attachment=this.adapter.rig.skeleton.findSlot('body').appliedPose.attachment?.name;
  const bone=this.adapter.rig.skeleton.findBone('blade_tip').appliedPose;
  const current=this.layer.toLocal(this.adapter.rig.toGlobal(new Point(bone.worldX,bone.worldY)));
  return {time:this.time,active:this.ribbons.filter(r=>r.visible).length,segments:SEGMENTS,source:'Runway textured swept blade + gold wake v2',strokes:this.ribbons.map(r=>({
   id:r.spec.id,to:r.spec.to,end:r.spec.end,visible:r.visible,alpha:r.visible?r.mesh.alpha:0,front:r.visible?r.front:null,grip:r.visible?r.grip:null,
   bladeAnchorError:r.visible&&attachment===r.spec.to?Math.hypot(r.front.x-current.x,r.front.y-current.y):null,
   vertices:r.visible?Array.from(r.geometry.positions):[],glowVertices:r.visible?Array.from(r.glowGeometry.positions):[]
  }))};
 }

 destroy(){if(this.disposed)return;this.disposed=true;for(const r of this.ribbons){r.mesh.removeFromParent();r.mesh.destroy();r.geometry.destroy();r.glow.removeFromParent();r.glow.destroy();r.glowGeometry.destroy();r.edge.removeFromParent();r.edge.destroy();}}
}
