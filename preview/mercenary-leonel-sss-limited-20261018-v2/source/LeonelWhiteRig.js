import {Container,Sprite,Filter,GlProgram,defaultFilterVert} from 'pixi.js';
import {MODES,sample,smooth,clamp} from '../motion.mjs';
const mix=(a,b,t)=>a+(b-a)*t,rad=n=>n*Math.PI/180;
const angleMix=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const idle={bank:'idle',index:0,facing:1};
const knots=new Map();
// Contact poses remain exact. Recovery reaches the same idle pose before the
// action clock settles, so cleanup never snaps a last attack frame to idle.
export function continuousPose(mode,time){
 // These drawings are distinct silhouettes, not skeletal tween keys. Blending
 // them made extra arms while the separately tweened sword left the painted hand.
 if(mode==='idle')return{a:idle,b:idle,mix:0};
 if(mode==='ultimate'){
  const p=time>=3.94?idle:sample(mode,time).pose;
  return{a:p,b:p,mix:0};
 }
 const m=MODES[mode];let rows=knots.get(mode);
 if(!rows){
  rows=m.poses.map(p=>({at:p.at,pose:p}));
  if(mode==='idle')rows.push({at:m.duration,pose:idle});
  else{
   rows[0]={at:0,pose:idle};rows.push({at:Math.min(.045,m.poses[1].at*.7),pose:m.poses[0]});
   for(const at of m.physicalContacts)rows.push({at,pose:sample(mode,at).pose});
   rows.push({at:Math.min(m.duration,m.intro+m.authoredDuration/m.rate+.06),pose:idle});
  }
  rows.sort((a,b)=>a.at-b.at);knots.set(mode,rows);
 }
 const t=mode==='idle'?((time%m.duration)+m.duration)%m.duration:clamp(time,0,m.duration);
 const i=Math.max(0,rows.findLastIndex(p=>p.at<=t)),a=rows[i],b=rows[Math.min(i+1,rows.length-1)];
 return{a:a.pose,b:b.pose,mix:b.at===a.at?0:smooth((t-a.at)/(b.at-a.at))};
}
const fragment=`
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uStrength;
float opacity(vec2 uv){return texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw)).a;}
void main(){
 vec4 src=texture(uTexture,vTextureCoord);float rim=0.0,halo=0.0;
 for(int i=0;i<12;i++){
  float a=float(i)*0.5235987756;vec2 v=vec2(cos(a),sin(a))*uInputSize.zw;
  rim=max(rim,opacity(vTextureCoord+v*1.65));
  halo+=opacity(vTextureCoord+v*4.8)/12.0;
 }
 float glow=clamp((rim*.93+halo*.82)*uStrength,0.0,1.0)*(1.0-src.a);
 finalColor=src+vec4(vec3(1.0),1.0)*glow;
}`;
export class LeonelWhiteRig{
 constructor(fx){
  this.fx=fx;this.m=fx.manifest;this.actor=fx.merc;this.height=fx.bodyHeight;
  this.root=new Container({label:'LeonelContinuousWhiteRig',sortableChildren:true});this.root.eventMode='none';this.root.zIndex=11;
  this.actor.view.addChild(this.root);
  this.bodies=Array.from({length:4},()=>{const s=new Sprite();this.root.addChild(s);return s;});
  this.sword=new Sprite(fx.assets.weapon);this.sword.zIndex=2;this.root.addChild(this.sword);
  const w=this.m.weapon;this.sword.anchor.set(w.grip.x/w.width,w.grip.y/w.height);
  this.originalAngle=Math.atan2(w.tip.y-w.grip.y,w.tip.x-w.grip.x);
  this.glow=new Filter({glProgram:GlProgram.from({vertex:defaultFilterVert,fragment,name:'leonel-white-silhouette'}),padding:7,resources:{whiteRim:{uStrength:{value:1,type:'f32'}}}});
  this.root.filters=[this.glow];
  this.swordAura=Array.from({length:2},()=>{const s=new Sprite();s.zIndex=10;s.blendMode='add';s.eventMode='none';this.actor.view.addChild(s);return s;});
  this.current=null;this.entry=null;
 }
 descriptor(p,breath=1){
  const f=this.m.motion[p.bank].frames[p.index],s=this.height/610;
  return{pose:p,x:(f.grip.x-f.pivot.x)*s,y:(f.grip.y-f.pivot.y)*s*breath,angle:rad(f.weapon.angleDegrees)-this.originalAngle,scale:f.weapon.uniformScale*s};
 }
 captureEntry(){this.entry=this.current?structuredClone(this.current):null;}
 apply(mode,time,phaseTime){
  const blend=continuousPose(mode,time),q=blend.mix;
  // Less than one pixel of breathing at the head, with planted feet. The arm
  // keeps its neutral drawing and angle; its rigid sword follows that same hand.
  const breathFor=p=>p.bank==='idle'?1+.0024*Math.sin(phaseTime*Math.PI/2):1;
  const ab=breathFor(blend.a),bb=breathFor(blend.b),a=this.descriptor(blend.a,ab),b=this.descriptor(blend.b,bb);
  let current={layers:[{pose:blend.a,weight:1-q,breath:ab},{pose:blend.b,weight:q,breath:bb}],x:mix(a.x,b.x,q),y:mix(a.y,b.y,q),angle:angleMix(a.angle,b.angle,q),scale:mix(a.scale,b.scale,q)};
  if(this.entry&&mode!=='idle'&&mode!=='ultimate'&&time<.045){
   const v=smooth(time/.045),old=this.entry;
   current={layers:[...old.layers.map(l=>({...l,weight:l.weight*(1-v)})),...current.layers.map(l=>({...l,weight:l.weight*v}))],x:mix(old.x,current.x,v),y:mix(old.y,current.y,v),angle:angleMix(old.angle,current.angle,v),scale:mix(old.scale,current.scale,v)};
  }
  const merged=new Map();for(const l of current.layers){const key=l.pose.bank+':'+l.pose.index;const old=merged.get(key);if(old)old.weight+=l.weight;else merged.set(key,{...l});}
  current.layers=[...merged.values()].filter(l=>l.weight>1e-5).sort((a,b)=>a.weight-b.weight).slice(-4);
  this.bodies.forEach((s,i)=>{
   const l=current.layers[i];s.visible=!!l;if(!l)return;
   s.texture=this.fx.assets.motion[l.pose.bank][l.pose.index];s.anchor.set(.5,540/640);s.scale.set(this.height/305,this.height/305*(l.breath||1));s.position.set(0,0);
   // Compensated source-over weights keep the overlap fully opaque during a
   // pose dissolve; the changing outer contours alone are partially covered.
   const before=current.layers.slice(0,i+1).reduce((v,l)=>v+l.weight,0);s.alpha=l.weight/before;
  });
  this.actor.fullBodySprite.visible=false;
  this.actor.view.scale.set(this.fx.direction,1);
  this.sword.position.set(current.x,current.y);this.sword.scale.set(current.scale);this.sword.rotation=current.angle;
  this.current=current;this.updateAura(phaseTime);this.glow.enabled=this.fx.effectsEnabled&&this.fx.auraEnabled;
  this.glow.resources.whiteRim.uniforms.uStrength=.96+.04*Math.sin(phaseTime*Math.PI/2);
 }
 blade(){
  if(!this.current)return null;const c=this.current,w=this.m.weapon,point=p=>{const x=(p.x-w.grip.x)*c.scale,y=(p.y-w.grip.y)*c.scale;return{x:c.x+x*Math.cos(c.angle)-y*Math.sin(c.angle),y:c.y+x*Math.sin(c.angle)+y*Math.cos(c.angle)};};
  return{grip:{x:c.x,y:c.y},start:point(w.bladeStart),tip:point(w.tip)};
 }
 updateAura(time){
  const b=this.blade();if(!b)return;const frames=this.fx.assets.whiteCrest.sword,spec=this.m.whiteCrest.sprites.sword;
  // One second divides the shared four-second ambient loop exactly. Wrapping
  // the idle clock therefore cannot jump the sword animation to another frame.
  const phase=((time%1)+1)%1*frames.length,index=Math.floor(phase),q=phase-index;
  this.swordAura.forEach((s,i)=>{
   const fi=(index+i)%frames.length,f=spec.frames[fi],t=frames[fi],axis=f.axis||{start:{x:t.width*.14,y:t.height*.5},end:{x:t.width*.88,y:t.height*.5}};
   const length=Math.hypot(b.tip.x-b.start.x,b.tip.y-b.start.y),scale=length/(axis.end.x-axis.start.x);
   s.texture=t;s.anchor.set(axis.start.x/t.width,axis.start.y/t.height);s.position.set(b.start.x,b.start.y);s.scale.set(scale);s.rotation=Math.atan2(b.tip.y-b.start.y,b.tip.x-b.start.x);s.alpha=(i?q:1-q)*.92;
   s.visible=this.fx.effectsEnabled&&this.fx.auraEnabled&&this.actor.hp>0&&this.actor.root.visible;
  });
 }
 setVisible(value){this.root.visible=value;for(const s of this.swordAura)s.visible=value&&this.fx.effectsEnabled&&this.fx.auraEnabled;}
 destroy(){for(const s of this.swordAura)s.destroy();this.root.destroy({children:true});this.glow.destroy();this.actor.fullBodySprite.visible=true;}
}
