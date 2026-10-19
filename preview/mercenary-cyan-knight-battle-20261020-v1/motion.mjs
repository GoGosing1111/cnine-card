import {ARRAY_DURATION,PHANTOM_COUNT,phantomTracks,phantomSample,impactEvents} from './array-motion-v4.mjs';
export {PHANTOM_COUNT,phantomTracks,phantomSample};
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
 array:{label:'천검 포위',type:'area',duration:ARRAY_DURATION,contacts:[],poses:[p(0,'dash',0),p(.12,'dash',1),p(.24,'dash',2),...sequence('array',[.35,.48,.60,.74,.90,1.30,1.70,2.10,2.60,3.05,3.50,3.93])],
  path:[path(0,'home'),path(.35,'command'),path(3.0,'command'),path(3.30,'finish'),path(3.70,'finish'),path(4.30,'home'),path(4.55,'home')]},
 zenith:{label:'창천 종단',type:'area',duration:4.0,contacts:[.72,1.48,2.65],
  poses:[p(0,'flurry',0),p(.22,'horizon',1),p(.42,'dash',2),p(.65,'horizon',3),p(.88,'horizon',4),p(1.15,'flurry',0,-1),p(1.43,'flurry',1,-1),p(1.72,'flurry',2),p(2,'array',8),p(2.28,'horizon',2),p(2.60,'flurry',3),p(2.85,'horizon',5),p(3.25,'horizon',6),p(3.75,'idle',0)],
  path:[path(0,'home'),path(.37,'home'),path(.65,'hit0'),path(.85,'hit0'),path(1.43,'hit1'),path(1.62,'hit1'),path(2.1,'command'),path(2.60,'hit2'),path(2.9,'hit2'),path(3.8,'home'),path(4,'home')]}
};
export const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
MODES.array.contacts=[...new Set(impactEvents.map(e=>Number(e.at.toFixed(6))))].sort((a,b)=>a-b);
for(const s of Object.values(MODES))s.steps=s.poses.map(p=>p.at);
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
  // Per-sword rails and corner snaps are rendered by SummonedSwordArray, not central slash stamps.
  add('burst-v3',3.60,4.13,{width:2.85,alpha:.92});
  add('ground',3.62,4.25,{width:2.75,anchor:'ground',alpha:.75});
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
 if(mode==='array')phase=t<.48?'오성 소환검 전개':t<1.58?'엇박자 출격 · 독립 타격':t<2.9?'곡선 재진입 · 사선 관통':t<3.65?'변칙 추격 · 순차 관통':'최후 일격 · 검광 소멸';
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
