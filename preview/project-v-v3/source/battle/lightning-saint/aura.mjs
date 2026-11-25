import {clamp,smooth,stamp} from './effects/paint.mjs';
import {bladeTracks} from './blade-tracks.mjs';

const tau=Math.PI*2,fract=x=>x-Math.floor(x);
const idleWidth=384,idleHeight=506,footX=192,footY=476;
export const idleFoot={x:footX/idleWidth,y:footY/idleHeight};
export function makeAuraCanvas(){
 const canvas=document.createElement('canvas');canvas.width=idleWidth;canvas.height=idleHeight;return canvas;
}
function idleCharge(time){
 const phase=fract(time/3.64)*3.64;
 return .11+.71*smooth((phase-.30)/.77)*(1-smooth((phase-1.16)/.68));
}
export function saintActionCharge(seconds,contacts,duration,time=seconds){
 const inAction=smooth(seconds/.15)*smooth((duration-seconds)/.19);
 let charge=idleCharge(time)*(1-.76*inAction);
 for(const at of contacts){
  const delta=seconds-at;
  if(delta<-.16||delta>.29)continue;
  const strike=smooth(1+delta/.16)*(1-smooth((delta-.035)/.255));
  charge=Math.max(charge,strike);
 }
 return charge;
}
function glow(ctx,x,y,rx,ry,alpha){
 ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
 const g=ctx.createRadialGradient(0,0,0,0,0,1);
 g.addColorStop(0,`rgba(255,218,115,${alpha})`);g.addColorStop(.32,`rgba(255,164,45,${alpha*.47})`);g.addColorStop(1,'rgba(244,122,16,0)');
 ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
function coronaRibbon(ctx,time,front=false,charge=0){
 const layers=[{offset:0,r:100,turns:1.28,drop:244},{offset:2.7,r:81,turns:.94,drop:209}];
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
 for(const {offset,r,turns,drop} of layers){
  const spin=time*.91+offset;
  let prev=null;
  for(let i=0;i<=52;i++){
   const u=i/52,phi=spin+tau*turns*u,depth=Math.sin(phi);
   const radius=r*(.79+.28*Math.sin(u*Math.PI))*(1+.10*charge+.055*Math.sin(phi*3+u*4));
   const p={x:radius*Math.cos(phi)-11*(1-u),y:-18-u*drop+15*depth+7*Math.sin(2*phi)};
   const envelope=Math.sin(Math.PI*u)**.65,head=.18+.82*(.5+.5*Math.cos(tau*(1.7*u-time*.43)+offset))**5;
   const visibility=front?Math.max(0,depth)*Math.min(1,Math.max(0,(Math.abs(p.x)-40)/17)):Math.max(0,-depth);
   const light=clamp(envelope*(head+.17*charge)*visibility);
   if(prev&&light>.019){
    ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);
    ctx.lineWidth=4.2*light+.9;ctx.strokeStyle=`rgba(255,143,24,${.3*light})`;ctx.stroke();
    ctx.lineWidth=.65+1.25*light;ctx.strokeStyle=`rgba(255,226,123,${.9*light})`;ctx.stroke();
    if(light>.28){ctx.beginPath();ctx.moveTo(prev.x-2.5,prev.y+2);ctx.lineTo(p.x-2.5,p.y+2.5);ctx.lineWidth=.75;ctx.strokeStyle=`rgba(255,207,76,${.63*light})`;ctx.stroke();}
   }
   prev=p;
  }
 }
 ctx.restore();
}
function flare(ctx,x,y,length,angle,alpha){
 if(alpha<.035)return;
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha*=alpha;
 glow(ctx,0,0,length*.78,length*.37,.71);
 // Four tapered diffraction rays meet at the same point on the steel.
 ctx.fillStyle='#fff2b1';ctx.beginPath();
 ctx.moveTo(-length,0);ctx.lineTo(-1.1,-.8);ctx.lineTo(0,-length*.39);
 ctx.lineTo(.9,-.8);ctx.lineTo(length,0);ctx.lineTo(.85,.9);
 ctx.lineTo(0,length*.39);ctx.lineTo(-1.2,.85);ctx.closePath();ctx.fill();
 ctx.restore();
}
function bladeCurrent(ctx,track,dx,dy,time,art,charge){
 if(!track)return;
 const [gx,gy,tx,ty,radius]=track,length=Math.hypot(tx-gx,ty-gy);
 if(length<12)return;
 const half=Math.max(.85,Math.min(radius*.53,length*.047)),angle=Math.atan2(ty-gy,tx-gx);
 ctx.save();ctx.translate(dx+gx,dy+gy);ctx.rotate(angle);ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
 // The reflection stays on the bevel. Escaping filaments brighten briefly around its moving charge.
 const u=fract(time*.56+.19),crest=.5+.5*Math.sin(tau*(time*.63+.13));
 ctx.beginPath();ctx.moveTo(length*.055,-half*.60);ctx.lineTo(length*.975,0);
 ctx.strokeStyle=`rgba(255,226,136,${.55+.28*crest})`;ctx.lineWidth=Math.max(.7,half*.29);ctx.stroke();
 for(const side of [-1,1]){
  const phase=fract(u+(side<0?.43:0)),wave=Math.sin(Math.PI*phase)**.8;
  const joints=[0,.16,.22,.37,.58,.67,.79,.91,1];
  ctx.beginPath();
  for(let i=0;i<joints.length;i++){
   const v=joints[i],s=.025+phase*.58+v*.37,tap=Math.sin(Math.PI*v);
   const edge=half*(.65+.43*Math.sin(s*Math.PI))*(1-s*.80);
   const branch=.55*Math.sin(v*9.2+time*3.1)+.30*Math.cos(v*25-time*2.1)+.18*Math.sin(i*3.3+time*1.7);
   const px=s*length,py=side*(edge+tap*half*(.68+branch));
   if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.strokeStyle=`rgba(255,155,30,${.36*wave})`;ctx.lineWidth=Math.max(1,half*.87);ctx.stroke();
  ctx.strokeStyle=`rgba(255,234,143,${.94*wave})`;ctx.lineWidth=Math.max(.65,half*.245);ctx.stroke();
 }
 const hot=Math.sin(Math.PI*u)**2;
 glow(ctx,length*u,-half*.48,Math.max(4,half*3.1),Math.max(2.5,half*1.4),(.65+.27*charge)*hot);
 if(art){
  stamp(ctx,art,'fork',.12+.34*fract(time/1.54+.23),length*(.28+.39*u),0,length*(.40+.15*charge),half*(6.0+2.2*charge),{alpha:.58+.37*charge,bloom:.82,angle:-.08});
  if(charge>.23)stamp(ctx,art,'fork',.11+.22*fract(time*.86),length*.86,half*.60,length*.26,half*5.5,{alpha:.77*charge,bloom:.82,angle:.09,flip:-1});
 }
 glow(ctx,0,0,half*(3.3+charge),half*2.55,.45+.21*crest);
 flare(ctx,0,0,half*(1.8+1.7*charge),.88,.33+.54*charge);
 flare(ctx,length*.985,0,Math.min(17,Math.max(3,half*(1.1+1.9*charge))),-.67,(.17+.76*charge)*(.69+.31*crest));
 ctx.restore();
}
// Scene units relative to the guard's foot. The body always occludes this pass.
function drawStormCorona(ctx,image,time,charge){
 if(!image)return;
 // A continuous transform preserves the thin branches at every render scale.
 ctx.save();ctx.globalCompositeOperation='lighter';
 const p=(image.naturalWidth||image.width)/1536;
 const paint=(halfW,halfH)=>ctx.drawImage(image,1084*p,1178*p,352*p,352*p,-halfW,-halfH,2*halfW,2*halfH);
 // A narrower counter-winding current rises off the floor on the far side.
 ctx.save();ctx.translate(-28-8*charge,-186-9*charge);
 ctx.transform(-.81,.17,-.07,1,0,0);ctx.rotate(-.075+.032*Math.sin(time*.98));
 ctx.globalAlpha*=.27+.38*charge;paint(130,144+14*charge);ctx.restore();
 ctx.translate(-4+3.2*Math.sin(time*1.37),-167-8*charge+3.8*Math.sin(time*1.56));
 ctx.transform(1+.025*Math.cos(time*1.4),.029*Math.sin(time*1.57),.040*Math.sin(time*1.2),1,0,0);
 ctx.globalAlpha*=clamp(.83+.12*charge+.046*Math.sin(time*2.18));
 const halfW=158+17*charge,halfH=158+15*charge;
 paint(halfW,halfH);
 const nodes=[[108,-86],[87,-30],[-95,39],[-101,118]];
 for(let i=0;i<nodes.length;i++){
  const [x,y]=nodes[i],beat=(.5+.5*Math.cos(time*2.24-i*1.67))**7;
  flare(ctx,x*halfW/148,y*halfH/146,8+8*charge,-.74,beat*(.56+.42*charge));
 }
 ctx.restore();
}
function groundCurrent(ctx,art,time,charge){
 const travel=fract(time/2.3);
 ctx.save();ctx.globalCompositeOperation='lighter';
 glow(ctx,1,-3,151+23*charge,21+8*charge,.54+.31*charge);
 glow(ctx,-8,-3,89,7,.34+.35*charge);
 for(let i=0;i<3;i++){
  const u=fract(travel+i/3),r=68+93*u,alpha=Math.sin(Math.PI*u)**2*(.29+.59*charge);
  ctx.save();ctx.translate(-3,-1);ctx.scale(1,.117);
  const start=time*.48+i*2.13;
  ctx.beginPath();ctx.ellipse(0,0,r,r,0,start,start+1.39);
  ctx.strokeStyle=`rgba(255,180,54,${alpha})`;ctx.lineWidth=2.8;ctx.stroke();
  ctx.beginPath();ctx.ellipse(0,0,r-3,r-3,0,start+.16,start+1.06);
  ctx.strokeStyle=`rgba(255,234,151,${alpha*.9})`;ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
 }
 stamp(ctx,art,'rift',.13+.39*travel,-1,-2,151+108*charge,11+10*charge,{alpha:.35+.57*charge,bloom:.74,angle:-.025});
 ctx.restore();
}
export function drawSaintAtmosphere(ctx,art,x,y,scale,facing,time,strength=1,material=null,charge=idleCharge(time)){
 if(!art)return;
 ctx.save();ctx.translate(x,y);ctx.scale(scale*facing,scale);ctx.globalAlpha*=strength;
 const breath=.5+.5*Math.cos(tau*time/3.8);
 groundCurrent(ctx,art,time,charge);
 glow(ctx,8,-167,156,172,.22+.13*breath+.16*charge);
 drawStormCorona(ctx,material,time,charge);coronaRibbon(ctx,time,false,charge);
 // Low fog crosses behind the ankles. The taller charges bloom behind the shoulder.
 stamp(ctx,art,'gust',fract(time/3.3+.47),-5,-15,252,72,{alpha:.44,bloom:.44,angle:-.06});
 stamp(ctx,art,'helix',fract(time/4.1+.34),3,-112,217,166,{alpha:.33,bloom:.42,angle:-.20});
 stamp(ctx,art,'mantle',fract(time/4.6+.18),-17,-189,222,106,{alpha:.24,bloom:.40,angle:-.12});
 const branch=.10+.43*fract(time*.75);
 stamp(ctx,art,'fork',branch,-81-12*charge,-234-14*charge,141+49*charge,52+28*charge,{alpha:.42+.50*charge,bloom:.79,angle:.97});
 stamp(ctx,art,'fork',.11+.39*fract(time*.83+.45),81+13*charge,-188,123+53*charge,52+29*charge,{alpha:.39+.51*charge,bloom:.75,angle:-1.04,flip:-1});
 if(charge>.18){
  stamp(ctx,art,'leader',.15+.27*fract(time*.66+.2),-43,-296-12*charge,58+37*charge,99+51*charge,{alpha:.73*charge,bloom:.81,angle:-.53});
  stamp(ctx,art,'fork',.12+.29*fract(time*.7+.43),38,-57,115+44*charge,43,{alpha:.76*charge,bloom:.76,angle:-.52});
 }
 ctx.globalCompositeOperation='lighter';
 const opacity=ctx.globalAlpha;
 for(let i=0;i<23;i++){
  const p=fract(time*(.27+(i%3)*.034)+i*.618034),side=i%2?1:-1;
  const arc=(.45+.55*Math.sin(Math.PI*p)),px=side*(26+((i*43)%108)+18*charge)*arc+Math.sin(i*2.9+p*4)*8;
  const py=-12-p*(120+(i*37)%206);
  ctx.globalAlpha=opacity*Math.sin(Math.PI*p)**2*(.49+(i%3)*.13+.15*charge);
  ctx.fillStyle=i%3?'#ffca50':'#fff5b6';ctx.beginPath();ctx.ellipse(px,py,1.1+(i%2)*.5,2.3+(i%3)*.7,side*.37,0,tau);ctx.fill();
  if(i%6===1)flare(ctx,px,py,4.2+4*charge,side*.51,.79);
 }
 ctx.restore();
}
// Both material planes share the body's exact crop and pivot, including the mirrored recovery frames.
export function drawSaintMaterials(ctx,atlas,key,ref,dx,dy,w,h,time,charge=idleCharge(time)){
 if(!atlas.material){bladeCurrent(ctx,bladeTracks[key],dx,dy,time,atlas.auraArt,charge);return;}
 const [sx,sy,sw,sh]=ref.rect,tile=512;
 const p=(atlas.material.naturalWidth||atlas.material.width)/1536;
 const left=((ref.page%3)*tile+sx/4)*p,top=(Math.floor(ref.page/3)*tile+sy/4)*p;
 ctx.save();ctx.globalCompositeOperation='lighter';
 const alpha=ctx.globalAlpha;
 ctx.globalAlpha=alpha*clamp(.39+.14*Math.cos(tau*time/2.55)+.44*charge);ctx.drawImage(atlas.material,left,top,sw*p/4,sh*p/4,dx,dy,w,h);
 const second=1536*p;
 ctx.globalAlpha=alpha*clamp(.80+.12*Math.sin(tau*time/3.9)+.29*charge);ctx.drawImage(atlas.material,left,top+second,sw*p/4,sh*p/4,dx,dy,w,h);
 // The return flash runs only through painted conductive stitches and armor edges.
 if(charge>.28){
  ctx.globalAlpha=alpha*.57*smooth((charge-.28)/.72);
  ctx.drawImage(atlas.material,left,top+second,sw*p/4,sh*p/4,dx,dy,w,h);
 }
 // A moving highlight climbs from the hem to the shoulder through the same mask.
 const travel=fract(time*.65+.04),center=.92-.60*travel,step=.031;
 const crest=(.37+.36*charge)*Math.sin(Math.PI*travel)**2;
 for(let i=-2;i<=2;i++){
  const row=center+(i-.5)*step;
  ctx.globalAlpha=alpha*crest*(1-Math.abs(i)/3);
  ctx.drawImage(atlas.material,left,top+second+row*sh*p/4,sw*p/4,step*sh*p/4,dx,dy+row*h,w,step*h);
 }
 ctx.restore();bladeCurrent(ctx,bladeTracks[key],dx,dy,time,atlas.auraArt,charge);
}
function guardSpark(ctx,time){
 // In the 193 × 442 guard crop, the bevel extends from (159,183) to (188,4).
 const u=fract(time/1.92+.14),peak=Math.sin(Math.PI*u)**2,x=62+29*u,y=-259-179*u;
 ctx.save();ctx.globalCompositeOperation='lighter';
 glow(ctx,x,y,10+4*peak,16,.43*peak);
 ctx.strokeStyle=`rgba(255,244,168,${peak*.92})`;ctx.lineWidth=1.45;ctx.beginPath();
 ctx.moveTo(x-1.2,y+6);ctx.lineTo(x+1.1,y-6);ctx.stroke();
 ctx.restore();
}
export function drawIdleAura(canvas,assets,time){
 const ctx=canvas.getContext('2d'),a=assets.actor,index=a.banks.v2.start,ref=a.sprites[a.frames[index]],p=a.compact?.5:1;
 const [sx,sy,w,h]=ref.rect,dx=ref.offset[0]-a.pivots[index][0],dy=ref.offset[1]-a.pivots[index][1];
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(footX,footY);
 const charge=idleCharge(time);
 drawSaintAtmosphere(ctx,assets.art,0,0,1,1,time,1,a.material,charge);
 ctx.globalCompositeOperation='destination-out';ctx.drawImage(a.pages[ref.page],sx*p,sy*p,w*p,h*p,dx,dy,w,h);
 ctx.globalCompositeOperation='source-over';drawSaintMaterials(ctx,a,a.frames[index],ref,dx,dy,w,h,time,charge);coronaRibbon(ctx,time,true,charge);guardSpark(ctx,time);
 ctx.restore();
}
