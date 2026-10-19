// Five autonomous routes share one clock, but never share a launch barrier or impact beat.
export const ARRAY_DURATION=4.55,PHANTOM_COUNT=5;
const clamp=n=>Math.max(0,Math.min(1,n)),mix=(a,b,t)=>a+(b-a)*t;
const delta=(a,b)=>{let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;};
// Successive impacts interleave blades 0/3/1/4/0/2/3/1/4/2, not simultaneous volleys.
export const attackPlans=[
 [{at:.83,kind:'drop'},{at:1.41,kind:'from-left'},{at:2.24,kind:'stair-down'},{at:2.94,kind:'rise'}],
 [{at:1.12,kind:'from-right'},{at:1.82,kind:'rise'},{at:2.38,kind:'from-left'},{at:3.25,kind:'stair-down'}],
 [{at:1.56,kind:'hook-left'},{at:2.10,kind:'drop'},{at:2.80,kind:'stair-up'},{at:3.42,kind:'from-right'}],
 [{at:.99,kind:'from-right'},{at:1.69,kind:'stair-down'},{at:2.66,kind:'from-left'},{at:3.60,kind:'drop'}],
 [{at:1.29,kind:'rise'},{at:1.98,kind:'hook-right'},{at:2.51,kind:'drop'},{at:3.09,kind:'stair-up'}]
];
const aimPoints=[{x:-.16,y:-.18},{x:.15,y:.10},{x:-.10,y:.17},{x:.18,y:-.06},{x:0,y:-.22}];
export const phantomTracks=attackPlans.map((plans,i)=>{
 const fanX=[-1.25,-.62,0,.62,1.25][i],fanY=[-.80,-1.12,-1.22,-1.12,-.80][i];
 const track=[{at:.12+i*.026,x:fanX,y:fanY,angle:-Math.PI/2,alpha:0,phase:'summon'},{at:.34+i*.026,x:fanX,y:fanY,angle:-Math.PI/2,alpha:1,phase:'summon'}];
 const last=()=>track.at(-1);
 const hold=(until,angle=last().angle,phase=last().phase)=>{
  if(until<last().at-1e-6)throw Error('Nonmonotonic sword track '+i+' at '+until);
  track.push({...last(),at:until,angle,phase,hit:false});
 };
 const fly=(seconds,p,phase,hit=false)=>{
  const a=last(),angle=Math.atan2(p.y-a.y,p.x-a.x);a.angle=angle;
  track.push({at:a.at+seconds,x:p.x,y:p.y,angle,alpha:1,phase,hit});
 };
 plans.forEach((plan,j)=>{
  const base=aimPoints[(i+j*2)%5],aim={x:base.x+(j%2?.015:-.015),y:base.y+(i%2?.012:-.012)},p=last();
  const high=-.83-((i+j)%3)*.12,low=.40+((i+j)%3)*.07,left=-1.22+(i%3)*.10,right=1.20-(i%3)*.09;
  let points;
  switch(plan.kind){
   case'drop':points=[{x:p.x,y:high},{x:aim.x,y:high},aim];break;
   case'rise':points=[{x:p.x,y:low},{x:aim.x,y:low},aim];break;
   case'from-left':points=[{x:left,y:p.y},{x:left,y:aim.y},aim];break;
   case'from-right':points=[{x:right,y:p.y},{x:right,y:aim.y},aim];break;
   case'stair-down':{const shoulder=aim.x+(i%2?.62:-.62);points=[{x:p.x,y:high},{x:shoulder,y:high},{x:shoulder,y:aim.y-.34},{x:aim.x,y:aim.y-.34},aim];break;}
   case'stair-up':{const shoulder=aim.x+(i%2?-.56:.56);points=[{x:p.x,y:low},{x:shoulder,y:low},{x:shoulder,y:aim.y+.30},{x:aim.x,y:aim.y+.30},aim];break;}
   case'hook-left':points=[{x:left,y:p.y},{x:left,y:aim.y-.38},{x:aim.x-.42,y:aim.y-.38},{x:aim.x-.42,y:aim.y},aim];break;
   case'hook-right':points=[{x:right,y:p.y},{x:right,y:aim.y+.32},{x:aim.x+.42,y:aim.y+.32},{x:aim.x+.42,y:aim.y},aim];break;
  }
  let previous=p;
  points=points.filter(q=>{if(Math.hypot(q.x-previous.x,q.y-previous.y)<1e-6)return false;previous=q;return true;});
  previous=p;
  const legs=points.map((q,k)=>{const a=previous;previous=q;return{point:q,angle:Math.atan2(q.y-a.y,q.x-a.x),duration:Math.max(.035,Math.min(.075,Math.hypot(q.x-a.x,q.y-a.y)/24)),brake:k===0?.025:.026+((i+j+k)%3)*.006};});
  const total=legs.reduce((n,l)=>n+l.duration+l.brake,0),start=plan.at-total;
  hold(start,last().angle,'waiting-'+plan.kind);
  for(const [k,leg]of legs.entries()){hold(last().at+leg.brake,leg.angle,plan.kind);fly(leg.duration,leg.point,plan.kind,k===legs.length-1);}
  // Pass through an individual impact point, then depart along that blade's own approach axis.
  const angle=last().angle,exit={x:aim.x,y:aim.y};
  if(Math.abs(Math.cos(angle))>.5)exit.x=Math.cos(angle)>0?right:left;else exit.y=Math.sin(angle)>0?low:high;
  hold(last().at+.018+(i%2)*.006,angle,'follow-through');fly(.045,exit,'follow-through');
  if(j===plans.length-1){hold(last().at+.035,angle,'dissolve');track.push({...last(),at:last().at+.18,alpha:0,phase:'dissolve',hit:false});}
 });
 return track;
});
export const impactEvents=phantomTracks.flatMap((track,index)=>track.filter(p=>p.hit).map(p=>({...p,index,targetIndex:index%3}))).sort((a,b)=>a.at-b.at);
export const cornerEvents=phantomTracks.flatMap((track,index)=>track.flatMap((a,k)=>{
 const b=track[k+1];if(!b||a.at<.45||Math.hypot(a.x-b.x,a.y-b.y)>.00001||Math.abs(delta(a.angle,b.angle))<Math.PI/4)return[];
 return[{at:a.at+(b.at-a.at)*.55,x:a.x,y:a.y,angle:b.angle,index,targetIndex:index%3}];
}));
export function phantomSample(t){
 return phantomTracks.map((track,index)=>{
  if(t<track[0].at||t>=track.at(-1).at)return null;
  const n=Math.max(0,track.findLastIndex(p=>p.at<=t)),a=track[n],b=track[Math.min(n+1,track.length-1)],q=b.at===a.at?1:clamp((t-a.at)/(b.at-a.at));
  const held=Math.hypot(b.x-a.x,b.y-a.y)<1e-5;
  return{index,targetIndex:index%3,x:mix(a.x,b.x,q),y:mix(a.y,b.y,q),angle:held?a.angle+delta(a.angle,b.angle)*q:a.angle,alpha:mix(a.alpha,b.alpha,q),phase:a.phase,held,velocity:held?0:Math.hypot(b.x-a.x,b.y-a.y)/(b.at-a.at)};
 }).filter(Boolean);
}
// Exact clipped segments retain sharp elbows after a blade has turned.
export function traceSegments(t,lifetime=.28){
 const out=[];
 phantomTracks.forEach((track,index)=>{
  for(let k=0;k<track.length-1;k++){
   const a=track[k],b=track[k+1],dx=b.x-a.x,dy=b.y-a.y;
   if(a.at<.45||t<a.at||b.at<t-lifetime||Math.hypot(dx,dy)<.015)continue;
   const from=Math.max(a.at,t-lifetime),to=Math.min(b.at,t);if(to<=from)continue;
   const u=clamp((from-a.at)/(b.at-a.at)),v=clamp((to-a.at)/(b.at-a.at));
   out.push({index,targetIndex:index%3,from:{x:mix(a.x,b.x,u),y:mix(a.y,b.y,u)},to:{x:mix(a.x,b.x,v),y:mix(a.y,b.y,v)},age:t-to,tailAge:t-from,lifetime});
  }
 });
 return out;
}
