import {Point} from 'pixi.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),smooth=x=>{const u=clamp(x,0,1);return u*u*(3-2*u);};
export function battleField(engine){
 const shell=engine.host.closest('.battle-v3-live-shell'),css=shell?getComputedStyle(shell):null,left=parseFloat(css?.getPropertyValue('--v3-hud-left'))||18,right=parseFloat(css?.getPropertyValue('--v3-hud-right'))||18,top=parseFloat(css?.getPropertyValue('--v3-hud-top'))||72;
 const a=engine.combatLayer.toLocal(new Point(left+16,top+12)),b=engine.combatLayer.toLocal(new Point(engine.app.screen.width-right-16,engine.app.screen.height-18));return{left:a.x,top:a.y,right:b.x,bottom:b.y};
}
export function makeSwordRoute(adapter,id,targets,start,facing){
 const f=battleField(adapter.engine),s=Math.abs(adapter.actor.root.scale.x),xs=targets.map(t=>t.root.x),ys=targets.map(t=>t.root.y),limits={left:f.left+90*s,right:f.right-110*s,top:f.top+340*s,bottom:f.bottom-30*s};
 const x=v=>clamp(v,limits.left,limits.right),y=v=>clamp(v,limits.top,limits.bottom),near=x((facing>0?Math.min(...xs):Math.max(...xs))-facing*135*s),far=x((facing>0?Math.max(...xs):Math.min(...xs))+facing*120*s),mid=x((near+far)/2),upper=y(Math.min(...ys)),lower=y(Math.max(...ys)),mean=y(ys.reduce((n,v)=>n+v,0)/ys.length);
 const mark=(time,x,y,face=facing)=>({time,x,y,facing:face});
 const route=id==='storm'?[mark(0,start.x,start.y),mark(.58,start.x,start.y),mark(.70,near,mean),mark(.98,far,mean),mark(2.48,far,mean),mark(3.15,start.x,start.y),mark(3.20,start.x,start.y)]:[
  mark(0,start.x,start.y),mark(.40,near,lower),mark(.67,far,upper),mark(.85,far,upper,-facing),mark(1.06,near,lower,-facing),mark(1.30,near,upper),mark(1.52,far,lower),mark(1.76,far,lower,-facing),mark(1.94,mid,upper,-facing),mark(2.12,mid,upper),mark(2.50,mid,lower),mark(2.75,mid,lower),mark(3.78,mid,lower),mark(4.30,start.x,start.y),mark(4.35,start.x,start.y)
 ];return{route,facing,field:f,limits,targetFrame:{near,far,mid,upper,lower,mean}};
}
export function routeAt(route,time){
 let left=route[0],right=left;for(let i=1;i<route.length;i++){right=route[i];if(time<right.time)break;left=right;}
 const u=right.time>left.time?smooth((time-left.time)/(right.time-left.time)):0;
 return{x:left.x+(right.x-left.x)*u,y:left.y+(right.y-left.y)*u,facing:left.facing};
}
