import {byId,authoredById,defaultAnchors,skills} from './skills.mjs';
import {toSource} from '../timing.mjs';
import {anchor,clamp,link,paintEvent,smooth} from './paint.mjs';
import {debris,renderBlades} from './volume.mjs';


export const getEffect=id=>byId[id]||null;
const buffers=new WeakMap();

function layerBuffer(target) {
 let scratch=buffers.get(target);
 if(!scratch){const c=document.createElement('canvas');scratch=c.getContext('2d',{alpha:true});buffers.set(target,scratch);}
 if(scratch.canvas.width!==target.canvas.width)scratch.canvas.width=target.canvas.width;
 if(scratch.canvas.height!==target.canvas.height)scratch.canvas.height=target.canvas.height;
 scratch.resetTransform();scratch.clearRect(0,0,scratch.canvas.width,scratch.canvas.height);
 scratch.setTransform(target.getTransform());scratch.imageSmoothingQuality='high';
 return scratch;
}
export function drawEffect(ctx,art,id,seconds,options={}){
 seconds=toSource(seconds);
 const sk=authoredById[id];if(!sk||!Number.isFinite(seconds)||seconds<=0||seconds>=sk.seconds)return;
 const p={...defaultAnchors,...options};p.facing=p.facing<0?-1:1;
 if(!Number.isFinite(p.scale)||p.scale<=0)return;
 const passes=p.pass?[p.pass]:['rear','front'];
 const opacity=smooth(seconds/.047)*smooth((sk.seconds-seconds-1/30)/.12);
 if(opacity===0)return;
 for(const pass of passes){
  const ink=layerBuffer(ctx);
  for(const e of sk.events){
   if(e.layer!==pass&&e.layer!=='both')continue;
   const u=(seconds-e.at)/e.life;if(u<0||u>=1)continue;
   switch(e.kind){
    case 'paint':paintEvent(ink,art,e,u,p);break;
    case 'link':link(ink,art,anchor(e.p,p),anchor(e.q,p),clamp(u),e.width*p.scale,e.alpha??1,e.bloom??.64);break;
    case 'blades':renderBlades(ink,art,e,u,pass,p);break;
    case 'debris':debris(ink,e,u,pass,p);break;
   }
  }
  ctx.save();ctx.resetTransform();ctx.globalAlpha*=opacity;ctx.drawImage(ink.canvas,0,0);ctx.restore();
 }
}
