const point=actor=>({x:actor.root.baseX??actor.baseX??actor.root.x,y:actor.root.baseY??actor.baseY??actor.root.y});
const blend=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

// Presentation uses the formation, never the first entry in the damage receipt.
// Keep ordinary PVE casts at home; party casts move to the central enemy lane.
// Server hits still retain their original targets, order and contact time.
export function ryujinSkillPlacement({start,targets,cooperative,duration,contact}){
 const points=targets.filter(a=>a?.root&&!a.root.destroyed).map(point).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 const impact=points.length?{
  x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,
  y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2
 }:{...start};
 const cast=cooperative?{x:start.x,y:impact.y}:{...start};
 const enter=Math.min(.18,Math.max(.06,(contact??.36)*.5)),leave=Math.min(.18,duration*.2);
 return {mode:cooperative?'PARTY_CENTER':'PVE_FIXED',cast,impact,
  rootAt(t){
   if(!cooperative)return {...start};
   if(t<enter)return blend(start,cast,smooth(t/enter));
   if(t>duration-leave)return blend(cast,start,smooth((t-duration+leave)/leave));
   return {...cast};
  }
 };
}
