import {clamp,AREA_SKILLS} from './skills.mjs';

const lerp=(a,b,u)=>a+(b-a)*u;
const windowAlpha=(t,a,b)=>t<a||t>=b?0:Math.min(1,(t-a)*5,(b-t)*4);
const point=(a,b,u)=>({x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u)});
export function fitAreaStage(center,requestedSize,unit,bounds){
 const padding=unit*.08,size=Math.min(requestedSize,(bounds.right-bounds.left-padding*2)/1.15),half=size*.575;
 return {size,center:{x:clamp(center.x,bounds.left+padding+half,bounds.right-padding-half),y:center.y}};
}

// All positions, particles and frame selection are sampled from the parent's GSAP clock.
// No independent ticker, randomness or delayed callbacks survive a seek/cancel.
export class AreaSkillFX{
 constructor(owner){
  this.fx=owner;
  const {Container,Graphics,Sprite}=owner.runtime;
  this.back=new Graphics({label:'HeukmuAreaGround'});
  this.front=new Container({label:'HeukmuAreaSwordRain'});
  this.lines=new Graphics({label:'HeukmuAreaFilaments'});
  owner.layer.addChildAt(this.back,0);owner.layer.addChild(this.front);this.front.addChild(this.lines);
  this.blades=Array.from({length:Math.max(12,owner.targets.length*2)},()=>{const s=new Sprite({texture:owner.assets.sword});s.visible=false;this.front.addChild(s);return s;});
  this.reset();
 }
 reset(){this.back.clear();this.lines.clear();this.back.visible=false;this.front.visible=false;this.blades.forEach(s=>s.visible=false);this.bladeCount=0;this.phase='none';this.visibleTargets=[];}
 strokePath(points,width,color,alpha){
  if(points.length<2||alpha<=0)return;
  this.lines.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))this.lines.lineTo(p.x,p.y);
  this.lines.stroke({width,color,alpha});
 }
 filament(a,b,t,unit,alpha,seed=0){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,points=[];
  for(let j=0;j<=10;j++){const u=j/10,n=j===0||j===10?0:Math.sin(j*2.7+seed+t*19)*unit*.025;points.push({x:a.x+dx*u-dy/length*n,y:a.y+dy*u+dx/length*n});}
  this.strokePath(points,unit*.043,0x7020d6,alpha*.24);this.strokePath(points,unit*.009,0xd6a6ff,alpha*.8);
 }
 ring(p,r,alpha,spin=0){
  if(alpha<=0)return;
  const g=this.back;g.ellipse(p.x,p.y,r,r*.25).fill({color:0x100320,alpha:alpha*.42}).stroke({width:r*.035,color:0x9027ed,alpha:alpha*.75});
  g.ellipse(p.x,p.y,r*.78,r*.195).stroke({width:r*.012,color:0xe3b7ff,alpha:alpha*.7});
  for(let i=0;i<8;i++){const a=i*Math.PI/4+spin,c=Math.cos(a),s=Math.sin(a);g.moveTo(p.x+c*r*.84,p.y+s*r*.21).lineTo(p.x+c*r,p.y+s*r*.25).stroke({width:r*.024,color:0xc27aff,alpha});}
 }
 particles(center,unit,t,from,to,count=28){
  if(t<from||t>=to)return;const u=(t-from)/(to-from),a=(1-u)*.8;
  for(let i=0;i<count;i++){const angle=i*2.399963,dist=unit*(.18+u*(.7+(i%5)*.11)),x=center.x+Math.cos(angle)*dist,y=center.y+Math.sin(angle)*dist*.7+u*u*unit*.22,r=unit*(.009+(i%3)*.004)*(1-u*.7);this.lines.moveTo(x-r,y).lineTo(x,y-r*2).lineTo(x+r,y).lineTo(x,y+r*2).closePath().fill({color:i%3?0x8a36d5:0xeac8ff,alpha:a});}
 }
 sword(tip,length,angle,alpha){
  if(this.bladeCount>=this.blades.length||alpha<=0)return;
  const f=this.fx,q=f.spec.sword,s=this.blades[this.bladeCount++];s.anchor.set(q.tip.x/q.width,q.tip.y/q.height);s.scale.set(length/q.visibleSwordLengthPixels);s.rotation=angle-Math.PI/2;s.position.set(tip.x,tip.y);s.alpha=alpha;s.tint=0xd1a7ff;s.visible=true;
  f.effectFrames.push({bank:'held-sword-copy',x:tip.x,y:tip.y,size:length,role:'spectral-sword-rain'});
 }
 render(mode,t,{foot,unit,points,center,bounds}){
  this.reset();const f=this.fx;if(f.motionOnly||!AREA_SKILLS[mode]||!points.length)return;
  const end=mode==='cast'?4.6:5.15;if(t<.05||t>=end)return;
  this.back.visible=this.front.visible=true;this.back.alpha=this.front.alpha=f.reducedMotion?.65:1;
  const width=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  const fit=fitAreaStage(center,Math.min(unit*3.6,Math.max(width,height)+unit*1.6),unit,bounds),fieldSize=fit.size,mainCenter=fit.center;
  const intensity=windowAlpha(t,.18,end),ground={x:mainCenter.x,y:mainCenter.y+unit*.25};
  this.visibleTargets=points.map((_,i)=>i);this.ring(ground,Math.max(unit*.75,width*.55+unit*.3),intensity*.65,t*.16);
  points.forEach((p,i)=>this.ring({x:p.x,y:p.y+unit*.19},unit*.29,intensity*.7,t*.3+i));
  if(mode==='cast')this.dragon(t,{foot,unit,points,center:mainCenter,fieldSize});else this.eclipse(t,{foot,unit,points,center:mainCenter,fieldSize});
 }
 dragon(t,{foot,unit,points,center,fieldSize}){
  const f=this.fx;this.phase=t<1.1?'charge':t<1.9?'flight':t<3.6?'detonation':'dissipation';
  f.sequence('charge',t,.05,1.5,{x:foot.x,y:foot.y-unit*.45},unit*1.45,{role:'cataclysm-charge'});
  const origin=f.emission({key:'cast',frame:3});
  for(let i=0;i<2;i++){
   const from=.85+i*.15,to=2.05+i*.15;if(t<from||t>=to)continue;
   const u=clamp((t-from)/(to-from)),destination={x:center.x+(i?1:-1)*unit*.32,y:center.y-unit*.3},p=point(origin,destination,u);p.y-=Math.sin(u*Math.PI)*unit*(i?.35:.9);
   const tail=point(origin,p,.65);this.filament(tail,p,t,unit,windowAlpha(t,from,to),i);
   f.draw('dragon',u*11,p,unit*(1.4+u*.5),{mirror:!!i,alpha:windowAlpha(t,from,to),role:'twin-dragon-flight'});
  }
  f.sequence('cataclysm',t,1.35,4.6,{x:center.x,y:center.y-unit*.12},fieldSize,{role:'black-dragon-cataclysm'});
  for(const hit of f.plan.hits){
   const p=points[hit.target],age=t-hit.at;if(age<0||age>=.75)continue;
   const a=1-age/.75;this.ring({x:p.x,y:p.y+unit*.22},unit*(.25+age*.75),a*.9);
   f.sequence('impact',t,hit.at,hit.at+.65,p,unit*(hit.wave===2?1.0:.68),{role:'all-target-dragon-impact'});
   this.filament({x:center.x,y:center.y-unit*.5},p,t,unit,a*.65,hit.target+hit.wave);
   this.particles(p,unit*.65,t,hit.at,hit.at+.75,12);
  }
  this.particles(center,unit,t,3.1,4.6,32);
 }
 eclipse(t,{foot,unit,points,center,fieldSize}){
  const f=this.fx;this.phase=t<1.45?'eclipse-open':t<3.25?'sword-rain':t<4.25?'formation-cut':'dissipation';
  f.sequence('charge',t,.05,1.65,{x:foot.x,y:foot.y-unit*.48},unit*1.15,{role:'sword-consecration'});
  // A bespoke twelve-frame moon-and-cut sheet changes shape through the finisher.
  f.sequence('eclipsecut',t,.65,5.15,{x:center.x,y:center.y-unit*.18},fieldSize*1.15,{role:'eclipse-sundering'});
  for(const hit of f.plan.hits){
   const p=points[hit.target],age=t-hit.at;
   if(hit.wave<3&&age>=-.63&&age<.18){
    const u=clamp((age+.63)/.63),side=hit.wave%2?1:-1,origin={x:p.x+side*unit*.75,y:p.y-unit*1.5},tip=point(origin,p,u*u),angle=Math.atan2(p.y-origin.y,p.x-origin.x),alpha=windowAlpha(t,hit.at-.63,hit.at+.18);
    this.sword(tip,unit*.95,angle,alpha);this.filament(point(origin,tip,.25),tip,t,unit,alpha*.65,hit.target);
   }
   if(age>=0&&age<.72){
    f.sequence('impact',t,hit.at,hit.at+.7,p,unit*(hit.wave===3?1.05:.6),{role:'all-target-sword-impact'});
    this.particles(p,unit*.7,t,hit.at,hit.at+.72,12);
    if(hit.wave===3){f.sequence('blade',t,hit.at,hit.at+.6,p,unit*1.35,{rotation:-.4,role:'final-cleave'});this.ring({x:p.x,y:p.y+unit*.18},unit*(.25+age*.85),1-age/.72);}
   }
  }
  this.particles(center,unit*1.1,t,3.7,5.15,36);
 }
 diagnostics(){return{phase:this.phase,spectralSwords:this.bladeCount,targets:this.visibleTargets,visible:this.front.visible};}
}
