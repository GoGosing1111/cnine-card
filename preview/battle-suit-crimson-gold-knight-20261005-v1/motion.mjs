// All visual animation samples share the registered V3 GSAP clock.
const pose=(at,bank,index,facing=1)=>({at,bank,index,facing});
const path=(at,anchor,lift=0)=>({at,anchor,lift});
export const MODES={
 look:{label:'외형 · 오라',duration:2.4,contacts:[],poses:[pose(0,'idle',0)],path:[path(0,'home')]},
 idle:{label:'대기',duration:2.4,contacts:[],poses:[pose(0,'idle',0)],path:[path(0,'home')]},
 dash:{label:'흑금 돌진',duration:1.25,contacts:[],poses:[pose(0,'dash',0),pose(.12,'dash',1),pose(.22,'dash',2),pose(.31,'dash',3),pose(.41,'dash',4),pose(.56,'dash',5),pose(.74,'dash',6),pose(.96,'dash',7)],path:[path(0,'home'),path(.2,'home'),path(.62,'strike'),path(1.25,'strike')]},
 attack:{label:'단죄',duration:1.5,contacts:[.41],poses:[pose(0,'attack',0),pose(.15,'attack',1),pose(.29,'attack',2),pose(.38,'attack',3),pose(.52,'attack',4),pose(.7,'attack',5),pose(.93,'attack',6),pose(1.2,'attack',7)],path:[path(0,'home'),path(.14,'home'),path(.38,'strike'),path(1.5,'strike')]},
 combo:{label:'왕의 삼연참',duration:2.85,contacts:[.46,1.05,1.72],poses:[pose(0,'attack',0),pose(.18,'dash',2),pose(.3,'attack',2),pose(.43,'attack',3),pose(.6,'attack',4),pose(.76,'combo',0),pose(1.01,'combo',1),pose(1.18,'combo',2),pose(1.39,'combo',3),pose(1.53,'combo',4),pose(1.69,'combo',5),pose(1.89,'combo',6),pose(2.13,'combo',7),pose(2.48,'attack',7)],path:[path(0,'home'),path(.15,'home'),path(.42,'strike'),path(.65,'strike'),path(.98,'rise'),path(1.26,'rise'),path(1.66,'reverse'),path(2.85,'reverse')]},
 skill:{label:'왕관의 처형',duration:4.9,contacts:[.8,1.25,1.76,3.32],poses:[pose(0,'skill',0),pose(.32,'dash',0),pose(.49,'dash',1),pose(.59,'dash',2),pose(.68,'attack',2),pose(.77,'attack',3),pose(.92,'attack',4),pose(1.06,'combo',0),pose(1.21,'combo',1),pose(1.42,'combo',2),pose(1.58,'combo',4),pose(1.72,'combo',5),pose(1.94,'skill',0),pose(2.18,'skill',1),pose(2.43,'skill',2),pose(2.72,'skill',3),pose(3.03,'skill',4),pose(3.28,'skill',5),pose(3.68,'skill',6),pose(4.18,'skill',7)],path:[path(0,'home'),path(.46,'home'),path(.77,'strike'),path(.93,'strike'),path(1.2,'rise'),path(1.43,'rise'),path(1.69,'reverse'),path(2.16,'reverse'),path(2.73,'air',.62),path(2.98,'air',.62),path(3.28,'finish'),path(4.9,'finish')]},
 aoe:{label:'백호멸진',duration:5.35,contacts:[2.27,2.34,2.41,2.48,2.55],poses:[pose(0,'aoe',0),pose(.36,'aoe',1),pose(.82,'aoe',2),pose(1.22,'aoe',3),pose(1.52,'aoe',4),pose(1.92,'aoe',5),pose(3.65,'aoe',6),pose(4.52,'aoe',7)],path:[path(0,'home'),path(.3,'home'),path(.85,'caster'),path(5.35,'caster')]}
};
for(const s of Object.values(MODES)){s.steps=s.poses.map(p=>p.at);s.contact=s.contacts.at(-1)??null;}
export const clamp=n=>Math.max(0,Math.min(1,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
export function sample(mode,time){
 const s=MODES[mode],t=Math.max(0,Math.min(s.duration,time)),frame=s.poses.findLastIndex(p=>p.at<=t),p=s.poses[frame];
 const n=Math.max(0,s.path.findLastIndex(p=>p.at<=t)),a=s.path[n],b=s.path[Math.min(n+1,s.path.length-1)],q=b.at===a.at?1:smooth((t-a.at)/(b.at-a.at));
 const effects=[];
 const add=(key,start,end,opt={})=>{if(t<start||t>=end)return;const q=(t-start)/(end-start);effects.push({key,frame:Math.min(11,Math.floor(q*12)),q,alpha:1,anchor:'target',width:1.8,angle:0,...opt});};
 const cut=(at,angle=0)=>{add('slash',at-.17,at+.4,{angle,width:1.7});add('impact',at-.01,at+.48,{width:.83});};
 if(mode==='dash')add('dash',.20,.99,{anchor:'wake',width:2.1,alpha:.85});
 if(mode==='attack'){add('dash',.19,.48,{anchor:'wake',width:1.65,alpha:.48});cut(.41);}
 if(mode==='combo'){add('dash',.18,.53,{anchor:'wake',width:1.75,alpha:.65});cut(.46);cut(1.05,-.65);cut(1.72,.18);}
 if(mode==='skill'){
  add('charge',.04,.59,{anchor:'casterBody',width:1.65,back:true,alpha:.8});
  add('dash',.49,.95,{anchor:'wake',width:2.05,alpha:.82});
  cut(.8);cut(1.25,-.7);cut(1.76,.12);
  add('charge',1.94,3.21,{anchor:'casterBody',width:2.1,back:true});
  add('dash',2.4,3.1,{anchor:'wake',width:1.5,angle:-1.1,alpha:.55});
  add('cleave',3.1,4.24,{anchor:'ground',width:2.3});
  add('eruption',3.19,4.63,{anchor:'ground',width:2.7,alpha:.95});
  add('ring',3.28,4.77,{anchor:'ground',width:3.4,back:true});
  add('impact',3.31,3.95,{width:1.18});
 }
 if(mode==='aoe'){
  add('charge',.12,.98,{anchor:'casterBody',width:1.5,back:true,alpha:.65});
  add('tiger-charge',.36,1.68,{anchor:'tigerGather',width:2.3,back:true});
  add('ring',1.23,2.15,{anchor:'casterGround',width:1.55,back:true,alpha:.65});
  add('tiger-rush',1.41,3.04,{anchor:'tigerRush',width:3.8});
  add('tiger-impact',2.14,3.95,{anchor:'armyGround',width:3.8});
  add('tiger-ring',2.26,4.94,{anchor:'armyGround',width:5.3,back:true});
  s.contacts.forEach((at,i)=>add('impact',at-.02,at+.57,{anchor:'enemyBody',target:i,width:.78,alpha:.8}));
 }
 const impact=s.contacts.reduce((n,at,i)=>Math.max(n,t>=at&&t<at+.24?(1-(t-at)/.24)*(mode==='skill'&&i===3?1:mode==='aoe'?.6:.35):0),0);
 let phase=mode==='look'?'전신 오라 · 외형 검수':mode==='idle'?'정지 자세 · 대기':mode==='dash'?(t<.22?'발진 준비':t<.56?'흑금 돌진':t<.96?'제동 · 착지':'자세 회복'):
 mode==='attack'?(t<.38?'어깨 감기 · 접근':t<.53?'대검 횡베기':t<.94?'검 회수':'자세 회복'):
 mode==='combo'?(t<.43?'접근':t<.77?'첫 베기':t<1.39?'올려베기':t<2.13?'역방향 마무리':'자세 회복'):
 mode==='skill'?(t<.49?'흑금 응축':t<1.94?'삼연참':t<2.43?'왕관 각성':t<3.03?'도약 · 대검 들기':t<3.28?'내려베기':t<3.68?'처형 · 타격 정지':t<4.18?'지면 파열':'검 회수'):
 t<.82?'백호 검기 응축':t<1.41?'대검 강하 · 기운 개방':t<2.27?'백호 검기 · 전장 돌파':t<3.3?'백호멸진 · 광역 강타':t<4.52?'검흔 · 충격파 잔향':'자세 회복';
 return{mode,time:t,frame,pose:p,phase,effects,impact,lift:mix(a.lift,b.lift,q),path:{from:a.anchor,to:b.anchor,mix:q},done:t>=s.duration,contactCount:s.contacts.filter(v=>v<=t).length,ghosts:(mode==='dash'&&t>.25&&t<.65)||(mode==='combo'&&t>.27&&t<1.91)||(mode==='skill'&&t>.6&&t<3.36),buried:mode==='aoe'&&t>=1.22&&t<4.52};
}
export function bladeContact(grip,tip,torso,radius){
 const dx=tip.x-grip.x,dy=tip.y-grip.y,len2=dx*dx+dy*dy,u=len2?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/len2):0;
 const nearest={x:grip.x+dx*u,y:grip.y+dy*u},distance=Math.hypot(nearest.x-torso.x,nearest.y-torso.y);
 return{u,distance,intersects:u>.12&&u<.94&&distance<=radius,tipDistance:Math.hypot(tip.x-torso.x,tip.y-torso.y)};
}
