import {anchor,clamp,fade,link,mix,radians,smooth,stamp} from './paint.mjs';
const tau=2*Math.PI;
const noise=n=>{const a=Math.sin(n*127.1+311.7)*43758.5453123;return a-Math.floor(a);};
const vec=(x,y,z)=>({x,y,z});
const add=(p,q)=>vec(p.x+q.x,p.y+q.y,p.z+q.z);
const bez=(p,c,q,t)=>vec((1-t)**2*p.x+2*(1-t)*t*c.x+t*t*q.x,(1-t)**2*p.y+2*(1-t)*t*c.y+t*t*q.y,(1-t)**2*p.z+2*(1-t)*t*c.z+t*t*q.z);
function screen(p,placement){
 const k=1020/(1020-p.z),scale=placement.scale;
 return [placement.target[0]+placement.facing*p.x*k*scale,placement.target[1]+(p.y*k-p.z*.20)*scale,k];
}
function formation(mode,i,n,u,placement){
 const theta=(i+.5)/n*tau,handX=(placement.source[0]-placement.target[0])*placement.facing/placement.scale,handY=(placement.source[1]-placement.target[1])/placement.scale;
 if(mode==='orbit'){const a=theta+u*2.1;return vec(Math.cos(a)*193,-65+Math.sin(a)*49,Math.sin(a)*89);}
 if(mode==='wings'){
  const sign=i%2?1:-1,h=Math.floor(i/2);
  const spread=[1.28,.93,.58,.245][h],radius=134+h*7;
  return vec(handX+sign*Math.sin(spread)*radius,handY-49-Math.cos(spread)*radius+Math.sin(u*6+i)*3,[-20,8,-15,12][h]);
 }
 if(mode==='rain')return vec(-226+i*53, -245+(i%3)*34+Math.sin(i*.8)*17,-68+(i%4)*37);
 if(mode==='cage')return vec(Math.cos(theta+u*.49)*211,-38-Math.sin(theta)*19,Math.sin(theta+u*.49)*102);
 const variants=[[-163,-128,-25],[130,-110,21],[-132,-172,23],[117,-163,-46]];
 return vec(...variants[i%4]);
}
function sword(ctx,art,base,tip,roll,opacity,placement){
 const B=screen(base,placement),A=screen(tip,placement),im=art.phantom.im,dx=A[0]-B[0],dy=A[1]-B[1],length=Math.hypot(dx,dy);
 if(length<1)return;
 const thickness=.40+.60*Math.abs(Math.cos(roll)),width=length*(im.naturalWidth/im.naturalHeight)*thickness;
 ctx.save();ctx.globalAlpha*=clamp(opacity);ctx.translate((A[0]+B[0])/2,(A[1]+B[1])/2);ctx.rotate(Math.atan2(dy,dx)+Math.PI/2);
 ctx.drawImage(im,-width/2,-length/2,width,length);
 const glint=Math.max(0,Math.cos(roll*2.0-1.2))**6;
 if(glint>.08){ctx.globalCompositeOperation='lighter';ctx.globalAlpha*=glint*.35;ctx.drawImage(im,-width/2,-length/2,width,length);}
 ctx.restore();
}
export function renderBlades(ctx,art,e,u,pass,P){
 const v=u*e.life,mode=e.mode,objects=[],groundY=(P.floor[1]-P.target[1])/P.scale;
 for(let i=0;i<e.count;i++){
  const a=formation(mode,i,e.count,u,P);let target=vec((i%3-1)*19,-7+(i%3)*13,8),delay,travel,angle,length;
  switch(mode){
   case 'orbit':delay=1.195+i*.18;travel=.29;angle=i/e.count*tau+u*2.1-1.4;length=113;break;
   case 'wings':delay=2.36+i*.18;travel=.35;angle=-Math.PI/2+(i%2?1:-1)*[1.28,.93,.58,.245][Math.floor(i/2)];length=139+Math.floor(i/2)*7;break;
   case 'rain':delay=.71+i*.24;travel=.34;angle=1.32+(i%3)*.09;length=137+i%4*10;target=vec(-192+i*51,groundY+2,(i%3-1)*15);break;
   case 'cage':delay=2.69+i*.016;travel=.37;angle=-1.34-(i%3)*.12;length=176+i%3*17;break;
   default:delay=[.52,1.30,2.22,2.52][i];travel=[.34,.45,.36,.36][i];angle=[-.82,-1.78,-.98,-2.51][i];length=[221,322,129,154][i];break;
  }
  const launch=delay-travel,t=clamp((v-launch)/travel),birth=.13+(i%4)*.038,opening=clamp((v-birth)/.22);
  if(opening<=0||v>delay+.23)continue;
  const control=vec(mix(a.x,target.x,.42)+(i%2?38:-38),Math.min(a.y,target.y)-(mode==='rain'?12:70),a.z+38);
  const flight=smooth(t)*.21+t*t*.79,head=bez(a,control,target,flight);
  const show=opening*smooth((delay+.23-v)/.23)*fade(u,.015,.05);
  const landingAngle=Math.atan2(target.y-control.y,target.x-control.x);
  const delta=Math.atan2(Math.sin(landingAngle-angle),Math.cos(landingAngle-angle));
  const th=angle+delta*smooth(t*3),roll=i*.93+u*(mode==='orbit'?3.8:1.4);
  const size=length*(.66+.34*smooth(opening))*(1-.18*smooth((v-delay)/.23));
  const tip=add(head,vec(Math.cos(th)*size*.50,Math.sin(th)*size*.50,Math.sin(roll)*size*.13));
  const pommel=add(head,vec(-Math.cos(th)*size*.50,-Math.sin(th)*size*.50,-Math.sin(roll)*size*.13));
  const end=screen(tip,P),start=screen(pommel,P);
  objects.push({z:head.z,render(){
   if(t>0&&t<1){
    const older=bez(a,control,target,Math.max(0,flight-.30)),S=screen(older,P);
    const theta=Math.atan2(end[1]-S[1],end[0]-S[0]),len=Math.hypot(end[0]-S[0],end[1]-S[1]);
    stamp(ctx,art,'wave',.14+.45*t,(S[0]+end[0])/2,(S[1]+end[1])/2,Math.max(58,len*1.32),36*P.scale,{angle:theta,alpha:show*.8,bloom:.65});
   }
   sword(ctx,art,pommel,tip,roll,show,P);
   if(opening>.58&&v<launch&&mode==='cage'){
    const next=formation(mode,(i+1)%e.count,e.count,u,P),Q=screen(next,P),z=(v*.97+i*.161)%1;
    link(ctx,art,end,Q,.15+.52*z,40*P.scale,(.38+.24*Math.cos(z*tau))*show,.47);
   }
   if(v>=delay-.045&&v<delay+.11)link(ctx,art,start,end,clamp((v-delay+.045)/.155),33*P.scale,show*.87,.7);
  }});
 }
 objects.sort((a,b)=>a.z-b.z);
 for(const o of objects)if((o.z<0?'rear':'front')===pass)o.render();
}
function facet(ctx,points,fill){
 ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}
