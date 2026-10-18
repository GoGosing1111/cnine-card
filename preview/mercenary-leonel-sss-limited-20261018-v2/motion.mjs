// One registered GSAP clock. Body attack beats run at 2x; drawn FX retain 1x duration.
export const PLAYBACK_RATES=Object.freeze({attackMotion:2,skillEffect:1,idleMotion:1,dashMotion:1});
const pose=(at,bank,index,facing=1)=>({at,bank,index,facing});
const path=(at,anchor,lift=0)=>({at,anchor,lift});
const authored={
 idle:{label:'검의 경지',duration:4,contacts:[],poses:[0,1,2,3].map((at,i)=>pose(at,'idle',i)),path:[path(0,'home'),path(4,'home')]},
 attack:{label:'백은일섬',duration:1.1,contacts:[.42],poses:[0,.12,.23,.37,.48,.59,.73,.91].map((at,i)=>pose(at,'attack',i)),path:[path(0,'home'),path(.13,'home'),path(.37,'left'),path(.62,'left'),path(1.1,'home')]},
 dash:{label:'섬보',duration:1.25,contacts:[],poses:[0,.12,.22,.31,.43,.57,.78,1.04].map((at,i)=>pose(at,'dash',i)),path:[path(0,'home'),path(.22,'home'),path(.58,'right'),path(.85,'right'),path(1.25,'home')]},
 skill:{label:'절명삼연',duration:2.3,contacts:[.48,.94,1.46],poses:[0,.40,.75,1.02,1.12,1.4,1.73,2.05].map((at,i)=>pose(at,'skill',i)),path:[path(0,'home'),path(.2,'home'),path(.4,'left'),path(.62,'left'),path(.85,'second'),path(1.1,'second'),path(1.4,'third'),path(1.74,'third'),path(2.3,'home')]},
 ultimate:{label:'검극 · 전선 단절',duration:3.5,contacts:[1.38],poses:[0,.3,.55,.8,1.1,1.35,1.6,1.95,2.3,2.65,3.05,3.45].map((at,i)=>pose(at,'ultimate',i)),path:[path(0,'home'),path(.55,'home'),path(1.35,'left'),path(1.8,'left'),path(2.9,'left'),path(3.5,'home')]}
};
export const MODES=Object.fromEntries(Object.entries(authored).map(([name,m])=>{
 const rate=['attack','skill','ultimate'].includes(name)?2:1,intro=name==='ultimate'?1.1:0;
 const duration={idle:4,attack:.7,dash:1.25,skill:1.55,ultimate:4.25}[name];
 const physicalContacts=m.contacts.map(t=>intro+t/rate),pressureContacts=name==='ultimate'?[2.29]:[];
 const poses=m.poses.map(p=>({...p,at:intro+p.at/rate}));
 if(intro)poses[0].at=0;
 return[name,{...m,authoredDuration:m.duration,rate,intro,duration,physicalContacts,pressureContacts,contacts:[...physicalContacts,...pressureContacts],poses,steps:poses.map(p=>p.at)}];
}));
export const LINES={idle:'검을 들었다면, 끝까지 버텨라.',attack:'늦었다.',dash:'놓쳤군.',skill:'막을 수 있겠나.',ultimate:'이 검격으로, 전부 끝낸다.',victory:'힘의 차이를 기억해라.'};
export const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
export function sample(mode,time){
 const m=MODES[mode],a=authored[mode],t=clamp(time,0,m.duration),bodyTime=clamp((t-m.intro)*m.rate,0,a.duration);
 const frame=Math.max(0,a.poses.findLastIndex(p=>p.at<=bodyTime)),p=a.poses[frame];
 const i=Math.max(0,a.path.findLastIndex(p=>p.at<=bodyTime)),from=a.path[i],to=a.path[Math.min(i+1,a.path.length-1)],q=to.at===from.at?1:smooth((bodyTime-from.at)/(to.at-from.at));
 const effects=[];
 const fx=(key,start,duration,options={})=>{if(t<start||t>=start+duration)return;effects.push({key,progress:(t-start)/duration,duration,alpha:1,anchor:'target',angle:0,width:1.65,...options});};
 if(mode==='dash')fx('dash',.18,.72,{anchor:'wake',width:2.4,alpha:.8});
 if(mode==='attack'){
  fx('dash',.07,.28,{anchor:'wake',width:1.4,alpha:.4});
  fx('slash',.07,.48,{width:2.15,angle:0});
 }
 if(mode==='skill'){
  fx('dash',.09,.28,{anchor:'wake',width:1.7,alpha:.5});
  fx('slash',.08,.47,{width:2.15,angle:.22});
  fx('crosscut',.31,.49,{width:2.4,angle:-.15});
  fx('slash',.54,.59,{width:2.8,angle:0});
  fx('fracture',.73,.74,{anchor:'ground',width:2.1,alpha:.75});
 }
 if(mode==='ultimate'){
  fx('pressure',0,1.45,{anchor:'actor',width:3.4,alpha:.6});
  fx('dash',1.27,.44,{anchor:'wake',width:2.2,alpha:.7});
  fx('crosscut',1.59,.63,{anchor:'actor',width:3,alpha:.9});
  fx('ultimate',2.09,1.45,{anchor:'field',width:6.5,alpha:.98});
  fx('fracture',2.45,1.49,{anchor:'fieldground',width:5.7,alpha:Math.min(1,(3.94-t)/.4)});
 }
 const impact=m.contacts.reduce((v,at)=>Math.max(v,t>=at&&t<at+.16?1-(t-at)/.16:0),0);
 const phase=mode==='idle'?'고요한 흑청 검압':mode==='dash'?(t<.22?'발끝 압축':t<.58?'섬보 · 돌파':t<.85?'제동 · 망토 잔향':'자세 회복'):mode==='attack'?(t<.14?'간격 포착':t<.24?'백은일섬 · 순간 검격':t<.55?'검압 잔향':'자세 회복'):mode==='skill'?(t<.16?'중심 이동':t<.39?'첫 번째 검격':t<.63?'두 번째 검격':t<.87?'세 번째 검격':'검기 잔향 · 자세 회복'):t<.2?'전장을 압도하다':t<1.1?'각성 · 검의 극의':t<1.6?'중심 압축 · 돌파':t<1.95?'육신의 일검':t<2.45?'전선 단절':t<3.65?'지연 파열 · 검압 잔향':'종결 · 검을 거두다';
 const cinematic=mode==='ultimate'&&t>=.16&&t<1.16?{progress:clamp((t-.16)/1),alpha:Math.min(smooth((t-.16)/.12),smooth((1.16-t)/.16)),key:'awakening'}:null;
 return{mode,time:t,bodyTime,motionPlaybackRate:m.rate,effectPlaybackRate:1,frame,pose:p,phase,effects,cinematic,impact,path:{from:from.anchor,to:to.anchor,mix:q},lift:mix(from.lift,to.lift,q),done:t>=m.duration,contactCount:m.contacts.filter(at=>at<=t).length,ghosts:mode==='dash'&&t>.22&&t<.65||mode==='skill'&&t>.12&&t<.87||mode==='ultimate'&&t>1.4&&t<2.1};
}
export function bladeContact(grip,tip,torso,radius){
 const dx=tip.x-grip.x,dy=tip.y-grip.y,l=dx*dx+dy*dy,u=l?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/l):0;
 const distance=Math.hypot(grip.x+dx*u-torso.x,grip.y+dy*u-torso.y);
 return{u,distance,intersects:u>.08&&u<.96&&distance<=radius,tipDistance:Math.hypot(tip.x-torso.x,tip.y-torso.y)};
}
