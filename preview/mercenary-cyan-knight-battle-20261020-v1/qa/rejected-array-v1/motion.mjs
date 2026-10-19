// Visual choreography only. All drawings, flying swords and contacts use the V3 GSAP clock.
const p=(at,bank,index,facing=1)=>({at,bank,index,facing}),path=(at,anchor,lift=0)=>({at,anchor,lift});
const sequence=(bank,times)=>times.map((t,i)=>p(t,bank,i));
export const MODES={
 idle:{label:'대기',type:'base',duration:2.4,contacts:[],poses:sequence('idle',[0,.6,1.2,1.8]),path:[path(0,'home'),path(2.4,'home')]},
 dash:{label:'대시',type:'base',duration:1.1,contacts:[],poses:sequence('dash',[0,.16,.32,.64]),path:[path(0,'home'),path(.16,'home'),path(.56,'approach'),path(1.1,'home')]},
 hit:{label:'피격',type:'base',duration:1.2,contacts:[],poses:sequence('hit',[0,.12,.36,.7]),path:[path(0,'home'),path(1.2,'home')]},
 defeat:{label:'퇴장',type:'base',duration:1.7,contacts:[],poses:sequence('defeat',[0,.38,.82,1.25]),path:[path(0,'home'),path(1.7,'home')]},
 horizon:{label:'청광 횡단',type:'skill',duration:1.65,contacts:[.55],poses:sequence('horizon',[0,.14,.31,.50,.62,.80,1.02,1.32]),path:[path(0,'home'),path(.18,'home'),path(.50,'hit0'),path(.67,'hit0'),path(1.30,'home'),path(1.65,'home')]},
 flurry:{label:'섬광 연참',type:'skill',duration:2.6,contacts:[.46,.78,1.1,1.42,1.72],
  poses:[p(0,'flurry',0),p(.28,'flurry',0),p(.43,'flurry',1),p(.73,'flurry',2,-1),p(1.05,'flurry',3),p(1.37,'flurry',4,-1),p(1.67,'flurry',5),p(1.94,'flurry',6),p(2.24,'flurry',7)],
  path:[path(0,'home'),path(.23,'home'),path(.43,'hit0'),path(.56,'hit0'),path(.73,'hit1'),path(.87,'hit1'),path(1.05,'hit2'),path(1.19,'hit2'),path(1.37,'hit3'),path(1.51,'hit3'),path(1.67,'hit4'),path(1.81,'hit4'),path(2.35,'home'),path(2.6,'home')]},
 meteor:{label:'낙성 검격',type:'skill',duration:2.7,contacts:[1.65],poses:sequence('meteor',[0,.22,.52,.86,1.12,1.58,1.83,2.21]),
  path:[path(0,'home'),path(.22,'approach'),path(.68,'air',.5),path(1.1,'air',.68),path(1.48,'hit0',.5),path(1.65,'hit0',.28),path(1.83,'hit0'),path(2.5,'home'),path(2.7,'home')]},
 array:{label:'천검 포위',type:'area',duration:3.8,contacts:[],poses:sequence('array',[0,.18,.40,.64,.84,1.16,1.52,1.9,2.25,2.94,3.2,3.51]),
  path:[path(0,'home'),path(.35,'command'),path(2.7,'command'),path(2.94,'finish'),path(3.12,'finish'),path(3.6,'home'),path(3.8,'home')]},
 zenith:{label:'창천 종단',type:'area',duration:4.6,contacts:[.72,2.85],poses:sequence('zenith',[0,.22,.52,.84,1.14,1.48,1.93,2.40,2.78,3.0,3.48,4.05]),
  path:[path(0,'home'),path(.37,'home'),path(.67,'traverse'),path(.85,'air',.15),path(1.25,'air',.62),path(1.9,'air',.9),path(2.4,'hit1',.78),path(2.85,'hit1',.2),path(3.0,'hit1'),path(4.25,'home'),path(4.6,'home')]}
};
export const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
export const PHANTOM_COUNT=5;
export const phantomTracks=Array.from({length:PHANTOM_COUNT},(_,i)=>{
 const fan={x:(i-2)*.32,y:-.7-Math.sin(i/4*Math.PI)*.22};
 const track=[{at:.18+i*.035,...fan,angle:-Math.PI/2,alpha:0},{at:.48+i*.025,...fan,angle:-Math.PI/2,alpha:1},{at:.65+i*.025,...fan,angle:-Math.PI/2,alpha:1}];
 for(let pass=0;pass<4;pass++){
  const at=.90+i*.035+pass*.36,angle=(i*72+pass*57)*Math.PI/180;
  track.push({at,x:0,y:0,angle,alpha:1,hit:true});
  track.push({at:at+.14,x:Math.cos(angle)*.90,y:Math.sin(angle)*.59,angle,alpha:1});
 }
 track.push({at:2.36+i*.025,x:(i-2)*.3,y:-1.05,angle:Math.PI/2,alpha:1});
 track.push({at:2.64+i*.05,x:0,y:0,angle:Math.PI/2,alpha:1,hit:true});
 track.push({at:2.82+i*.025,x:(i-2)*.31,y:.44,angle:Math.PI/2,alpha:1});
 track.push({at:3.08,x:0,y:0,angle:((i/5)*Math.PI*2),alpha:1,hit:true});
 track.push({at:3.29,x:Math.cos(i/5*Math.PI*2)*.75,y:Math.sin(i/5*Math.PI*2)*.5,angle:i/5*Math.PI*2,alpha:0});
 return track;
});
MODES.array.contacts=[...new Set(phantomTracks.flatMap(s=>s.filter(p=>p.hit).map(p=>Number(p.at.toFixed(3)))))].sort((a,b)=>a-b);
for(const s of Object.values(MODES))s.steps=s.poses.map(p=>p.at);
export function phantomSample(t){
 return phantomTracks.map((track,i)=>{
  if(t<track[0].at||t>=track.at(-1).at)return null;
  const n=Math.max(0,track.findLastIndex(p=>p.at<=t)),a=track[n],b=track[Math.min(n+1,track.length-1)],q=smooth((t-a.at)/(b.at-a.at));
  let da=b.angle-a.angle;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
  return{index:i,targetIndex:i%3,x:mix(a.x,b.x,q),y:mix(a.y,b.y,q),angle:a.angle+da*q,alpha:mix(a.alpha,b.alpha,q)};
 }).filter(Boolean);
}
export function sample(mode,time){
 const s=MODES[mode],t=Math.max(0,Math.min(s.duration,time)),frame=Math.max(0,s.poses.findLastIndex(p=>p.at<=t)),pose=s.poses[frame];
 const n=Math.max(0,s.path.findLastIndex(p=>p.at<=t)),a=s.path[n],b=s.path[Math.min(n+1,s.path.length-1)],q=b.at===a.at?1:smooth((t-a.at)/(b.at-a.at));
 const effects=[],add=(key,start,end,opt={})=>{if(t<start||t>=end)return;const f=(t-start)/(end-start);effects.push({key,frame:Math.min(11,Math.floor(f*12)),alpha:1,anchor:'body',angle:0,width:1.7,...opt});};
 if(mode==='dash')add('dash',.17,.72,{anchor:'wake',width:1.9});
 if(mode==='horizon'){add('dash',.28,.6,{anchor:'wake',width:1.8,alpha:.65});add('horizon',.36,.99,{width:1.95});}
 if(mode==='flurry'){for(let i=0;i<5;i++){const hit=s.contacts[i];add(i%2?'flurry':'horizon',hit-.12,hit+.27,{width:1.8,angle:i%2?.18:-.1});}add('dash',.28,1.85,{anchor:'wake',alpha:.45,width:1.8});}
 if(mode==='meteor'){add('meteor',1.30,2.18,{width:1.2,anchor:'ground'});add('ground',1.81,2.6,{width:2.05,anchor:'ground'});add('dash',.45,1.1,{anchor:'wake',angle:-.8,width:1.35,alpha:.5});}
 if(mode==='array'){
  add('orbit',.68,2.48,{width:2.6,alpha:.9});
  for(const start of[.90,1.26,1.62,1.98])add('flurry',start-.05,start+.24,{width:1.7,alpha:.7});
  add('meteor',2.30,3.13,{width:1.7,anchor:'ground'});
  add('flurry',2.94,3.45,{width:2.45});
  add('ground',3.05,3.68,{width:2.6,anchor:'ground',alpha:.7});
 }
 if(mode==='zenith'){add('ground',.32,.98,{width:1.6,anchor:'actorGround'});add('dash',.43,1.26,{width:2.8,anchor:'wake'});add('horizon',.59,1.04,{width:2.5});add('orbit',1.20,2.45,{width:1.9,anchor:'actor',alpha:.55});add('rift',2.42,3.5,{width:3.6});add('ground',2.94,4.3,{width:3.15,anchor:'ground'});}
 const impact=s.contacts.reduce((m,at)=>Math.max(m,t>=at&&t<at+.14?(1-(t-at)/.14)*(mode==='array'&&at<3?.3:1):0),0);
 let phase=s.label;
 if(mode==='array')phase=t<.65?'다섯 검 전개':t<2.3?'교차 회전 · 연속 베기':t<2.94?'상공 재정렬 · 내려찍기':t<3.3?'다섯 검 수렴 · 마지막 검격':'회복 · 잔향';
 else if(mode==='zenith')phase=t<.43?'검압 응축':t<1.14?'고속 횡단':t<2.42?'도약 · 공중 준비':t<3?'대각 절단':'착지 · 검기 잔향';
 else if(mode==='meteor')phase=t<.5?'도약 준비':t<1.58?'공중 준비':t<1.83?'내려베기':'착지 · 회복';
 else if(s.type==='skill')phase=t<s.contacts[0]?'준비 · 접근':t<s.contacts.at(-1)+.3?'검격 · 적중':'자세 회복';
 return{mode,time:t,frame,pose,phase,effects,impact,lift:mix(a.lift,b.lift,q),path:{from:a.anchor,to:b.anchor,mix:q},done:t>=s.duration,contactCount:s.contacts.filter(at=>at<=t).length,phantoms:mode==='array'?phantomSample(t):[],ghosts:['dash','flurry','zenith'].includes(mode)&&t>.2&&t<(mode==='zenith'?3:1.9)};
}
export function bladeContact(grip,tip,torso,radius){
 const dx=tip.x-grip.x,dy=tip.y-grip.y,l=dx*dx+dy*dy,u=l?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/l):0;
 const distance=Math.hypot(grip.x+dx*u-torso.x,grip.y+dy*u-torso.y);
 return{u,distance,intersects:u>.08&&u<.95&&distance<=radius};
}
