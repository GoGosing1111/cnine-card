import {skills,authoredById} from './effects/skills.mjs';
import {toSource} from './timing.mjs';
import {clamp,smooth} from './effects/paint.mjs';

// Each curve points to intact Ludo cels. A release at 0.58 is synchronized to the skill clock.
const motion={
 drive:['combo',[[0,0],[.16,1],[.39,3],[.50,4],[.58,5],[.79,7],[1,10]]],
 draw:['combo',[[0,12],[.23,14],[.43,16],[.58,17],[.77,19],[1,22]]],
 send:['combo',[[0,23],[.20,24],[.42,26],[.58,28],[.72,29],[1,32]]],
 twin:['combo',[[0,30],[.25,32],[.43,33],[.58,35],[.76,38],[1,42]]],
 seal:['combo',[[0,42],[.35,45],[.58,47],[.85,52],[1,58]]],
 cast:['v2',[[0,0],[.25,4],[.44,7],[.58,10],[.81,12],[1,15]]],
 spin:['v2',[[0,13],[.23,16],[.49,19],[.58,21],[.77,25],[1,30]]],
 fall:['v2',[[0,29],[.20,31],[.36,33],[.43,34],[.51,37],[.58,41],[.76,42],[1,44]]],
 reach:['v2',[[0,12],[.29,16],[.45,17],[.58,18],[.83,19],[1,20]]]
};
const event=(at,kind,life)=>({at,kind,life,start:at-.58*life});
const fromHits=(times,types,life)=>times.map((at,i)=>event(at,types[i%types.length],life));
const charts={
 cleave:{actions:[event(.36,'fall',.57)],path:[[0,.40],[.16,.43],[.36,.79],[.99,.79]]},
 cyclone:{actions:fromHits([.35,.695,1.04,1.385,1.73,2.075],['drive','draw','spin','send','draw','twin'],.49),path:[[0,.22],[.35,.68],[.71,.70],[1.03,.79],[1.38,.58],[1.73,.71],[2.10,.76]]},
 rush:{actions:fromHits([.39,1.00,1.61,2.22,2.83,3.44],['drive','reach','drive','reach','drive','spin'],.58),path:[[0,.02],[.17,.06],[.40,1.18],[.77,1.22],[1.01,.37],[1.36,.32],[1.62,1.15],[1.99,1.19],[2.22,.32],[2.61,.29],[2.83,1.18],[3.14,1.20],[3.46,.63]],turns:[[.54,.95],[1.78,2.15],[2.99,3.37]]},
 cross:{actions:[event(.37,'draw',.61),event(.82,'send',.56),event(1.25,'spin',.55),event(1.54,'draw',.39),event(1.78,'twin',.34)],path:[[0,.18],[.38,.65],[.81,.69],[1.25,.78],[1.54,.71],[1.78,.82]]},
 orbit:{actions:[event(.52,'draw',.68),event(1.22,'cast',.72),event(1.80,'seal',.74),event(2.48,'send',.69)],path:[[0,.08],[.53,.48],[.92,.46],[1.25,.36],[2.13,.36],[2.50,.53]]},
 wave:{actions:fromHits([.32,.69,1.06,1.43,1.98],['draw','send','draw','send','twin'],.51),path:[[0,.02],[.32,.21],[.69,.24],[1.08,.30],[1.44,.35],[1.99,.43]]},
 wings:{actions:[event(.64,'cast',.93),event(1.46,'draw',.83),event(2.55,'cast',1.03),event(3.04,'send',.70),event(3.62,'seal',.85),event(4.3,'send',.64),event(4.90,'cast',.62),event(5.40,'spin',.70)],path:[[0,.03],[1.46,.12],[2.35,.11],[4.29,.12],[4.91,.24],[5.40,.64]]},
 rain:{actions:[event(.59,'draw',.76),event(1.18,'cast',.88),event(1.96,'seal',1.13),event(2.65,'send',.63),event(3.08,'cast',.62),event(3.67,'send',.63)],path:[[0,.07],[.60,.36],[1.17,.25],[2.68,.25],[3.10,.34],[3.68,.46]]},
 prison:{actions:[event(.68,'cast',1.0),event(1.28,'draw',.65),event(1.96,'send',.72),event(2.64,'seal',.83),event(3.13,'twin',.65)],path:[[0,.07],[.68,.17],[1.28,.27],[2.64,.29],[3.14,.50]]},
 pursuit:{actions:fromHits([.36,.96,1.43,2.06,2.56,3.20,3.75,4.23,4.90,5.47,6.15,6.83,7.59],['drive','draw','send','spin','reach','draw','send','twin','drive','draw','spin','send','twin'],.67),
 path:[[0,.02],[.37,.83],[.97,.65],[1.43,.83],[2.06,.68],[2.56,1.12],[2.84,1.12],[3.20,.60],[3.75,.72],[4.23,.86],[4.9,.68],[5.46,.79],[6.15,.61],[6.82,.70],[7.59,.83]],turns:[[2.68,3.04]]},
 horizon:{actions:[event(.68,'cast',.90),event(1.37,'send',.86),event(2.15,'twin',.89),event(3.07,'drive',.52),event(3.36,'send',.35),event(3.58,'draw',.34),event(4.02,'cast',.67),event(5.03,'spin',.88),event(5.26,'fall',.34)],path:[[0,.02],[.68,.10],[1.37,.19],[2.15,.36],[3.08,.66],[3.36,.72],[3.60,.77],[4.02,.49],[4.68,.47],[5.06,.66],[5.27,.92]]}
};
function curve(points,t,interpolate){
 if(t<=points[0][0])return points[0][1];
 for(let i=1;i<points.length;i++){const [x,y]=points[i];if(t<=x){const [last,value]=points[i-1];return value+(y-value)*interpolate((t-last)/(x-last));}}
 return points.at(-1)[1];
}
const straight=x=>x;
const home=.51;
const seq=(bank,...cels)=>cels.map(cel=>({bank,cel}));
const neutral={bank:'v2',cel:0};
// Use a single registered upright guard wherever the caller can join two actions.
const windups={
 drive:[neutral,...seq('guard',9,8,7,6,5,4,3,2,0),...seq('combo',1,2,3,4,5)],
 draw:[neutral,...seq('high',13,11,10,9,8,7,6,5,4),...seq('combo',14,15,16,17)],
 cast:[neutral,...seq('v2',3,4,5,6,7,8,9,10)],
 fall:[neutral,...seq('high',12,9,6,4),...seq('v2',31,32,33,34,35,36,37,38,39,40,41)]
};
const highReturn=seq('high',4,5,6,7,8,9,10,11,12,13,15);
const lowReturn=seq('guard',1,2,3,4,5,6,7,8,9,10);
const recoveries={
 fall:[...seq('v2',42,43,44),...seq('plant-mirror',0,1,2,3,4,5,6,7,8,9,10,11,12,13),...lowReturn,neutral],
 send:[...seq('thrust',0,1,2,3,4,5,6,7,8),...lowReturn,neutral],
 twin:[...seq('high',0,2),...highReturn,neutral],
 spin:[...seq('v2',29,30,31,32,33),...seq('high',3),...highReturn,neutral]
};
function sample(track,progress){return track[Math.round(clamp(progress)*(track.length-1))];}
const mix=(a,b,u)=>a+(b-a)*u;
export function skillPose(id,seconds){
 const chart=charts[id];if(!chart)return null;
 const length=authoredById[id].seconds,t=Math.max(0,Math.min(length,toSource(seconds)));
 const first=chart.actions[0],last=chart.actions.at(-1);
 const firstReach=chart.path[0][1],near=Math.max(.72,curve(chart.path,first.at,smooth));
 // Keep the shared starting foot planted during a charge. Preserve contact positions on lunges.
 const onField=value=>value>=near?value:home+(value-firstReach)*(near-home)/(near-firstReach);
 const reach=onField(curve(chart.path,t,smooth));
 const returnStart=last.at+last.life*({fall:.16,spin:.34,send:.42,twin:.42}[last.kind]);
 if(t>=returnStart){
  const u=clamp((t-returnStart)/(length-returnStart)),track=recoveries[last.kind],returnIndex=Math.round(u*(track.length-1)),pose=track[returnIndex];
  const step=smooth((u-.10)/.80),endReach=onField(curve(chart.path,returnStart,smooth));
  return {...pose,kind:'return',progress:u,returnIndex,returnCount:track.length,reach:mix(endReach,home,step),landWeight:last.kind==='fall'?1-step:0,
   reverse:last.kind==='fall'&&pose.bank==='v2'&&pose.cel>=35};
 }
 if(t<first.at-1e-7){
  const u=t/first.at,pose=sample(windups[first.kind],u);
  if(first.kind==='fall'&&pose.bank==='v2'&&pose.cel>=31){
   const progress=clamp((t-first.start)/first.life);
   return {...pose,kind:'fall',progress,reach,reverse:true,landWeight:smooth((progress-.25)/.33)};
  }
  return {...pose,kind:'windup',progress:u,reach,reverse:false,landWeight:0};
 }
 let active=first;
 for(const action of chart.actions){
  if(t<action.start||t<=active.at+1e-7)break;
  active=action;
 }
 const progress=clamp((t-active.start)/active.life),[bank,steps]=motion[active.kind];
 const reverse=active.kind==='fall'||(chart.turns||[]).some(([a,b])=>t>=a&&t<b);
 return {bank,cel:Math.round(curve(steps,progress,straight)),kind:active.kind,progress,reach,reverse,
  landWeight:active.kind==='fall'?smooth((progress-.25)/.33):0};
}
export const skillList=skills.map(({id,title,seconds,contacts})=>({id,title,seconds,contacts}));
let cursor=0;
export const skillSequence=skillList.map(skill=>{
 const start=cursor;cursor=Number((start+skill.seconds).toFixed(9));return {...skill,start,end:cursor};
});
export const chainDuration=cursor;
export function skillSequenceAt(t){
 if(!Number.isFinite(t)||t<0||t>=chainDuration)return null;
 const slot=skillSequence.find(s=>t<s.end);
 return {id:slot.id,seconds:Math.max(0,t-slot.start),title:slot.title};
}
