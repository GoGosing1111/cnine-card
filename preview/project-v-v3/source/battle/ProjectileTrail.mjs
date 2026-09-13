// Secondary flight geometry sampled by the existing V3 GSAP clock. Primary
// authored role/skill sequences and their impact times remain unchanged.
export function projectilePixelScale(layer){
 const matrix=layer?.worldTransform,scale=Math.hypot(Number(matrix?.a??1),Number(matrix?.b??0));
 return Number.isFinite(scale)?Math.max(.05,scale):1;
}
export function projectileTrailGeometry(from,to,progress,{arrow=false,arcHeight=0,scale=1,width=3.5}={}){
 if(![from?.x,from?.y,to?.x,to?.y,progress,scale].every(Number.isFinite)||scale<=0)return null;
 const distance=Math.hypot(to.x-from.x,to.y-from.y);if(distance<1)return null;
 const q=Math.min(1,Math.max(0,progress)),unit=1/scale;
 const height=arcHeight||0,path=t=>({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t-Math.sin(Math.PI*t)*height});
 const span=Math.min(.55,(arrow?58:100)*unit/distance),tail=Math.max(0,q-span);
 const points=Array.from({length:13},(_,i)=>path(tail+(q-tail)*i/12)),head=points.at(-1);
 const angle=Math.atan2(to.y-from.y-Math.PI*height*Math.cos(Math.PI*q),to.x-from.x);
 return {points,head,angle,arrow,unit,width:Math.max(arrow?3:3.5,width)*unit,cssWidth:Math.max(arrow?3:3.5,width),progress:q};
}
export function drawProjectileTrail(graphics,geometry,color=0xffcf75){
 if(!geometry)return;
 const {points,head,angle,arrow,unit,width}=geometry;
 for(const [size,tint,alpha]of [[width*3.8,0x08101c,.75],[width*2.6,color,.52],[width,0xfff9ea,1]]){
  graphics.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))graphics.lineTo(p.x,p.y);
  graphics.stroke({width:size,color:tint,alpha,cap:'round',join:'round'});
 }
 if(arrow){
  const along=(d,n=0)=>({x:head.x-Math.cos(angle)*d+Math.sin(angle)*n,y:head.y-Math.sin(angle)*d-Math.cos(angle)*n});
  const left=along(13*unit,5.5*unit),right=along(13*unit,-5.5*unit);
  graphics.poly([head.x,head.y,left.x,left.y,right.x,right.y]).fill({color:0xfff9ea,alpha:1}).stroke({width:1.5*unit,color,alpha:1});
  const rear=points[0],rearAngle=Math.atan2(points[1].y-rear.y,points[1].x-rear.x);
  if(Math.hypot(head.x-rear.x,head.y-rear.y)>18*unit)for(const side of [-1,1])graphics.moveTo(rear.x,rear.y).lineTo(rear.x+Math.cos(rearAngle)*12*unit+Math.sin(rearAngle)*6*unit*side,rear.y+Math.sin(rearAngle)*12*unit-Math.cos(rearAngle)*6*unit*side).stroke({width:2.5*unit,color:0xfff9ea,alpha:.95});
 }else graphics.circle(head.x,head.y,4*unit).fill({color:0xfff9ea,alpha:1});
}
