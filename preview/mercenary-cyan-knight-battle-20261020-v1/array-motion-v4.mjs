// Five autonomous routes share one clock, but never share a launch barrier or impact beat.
export const ARRAY_DURATION=4.55,PHANTOM_COUNT=5;
const clamp=n=>Math.max(0,Math.min(1,n)),mix=(a,b,t)=>a+(b-a)*t;
const delta=(a,b)=>{let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;};
// Successive impacts interleave blades 0/3/1/4/0/2/3/1/4/2, not simultaneous volleys.
export const attackPlans=[
 [{at:.83,kind:'diagonal-dive'},{at:1.41,kind:'bow-sweep'},{at:2.24,kind:'stair-down'},{at:2.94,kind:'s-rise'}],
 [{at:1.12,kind:'crescent-in'},{at:1.82,kind:'s-rise'},{at:2.38,kind:'diagonal-cross'},{at:3.25,kind:'hook-loop'}],
 [{at:1.56,kind:'s-cross'},{at:2.10,kind:'drop'},{at:2.80,kind:'zigzag-up'},{at:3.42,kind:'bow-sweep'}],
 [{at:.99,kind:'diagonal-cross'},{at:1.69,kind:'stair-down'},{at:2.66,kind:'s-cross'},{at:3.60,kind:'crescent-dive'}],
 [{at:1.29,kind:'crescent-rise'},{at:1.98,kind:'hook-loop'},{at:2.51,kind:'diagonal-dive'},{at:3.09,kind:'zigzag-up'}]
];
const aimPoints=[{x:-.16,y:-.18},{x:.15,y:.10},{x:-.10,y:.17},{x:.18,y:-.06},{x:0,y:-.22}];
// Expand the outer formation and return arcs, leaving the target's contact zone intact.
const spreadAxis=(value,gain)=>Math.sign(value)*(Math.min(Math.abs(value),.25)+Math.max(0,Math.abs(value)-.25)*gain);
const spreadPoint=p=>({...p,x:spreadAxis(p.x,1.35),y:spreadAxis(p.y,1.18)});
export const phantomTracks=attackPlans.map((plans,i)=>{
 const fanX=[-1.25,-.62,0,.62,1.25][i],fanY=[-.80,-1.12,-1.22,-1.12,-.80][i];
 const track=[{at:.12+i*.026,x:fanX,y:fanY,angle:-Math.PI/2,alpha:0,phase:'summon'},{at:.34+i*.026,x:fanX,y:fanY,angle:-Math.PI/2,alpha:1,phase:'summon'}];
 const last=()=>track.at(-1);
 const hold=(until,angle=last().angle,phase=last().phase)=>{
  if(until<last().at-1e-6)throw Error('Nonmonotonic sword track '+i+' at '+until);
  track.push({...last(),at:until,angle,phase,hit:false,curve:null});
 };
 const fly=(seconds,p,phase,hit=false)=>{
  const a=last(),curve=p.c1?{c1:p.c1,c2:p.c2}:null,start=curve?curve.c1:p,end=curve?curve.c2:a;
  a.angle=Math.atan2(start.y-a.y,start.x-a.x);
  track.push({at:a.at+seconds,x:p.x,y:p.y,angle:Math.atan2(p.y-end.y,p.x-end.x),alpha:1,phase,hit,curve});
 };
 plans.forEach((plan,j)=>{
  const base=aimPoints[(i+j*2)%5],aim={x:base.x+(j%2?.015:-.015),y:base.y+(i%2?.012:-.012)},p=last();
  const high=-.83-((i+j)%3)*.12,low=.40+((i+j)%3)*.07,side=(i+j)%2?1:-1;
  const arc=(end,c1,c2)=>({...end,c1,c2});
  let points;
  switch(plan.kind){
   case'drop':points=[{x:p.x,y:high},{x:aim.x,y:high},aim];break;
   case'stair-down':{const shoulder=aim.x+(i%2?.62:-.62);points=[{x:p.x,y:high},{x:shoulder,y:high},{x:shoulder,y:aim.y-.34},{x:aim.x,y:aim.y-.34},aim];break;}
   case'diagonal-dive':points=[arc({x:side*.96,y:high},{x:p.x,y:high-.12},{x:side*1.2,y:high-.12}),aim];break;
   case'diagonal-cross':points=[arc({x:-side*1.13,y:aim.y-.42},{x:-side*1.24,y:high},{x:-side*1.26,y:aim.y-.62}),aim];break;
   case'crescent-in':points=[arc(aim,{x:side*1.28,y:high},{x:side*1.12,y:low})];break;
   case'crescent-dive':points=[arc(aim,{x:side*1.20,y:high-.10},{x:side*.85,y:high-.10})];break;
   case'crescent-rise':points=[arc(aim,{x:side*1.28,y:low},{x:-side*.80,y:.62})];break;
   case'bow-sweep':points=[arc(aim,{x:-side*1.28,y:high},{x:side*1.15,y:high})];break;
   case's-cross':points=[arc(aim,{x:side*1.28,y:high},{x:-side*1.02,y:low})];break;
   case's-rise':points=[arc({x:side*.90,y:low},{x:p.x,y:.62},{x:-side*.75,y:.62}),arc(aim,{x:side*1.24,y:low},{x:-side*.70,y:aim.y+.43})];break;
   case'hook-loop':points=[arc({x:side*.75,y:low},{x:side*1.28,y:high},{x:side*1.28,y:.62}),arc(aim,{x:-side*.85,y:.62},{x:-side*.80,y:aim.y-.38})];break;
   case'zigzag-up':points=[{x:side*1.10,y:.54},{x:side*.52,y:.12},{x:-side*.38,y:.45},aim];break;
  }
  let previous=p;
  points=points.filter(q=>{if(Math.hypot(q.x-previous.x,q.y-previous.y)<1e-6)return false;previous=q;return true;});
  previous=p;
  const legs=points.map((q,k)=>{const a=previous;previous=q;const direction=q.c1||q,length=q.c1?Math.hypot(q.c1.x-a.x,q.c1.y-a.y)+Math.hypot(q.c2.x-q.c1.x,q.c2.y-q.c1.y)+Math.hypot(q.x-q.c2.x,q.y-q.c2.y):Math.hypot(q.x-a.x,q.y-a.y);return{point:q,angle:Math.atan2(direction.y-a.y,direction.x-a.x),duration:Math.max(q.c1?.11:.035,Math.min(q.c1?.23:.075,length/24)),brake:k===0?.022:q.c1?.012:.032};});
  const total=legs.reduce((n,l)=>n+l.duration+l.brake,0),tempo=Math.min(1,(plan.at-last().at-.015)/total),start=plan.at-total*tempo;
  if(tempo<=0)throw Error('Overlapping sword schedule');
  hold(start,last().angle,'waiting-'+plan.kind);
  for(const [k,leg]of legs.entries()){hold(last().at+leg.brake*tempo,leg.angle,plan.kind);fly(leg.duration*tempo,leg.point,plan.kind,k===legs.length-1);}
  // Follow the actual impact tangent, then curl around outside before the next independent approach.
  const bound=p=>({x:Math.max(-1.28,Math.min(1.28,p.x)),y:Math.max(-1.20,Math.min(.62,p.y))}),angle=last().angle,dx=Math.cos(angle),dy=Math.sin(angle),exit=bound({x:aim.x+dx*.82,y:aim.y+dy*.82});
  hold(last().at+.018+(i%2)*.006,angle,'follow-through');fly(.045,exit,'follow-through');
  if(j===plans.length-1){hold(last().at+.035,angle,'dissolve');track.push({...last(),at:last().at+.18,alpha:0,phase:'dissolve',hit:false,curve:null});}
  else{const turn=bound({x:exit.x-dy*.30,y:exit.y+dx*.30});fly(.085,arc(turn,bound({x:exit.x+dx*.23,y:exit.y+dy*.23}),bound({x:turn.x+dx*.23,y:turn.y+dy*.23})),'return-arc');}
 });
 const expanded=track.map(p=>({...spreadPoint(p),curve:p.curve?{c1:spreadPoint(p.curve.c1),c2:spreadPoint(p.curve.c2)}:null}));
 // Rebuild flight tangents after expanding the Bezier controls; stationary turns remain continuous.
 for(let k=0;k<expanded.length-1;k++){
  const a=expanded[k],b=expanded[k+1];if(!b.curve&&Math.hypot(b.x-a.x,b.y-a.y)<1e-8)continue;
  const start=segmentTangent(a,b,0),end=segmentTangent(a,b,1);
  a.angle=Math.atan2(start.y,start.x);b.angle=Math.atan2(end.y,end.x);
 }
 return expanded;
});
const routePoints=phantomTracks.flatMap(track=>track.flatMap(p=>p.curve?[p,p.curve.c1,p.curve.c2]:[p]));
export const ARRAY_ROUTE_EXTENTS={left:Math.max(...routePoints.map(p=>-p.x))+.04,right:Math.max(...routePoints.map(p=>p.x))+.04,up:Math.max(...routePoints.map(p=>-p.y))+.04,down:Math.max(...routePoints.map(p=>p.y))+.04};
export const impactEvents=phantomTracks.flatMap((track,index)=>track.filter(p=>p.hit).map(p=>({...p,index,targetIndex:index%3}))).sort((a,b)=>a.at-b.at);
export const cornerEvents=phantomTracks.flatMap((track,index)=>track.flatMap((a,k)=>{
 const b=track[k+1];if(!b||b.curve||a.at<.45||Math.hypot(a.x-b.x,a.y-b.y)>.00001||Math.abs(delta(a.angle,b.angle))<Math.PI/4)return[];
 return[{at:a.at+(b.at-a.at)*.55,x:a.x,y:a.y,angle:b.angle,index,targetIndex:index%3}];
}));
export function phantomSample(t){
 return phantomTracks.map((track,index)=>{
  if(t<track[0].at||t>=track.at(-1).at)return null;
  const n=Math.max(0,track.findLastIndex(p=>p.at<=t)),a=track[n],b=track[Math.min(n+1,track.length-1)],q=b.at===a.at?1:clamp((t-a.at)/(b.at-a.at));
  const held=!b.curve&&Math.hypot(b.x-a.x,b.y-a.y)<1e-5,p=segmentPoint(a,b,q),d=segmentTangent(a,b,q);
  return{index,targetIndex:index%3,x:p.x,y:p.y,angle:held?a.angle+delta(a.angle,b.angle)*q:Math.atan2(d.y,d.x),alpha:mix(a.alpha,b.alpha,q),phase:a.phase,held,curved:!!b.curve,velocity:held?0:Math.hypot(d.x,d.y)/(b.at-a.at)};
 }).filter(Boolean);
}
export function segmentPoint(a,b,t){
 if(!b.curve)return{x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)};
 const {c1,c2}=b.curve,u=1-t;return{x:u*u*u*a.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*b.y};
}
export function segmentTangent(a,b,t){
 if(!b.curve)return{x:b.x-a.x,y:b.y-a.y};
 const {c1,c2}=b.curve,u=1-t;return{x:3*u*u*(c1.x-a.x)+6*u*t*(c2.x-c1.x)+3*t*t*(b.x-c2.x),y:3*u*u*(c1.y-a.y)+6*u*t*(c2.y-c1.y)+3*t*t*(b.y-c2.y)};
}
// The painted ribbon follows the same curved/straight path as its sword, including the return arc.
export function traceSegments(t,lifetime=.28){
 const out=[];
 phantomTracks.forEach((track,index)=>{
  for(let k=0;k<track.length-1;k++){
   const a=track[k],b=track[k+1],dx=b.x-a.x,dy=b.y-a.y;
   if(a.at<.45||t<a.at||b.at<t-lifetime||(!b.curve&&Math.hypot(dx,dy)<.015))continue;
   const from=Math.max(a.at,t-lifetime),to=Math.min(b.at,t);if(to<=from)continue;
   const u=clamp((from-a.at)/(b.at-a.at)),v=clamp((to-a.at)/(b.at-a.at));
   const points=Array.from({length:24},(_,k)=>segmentPoint(a,b,mix(u,v,k/23)));
   out.push({index,targetIndex:index%3,from:points[0],to:points.at(-1),points,curved:!!b.curve,age:t-to,tailAge:t-from,lifetime});
  }
 });
 return out;
}
