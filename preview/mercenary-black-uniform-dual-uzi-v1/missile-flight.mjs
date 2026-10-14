import {clamp} from './skill.mjs';

// Fix the strike to enemy torso coordinates. Fit the artwork by size, never by lowering its origin.
export function strikeLayout(points,scene,extents){
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const epicenter={x:xs.reduce((a,b)=>a+b,0)/xs.length,y:(Math.min(...ys)+Math.max(...ys))/2};
 const safe=24;
 const size=Math.min(scene.width*.9,Math.max(620,Math.max(...xs)-Math.min(...xs)+430),
  (epicenter.x-safe)/extents.left,(scene.width-epicenter.x-safe)/extents.right,
  (epicenter.y-safe)/extents.up,(scene.height-epicenter.y-safe)/extents.down);
 return {epicenter,size:Math.max(1,size)};
}

export function missileTip(missile,time,hit,length){
 const progress=clamp((time-missile.launch)/(missile.impact-missile.launch));
 const startY=-length*.25;
 return {x:hit.x,y:startY+(hit.y-startY)*Math.pow(progress,1.35),progress};
}
