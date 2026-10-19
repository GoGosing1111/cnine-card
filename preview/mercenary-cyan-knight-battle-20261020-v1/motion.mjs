// Preview choreography. One V3/GSAP clock drives body art, fixed swords and authored effect frames.
const p=(at,bank,index,facing=1)=>({at,bank,index,facing}),path=(at,anchor,lift=0)=>({at,anchor,lift});
const sequence=(bank,times)=>times.map((t,i)=>p(t,bank,i));
export const MODES={
 idle:{label:'대기',type:'base',duration:2.4,contacts:[],poses:sequence('idle',[0,.6,1.2,1.8]),path:[path(0,'home'),path(2.4,'home')]},
 dash:{label:'대시',type:'base',duration:1.1,contacts:[],poses:sequence('dash',[0,.16,.32,.64]),path:[path(0,'home'),path(.16,'home'),path(.56,'approach'),path(1.1,'home')]},
 hit:{label:'피격',type:'base',duration:1.2,contacts:[],poses:sequence('hit',[0,.12,.36,.7]),path:[path(0,'home'),path(1.2,'home')]},
 defeat:{label:'퇴장',type:'base',duration:1.7,contacts:[],poses:sequence('defeat',[0,.38,.82,1.25]),path:[path(0,'home'),path(1.7,'home')]},
 horizon:{label:'청광 횡단',type:'skill',duration:1.65,contacts:[.55],poses:sequence('horizon',[0,.14,.31,.50,.62,.80,1.02,1.32]),path:[path(0,'home'),path(.18,'home'),path(.50,'hit0'),path(.67,'hit0'),path(1.30,'home'),path(1.65,'home')]},
 flurry:{label:'섬광 연참',type:'skill',duration:2.6,contacts:[.46,.78,1.1,1.42,1.72],
  poses:[p(0,'flurry',0),p(.28,'flurry',2),p(.43,'flurry',1),p(.64,'flurry',0,-1),p(.73,'flurry',1,-1),p(.96,'flurry',2),p(1.05,'flurry',3),p(1.28,'flurry',0,-1),p(1.37,'flurry',3,-1),p(1.60,'flurry',2),p(1.67,'flurry',1),p(1.81,'flurry',4),p(1.94,'flurry',5),p(2.08,'flurry',6),p(2.30,'flurry',7)],
  path:[path(0,'home'),path(.23,'home'),path(.43,'hit0'),path(.56,'hit0'),path(.73,'hit1'),path(.87,'hit1'),path(1.05,'hit2'),path(1.19,'hit2'),path(1.37,'hit3'),path(1.51,'hit3'),path(1.67,'hit4'),path(1.81,'hit4'),path(2.35,'home'),path(2.6,'home')]},
 // Reuse registered grounded body drawings, never pin an airborne pose to the floor.
 meteor:{label:'용궤 검격',type:'skill',duration:2.7,contacts:[.64],
  poses:sequence('horizon',[0,.15,.29,.56,.72,1.10,1.65,2.20]),
  path:[path(0,'home'),path(.2,'home'),path(.56,'hit0'),path(.86,'hit0'),path(1.25,'finish'),path(2.4,'home'),path(2.7,'home')]},
 array:{label:'천검 포위',type:'area',duration:3.8,contacts:[],poses:[p(0,'dash',0),p(.12,'dash',1),p(.24,'dash',2),...sequence('array',[.35,.48,.60,.72,.84,1.16,1.52,1.9,2.25,2.94,3.2,3.51])],
  path:[path(0,'home'),path(.35,'command'),path(2.7,'command'),path(2.94,'finish'),path(3.12,'finish'),path(3.6,'home'),path(3.8,'home')]},
 zenith:{label:'창천 종단',type:'area',duration:4.0,contacts:[.72,1.48,2.65],
  poses:[p(0,'flurry',0),p(.22,'horizon',1),p(.42,'dash',2),p(.65,'horizon',3),p(.88,'horizon',4),p(1.15,'flurry',0,-1),p(1.43,'flurry',1,-1),p(1.72,'flurry',2),p(2,'array',8),p(2.28,'horizon',2),p(2.60,'flurry',3),p(2.85,'horizon',5),p(3.25,'horizon',6),p(3.75,'idle',0)],
  path:[path(0,'home'),path(.37,'home'),path(.65,'hit0'),path(.85,'hit0'),path(1.43,'hit1'),path(1.62,'hit1'),path(2.1,'command'),path(2.60,'hit2'),path(2.9,'hit2'),path(3.8,'home'),path(4,'home')]}
};
export const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
export const PHANTOM_COUNT=5;
export const phantomTracks=Array.from({length:PHANTOM_COUNT},(_,i)=>{
 const fan={x:(i-2)*.32,y:-.7-Math.sin(i/4*Math.PI)*.22};
 const track=[{at:.18+i*.035,...fan,angle:-Math.PI/2,alpha:0},{at:.48+i*.025,...fan,angle:-Math.PI/2,alpha:1},{at:.64+i*.018,...fan,angle:-Math.PI/2,alpha:1}];
 for(let pass=0;pass<4;pass++){
  const at=.84+i*.024+pass*.32,travel=(i*72+pass*61)*Math.PI/180,edge=travel+Math.PI/2;
  const start={x:-Math.cos(travel)*1.18,y:-Math.sin(travel)*.73,angle:edge-.65,alpha:1};
  track.push({at:at-.095,...start},{at:at-.040,...start});
  // Forty milliseconds into contact, eight milliseconds at contact, then a 39 ms cut-through.
  track.push({at,x:0,y:0,angle:edge,alpha:1,hit:true});
  track.push({at:at+.008,x:Math.cos(travel)*.045,y:Math.sin(travel)*.028,angle:edge+.12,alpha:1});
  track.push({at:at+.047,x:Math.cos(travel)*1.22,y:Math.sin(travel)*.76,angle:edge+.67,alpha:1});
 }
 const high={x:(i-2)*.30,y:-1.08,angle:Math.PI/2,alpha:1},drop=2.45+i*.052;
 track.push({at:2.08+i*.02,...high},{at:drop-.040,...high});
 track.push({at:drop,x:0,y:0,angle:Math.PI/2,alpha:1,hit:true});
 track.push({at:drop+.040,x:(i-2)*.10,y:.50,angle:Math.PI/2,alpha:1});
 const a=i/5*Math.PI*2,pre={x:-Math.cos(a)*1.2,y:-Math.sin(a)*.78,angle:a,alpha:1};
 track.push({at:2.87,...pre},{at:3.02,...pre},{at:3.06,x:0,y:0,angle:a,alpha:1,hit:true},{at:3.075,x:0,y:0,angle:a,alpha:1});
 track.push({at:3.24,x:Math.cos(a)*.9,y:Math.sin(a)*.6,angle:a,alpha:0});
 return track;
});
MODES.array.contacts=[...new Set(phantomTracks.flatMap(s=>s.filter(p=>p.hit).map(p=>Number(p.at.toFixed(3)))))].sort((a,b)=>a-b);
for(const s of Object.values(MODES))s.steps=s.poses.map(p=>p.at);
export function phantomSample(t){
 return phantomTracks.map((track,i)=>{
  if(t<track[0].at||t>=track.at(-1).at)return null;
  const n=Math.max(0,track.findLastIndex(p=>p.at<=t)),a=track[n],b=track[Math.min(n+1,track.length-1)],q=b.at===a.at?1:smooth((t-a.at)/(b.at-a.at));
  let da=b.angle-a.angle;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
  return{index:i,targetIndex:i%3,x:mix(a.x,b.x,q),y:mix(a.y,b.y,q),angle:a.angle+da*q,alpha:mix(a.alpha,b.alpha,q)};
 }).filter(Boolean);
}
export function sample(mode,time){
 const s=MODES[mode],t=Math.max(0,Math.min(s.duration,time)),frame=Math.max(0,s.poses.findLastIndex(p=>p.at<=t)),pose=s.poses[frame];
 const n=Math.max(0,s.path.findLastIndex(p=>p.at<=t)),a=s.path[n],b=s.path[Math.min(n+1,s.path.length-1)],q=b.at===a.at?1:smooth((t-a.at)/(b.at-a.at));
 const effects=[],add=(key,start,end,opt={})=>{if(t<start||t>=end)return;const f=(t-start)/(end-start),first=opt.first??0,last=opt.last??11;effects.push({key,frame:Math.min(last,Math.floor(first+f*(last-first+1))),progress:f,alpha:1,anchor:'body',angle:0,width:1.7,...opt});};
 if(mode==='dash')add('dash',.17,.72,{anchor:'wake',width:1.9});
 if(mode==='horizon'){
  add('dash',.28,.6,{anchor:'wake',width:2.15,alpha:.75});
  add('cleave-v3',.40,1.02,{width:2.65,angle:-.08});
  add('burst-v3',.53,.91,{width:1.55,alpha:.90});
  add('ground',.55,1.10,{width:2.15,anchor:'ground',alpha:.85});
 }
 if(mode==='flurry'){
  for(let i=0;i<5;i++){const hit=s.contacts[i];add('cleave-v3',hit-.075,hit+.24,{width:i===4?2.8:2.35,angle:i%2?.55:-.45,flip:i%2?-1:1});add('burst-v3',hit-.012,hit+.16,{width:i===4?2.45:1.5,alpha:.90});}
  add('dash',.28,1.85,{anchor:'wake',alpha:.65,width:2.1});
 }
 if(mode==='meteor'){
  add('dragon-v3',.43,1.80,{width:3.05,anchor:'ground',fromX:-.85,toX:.35});
  add('cleave-v3',.56,.94,{width:2.4,angle:-.2});
  add('burst-v3',.63,.98,{width:1.75,alpha:.90});
  add('ground',.65,2.0,{width:2.75,anchor:'ground',alpha:.80});
 }
 if(mode==='array'){
  for(let pass=0;pass<4;pass++){
   add('cleave-v3',.76+pass*.32,1.10+pass*.32,{width:2.8,angle:pass*.72,alpha:.92});
   for(let i=0;i<5;i++){
    const at=.84+i*.024+pass*.32;
    add('burst-v3',at-.008,at+.14,{width:1.65,angle:(i*72+pass*61)*Math.PI/180,alpha:.78});
   }
  }
  for(let i=0;i<5;i++){const at=2.45+i*.052;add('cleave-v3',at-.035,at+.20,{width:2.55,angle:Math.PI/2+(i-2)*.11,alpha:.82});add('burst-v3',at,at+.18,{width:1.85,alpha:.85});}
  add('cleave-v3',3.00,3.40,{width:3.9,angle:-.22});
  add('burst-v3',3.035,3.69,{width:4.25,alpha:1});
  add('ground',3.06,3.75,{width:3.3,anchor:'ground',alpha:.95});
 }
 if(mode==='zenith'){
  add('orbit',.12,.67,{width:1.55,anchor:'actor',alpha:.65});
  add('dash',.43,.91,{width:2.8,anchor:'wake'});
  add('cleave-v3',.60,1.11,{width:2.95,angle:-.2});
  add('burst-v3',.71,1.05,{width:1.9,alpha:.95});
  add('cleave-v3',1.36,1.91,{width:3.10,angle:.52,flip:-1});
  add('burst-v3',1.47,1.82,{width:2.0,alpha:.95});
  add('dragon-v3',2.02,3.48,{width:3.9,anchor:'ground',fromX:-.9,toX:.40});
  add('cleave-v3',2.56,3.10,{width:3.8,angle:-.2});
  add('burst-v3',2.63,3.42,{width:3.9,alpha:.95});
  add('ground',2.65,3.75,{width:3.5,anchor:'ground',alpha:.95});
 }
 const impact=s.contacts.reduce((m,at)=>Math.max(m,t>=at&&t<at+.16?(1-(t-at)/.16)*(mode==='array'&&at<3?.38:1):0),0);
 let phase=s.label;
 if(mode==='array')phase=t<.70?'다섯 검 전개':t<2.04?'고속 관통 · 교차 연격':t<2.84?'회수 · 연속 관통':t<3.30?'다섯 검 수렴 · 검광 폭쇄':'회복 · 잔향';
 else if(mode==='zenith')phase=t<.43?'검압 응축':t<1.9?'지상 교차 검격':t<2.6?'용 형상 검기 전개':t<3.1?'지면 횡단 · 종단 폭쇄':'검기 소멸 · 회복';
 else if(mode==='meteor')phase=t<.43?'지상 발도 준비':t<.8?'용궤 형성 · 횡베기':t<1.8?'지면을 휘감는 용 검기':'검기 잔향 · 회복';
 else if(s.type==='skill')phase=t<s.contacts[0]?'준비 · 접근':t<s.contacts.at(-1)+.3?'검격 · 적중':'자세 회복';
 return{mode,time:t,frame,pose,phase,effects,impact,lift:mix(a.lift,b.lift,q),path:{from:a.anchor,to:b.anchor,mix:q},done:t>=s.duration,contactCount:s.contacts.filter(at=>at<=t).length,phantoms:mode==='array'?phantomSample(t):[],ghosts:['dash','flurry','zenith'].includes(mode)&&t>.2&&t<(mode==='zenith'?3:1.9)};
}
export function bladeContact(grip,tip,torso,radius){
 const dx=tip.x-grip.x,dy=tip.y-grip.y,l=dx*dx+dy*dy,u=l?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/l):0;
 const distance=Math.hypot(grip.x+dx*u-torso.x,grip.y+dy*u-torso.y);
 return{u,distance,intersects:u>.08&&u<.95&&distance<=radius};
}