export function debris(ctx,e,u,pass,P){
 const p=anchor(e.pos,P),s=P.scale,f=P.facing,age=u*e.life,groundY=P.floor[1],count=Math.round(13+12*e.energy);
 ctx.save();ctx.globalAlpha*=fade(u,.022,.42);
 for(let i=0;i<count;i++){
  const k=e.seed+i*13,N=n=>noise(k+n*8.37),az=N(1)*tau,z=Math.sin(az)*(40+145*N(2))*age,effectivePass=z<0?'rear':'front';if(effectivePass!==pass)continue;
  const speed=(60+244*N(3))*e.energy,up=(96+316*N(4))*(e.ground?1.18:.85),persp=940/(940-z),dx=Math.cos(az)*speed*age+(!e.ground?67*age:0),y=-up*age+300*age*age;
  const px=p[0]+f*dx*s*persp,py=Math.min(groundY-1,p[1]+(y-z*.24)*s*persp),r=(1.4+N(5)**2*7.7)*s*persp,rot=N(6)*tau+age*(N(7)-.5)*13;
  if(r<.6)continue;
  ctx.save();ctx.translate(px,py);ctx.rotate(rot);const shine=clamp(.4+.46*Math.cos(rot)+.55*(1-u)),tip=[r*(1.04+N(8)),0],a=[-.42*r,-r],b=[-.83*r,r*.58],mid=[r*.15,-r*.15];
  if(i%4===0){
   ctx.globalAlpha*=1-u;facet(ctx,[[r*2.8,0],[0,-r*.27],[-r*1.25,0],[0,r*.27]],'#ffdb73');
  }else{
   facet(ctx,[a,b,tip],'#342e39');facet(ctx,[a,mid,tip],`rgb(${Math.round(118+123*shine)},${Math.round(77+98*shine)},${Math.round(51+42*shine)})`);
   facet(ctx,[mid,b,tip],`rgb(${Math.round(64+60*shine)},${Math.round(46+38*shine)},46)`);
  }
  ctx.restore();
 }
 ctx.restore();
}
