const point=actor=>({x:actor.root.baseX??actor.baseX??actor.root.x,y:actor.root.baseY??actor.baseY??actor.root.y});
const blend=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

// Presentation uses the formation, never the first entry in the damage receipt.
// The actor approaches the front of the target formation before the authored
// skill clock starts. Negative times are approach, times past duration return.
export function ryujinSkillPlacement({start,targets,cooperative,duration,reach=170}){
 const points=targets.filter(a=>a?.root&&!a.root.destroyed).map(point).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 const impact=points.length?{
  x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,
  y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2
 }:{...start};
 const direction=impact.x>=start.x?1:-1;
 const front=points.length?(direction>0?Math.min(...points.map(p=>p.x)):Math.max(...points.map(p=>p.x))):start.x;
 const distance=Math.max(0,(front-start.x)*direction-Math.max(0,reach));
 const cast={x:start.x+direction*distance,y:impact.y};
 const approachSeconds=Math.hypot(cast.x-start.x,cast.y-start.y)>.01?.24:0,returnSeconds=approachSeconds?.22:0;
 return {mode:cooperative?'PARTY_CENTER_APPROACH':'PVE_APPROACH',cast,impact,approachSeconds,returnSeconds,
  rootAt(t){
   if(t<0&&approachSeconds)return blend(start,cast,smooth((t+approachSeconds)/approachSeconds));
   if(t>duration&&returnSeconds)return blend(cast,start,smooth((t-duration)/returnSeconds));
   return {...cast};
  }
 };
}
