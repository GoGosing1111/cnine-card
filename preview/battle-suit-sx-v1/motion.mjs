// One authored V3 clock drives body drawings, all movement, afterimages and independent VFX.
const pose=(at,bank,index,facing=1)=>({at,bank,index,facing}),path=(at,anchor,lift=0)=>({at,anchor,lift});
export const MODES={
 idle:{label:'푸른 사신 · 대기',duration:4.8,contacts:[],loop:true,poses:[pose(0,'dash',0)],path:[path(0,'home'),path(4.8,'home')]},
 dash:{label:'잔영 대시',duration:1.75,contacts:[],poses:[pose(0,'dash',0),pose(.12,'dash',1),pose(.21,'dash',2),pose(.29,'dash',3),pose(.37,'dash',4),pose(.47,'dash',5),pose(.56,'dash',6),pose(.72,'dash',7),pose(.93,'dash',1,-1),pose(1.04,'dash',3,-1),pose(1.2,'dash',5,-1),pose(1.34,'dash',6,-1),pose(1.48,'dash',7)],path:[path(0,'home'),path(.18,'home'),path(.53,'left'),path(.95,'left'),path(1.34,'home'),path(1.75,'home')]},
 attack:{label:'청령 일섬',duration:1.6,contacts:[.43],poses:[pose(0,'attack',0),pose(.16,'attack',1),pose(.28,'attack',2),pose(.34,'attack',3),pose(.38,'attack',4),pose(.50,'attack',4),pose(.62,'attack',5),pose(.76,'attack',6),pose(.94,'attack',7),pose(1.06,'dash',2,-1),pose(1.21,'dash',5,-1),pose(1.38,'dash',7)],path:[path(0,'home'),path(.13,'home'),path(.38,'left'),path(.74,'left'),path(1.02,'left'),path(1.37,'home'),path(1.6,'home')]},
 skill:{label:'청령 검무',duration:3.9,contacts:[.43,.72,1.01,1.30,1.58,2.39],poses:[pose(0,'skill',0),pose(.12,'dash',1),pose(.20,'dash',3),pose(.33,'attack',2),pose(.39,'attack',4),pose(.49,'attack',4),pose(.54,'dash',3),pose(.64,'attack',2,-1),pose(.68,'attack',4,-1),pose(.79,'attack',4,-1),pose(.84,'dash',3,-1),pose(.94,'attack',2),pose(.97,'attack',4),pose(1.08,'attack',4),pose(1.14,'dash',3),pose(1.23,'attack',2,-1),pose(1.26,'attack',4,-1),pose(1.37,'attack',4,-1),pose(1.46,'skill',1),pose(1.65,'skill',2),pose(1.82,'skill',3),pose(1.99,'skill',4),pose(2.19,'skill',5),pose(2.34,'skill',6),pose(2.60,'skill',7),pose(3.05,'dash',2,-1),pose(3.34,'dash',5,-1),pose(3.60,'dash',7)],path:[path(0,'home'),path(.17,'home'),path(.39,'left'),path(.49,'left'),path(.68,'right'),path(.79,'right'),path(.97,'left'),path(1.08,'left'),path(1.26,'right'),path(1.37,'right'),path(1.50,'rise'),path(1.68,'rise'),path(1.97,'air',.53),path(2.14,'air',.53),path(2.39,'finish'),path(3.04,'finish'),path(3.60,'home'),path(3.9,'home')]},
 ultimate:{label:'궁극기 · 창천사신검',duration:5.7,contacts:[.94,1.23,1.52,1.81,3.53],poses:[pose(0,'ultimate',0),pose(.33,'ultimate',1),pose(.64,'dash',1),pose(.77,'dash',3),pose(.88,'attack',2),pose(.90,'attack',4),pose(1.01,'attack',4),pose(1.07,'dash',3),pose(1.19,'attack',4,-1),pose(1.30,'attack',4,-1),pose(1.36,'dash',3,-1),pose(1.48,'attack',4),pose(1.59,'attack',4),pose(1.65,'dash',3),pose(1.77,'attack',4,-1),pose(1.88,'attack',4,-1),pose(2.02,'ultimate',0),pose(2.21,'ultimate',1),pose(2.42,'ultimate',2),pose(2.62,'ultimate',3),pose(2.89,'ultimate',4),pose(3.29,'ultimate',5),pose(3.48,'ultimate',6),pose(3.89,'ultimate',7),pose(4.65,'dash',2,-1),pose(4.94,'dash',5,-1),pose(5.27,'dash',7)],path:[path(0,'home'),path(.72,'home'),path(.90,'left'),path(1.01,'left'),path(1.19,'right'),path(1.30,'right'),path(1.48,'left'),path(1.59,'left'),path(1.77,'right'),path(1.88,'right'),path(2.10,'charge'),path(2.46,'charge'),path(2.89,'air',.92),path(3.19,'air',.92),path(3.53,'ultimateFinish'),path(4.64,'ultimateFinish'),path(5.27,'home'),path(5.7,'home')]}
};
for(const m of Object.values(MODES))m.steps=m.poses.map(p=>p.at);
export const clamp=n=>Math.max(0,Math.min(1,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
export function sample(mode,time){
 const s=MODES[mode],t=Math.max(0,Math.min(s.duration,time)),frame=s.poses.findLastIndex(p=>p.at<=t),p=s.poses[frame];
 const n=Math.max(0,s.path.findLastIndex(p=>p.at<=t)),a=s.path[n],b=s.path[Math.min(n+1,s.path.length-1)],q=b.at===a.at?1:smooth((t-a.at)/(b.at-a.at));
 const effects=[],add=(key,start,end,opt={})=>{if(t<start||t>=end)return;const v=(t-start)/(end-start);effects.push({key,frame:Math.min(11,Math.floor(v*12)),alpha:1,anchor:'target',angle:0,width:1.7,...opt});};
 // Every travel segment, including return, has an authored air wake on the same clock.
 for(let i=1;i<s.path.length;i++){const from=s.path[i-1],to=s.path[i];if(from.anchor===to.anchor&&from.lift===to.lift)continue;const end=to.at+.16;add('dash',from.at,end,{anchor:'wake',width:1.75,alpha:.48*Math.min(1,(end-t)/.16),travelFrom:from.at});}
 if(mode==='attack')add('cut',.30,.78,{width:1.8,angle:.05});
 if(mode==='skill'){
  for(const [i,hit]of s.contacts.entries()){if(i>=4)continue;add(i%2?'cross':'cut',hit-.13,hit+.25,{width:1.65+i*.08,angle:i%2?-.12:.12});}
  add('cut',1.43,1.99,{width:2.0,angle:-1.1});add('execution',2.22,3.03,{anchor:'ground',width:2.35,alpha:.82});add('ground',2.36,3.44,{anchor:'ground',width:2.1});
 }
 if(mode==='ultimate'){
  add('bladestorm',.10,2.34,{width:3.05,alpha:.64});
  for(const [i,hit]of s.contacts.entries()){if(i===4)continue;add(i%2?'cross':'cut',hit-.13,hit+.24,{width:1.85+i*.09,angle:i%2?-.14:.14});}
  add('bladestorm',2.17,3.95,{width:3.1,alpha:.83});add('execution',3.28,4.49,{anchor:'ground',width:3.0,alpha:.94});add('ground',3.50,4.98,{anchor:'ground',width:2.55});add('cross',3.44,4.13,{width:2.4,alpha:.75});
 }
 const impact=s.contacts.reduce((v,at,i)=>Math.max(v,t>=at&&t<at+.17?(1-(t-at)/.17)*(i===s.contacts.length-1&&(mode==='skill'||mode==='ultimate')?1:.36):0),0);
 const phase=mode==='idle'?'푸른 사신 · 영혼의 오라':mode==='dash'?(t<.18?'발진 준비':t<.55?'잔영 돌진':t<.93?'제동 · 착지':t<1.38?'잔영 복귀':'자세 회복'):mode==='attack'?(t<.38?'검격 준비':t<.65?'횡베기':t<1.02?'후속 동작':t<1.37?'잔영 복귀':'자세 회복'):mode==='skill'?(t<.33?'발진':t<1.46?'교차 돌진 · 연속 검격':t<1.82?'올려베기':t<2.20?'도약 · 검압 응축':t<2.61?'낙하 검격':t<3.05?'지면 파열 · 잔향':t<3.60?'잔영 복귀':'자세 회복'):(t<.72?'검영 전개':t<2.02?'사방 검무':t<2.62?'양손 검압 응축':t<3.29?'도약 · 창천검':t<3.90?'사신의 일격':t<4.65?'검압 파열 · 잔향':t<5.27?'잔영 복귀':'자세 회복');
 return{mode,time:t,frame,pose:p,phase,effects,impact,lift:mix(a.lift,b.lift,q),path:{from:a.anchor,to:b.anchor,mix:q},done:!s.loop&&t>=s.duration,contactCount:s.contacts.filter(at=>at<=t).length};
}
export function bladeContact(grip,tip,torso,radius){const dx=tip.x-grip.x,dy=tip.y-grip.y,l=dx*dx+dy*dy,u=l?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/l):0,distance=Math.hypot(grip.x+dx*u-torso.x,grip.y+dy*u-torso.y);return{u,distance,intersects:u>.10&&u<.95&&distance<=radius};}
