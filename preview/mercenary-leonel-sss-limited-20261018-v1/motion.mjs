// Authored body/weapon and FX drawings share the V3 registered GSAP clock.
// These are visual contacts only, never combat damage or economic values.
const pose=(at,bank,index,facing=1)=>({at,bank,index,facing});
const path=(at,anchor,lift=0)=>({at,anchor,lift});
export const MODES={
 idle:{label:'검의 경지',duration:4,contacts:[],poses:[pose(0,'idle',0),pose(1,'idle',1),pose(2,'idle',2),pose(3,'idle',3)],path:[path(0,'home'),path(4,'home')]},
 attack:{label:'백은일섬',duration:1.1,contacts:[.42],poses:[pose(0,'attack',0),pose(.12,'attack',1),pose(.23,'attack',2),pose(.37,'attack',3),pose(.48,'attack',4),pose(.59,'attack',5),pose(.73,'attack',6),pose(.91,'attack',7)],path:[path(0,'home'),path(.13,'home'),path(.37,'left'),path(.62,'left'),path(1.1,'home')]},
 dash:{label:'섬보',duration:1.25,contacts:[],poses:[pose(0,'dash',0),pose(.12,'dash',1),pose(.22,'dash',2),pose(.31,'dash',3),pose(.43,'dash',4),pose(.57,'dash',5),pose(.78,'dash',6),pose(1.04,'dash',7)],path:[path(0,'home'),path(.22,'home'),path(.58,'right'),path(.85,'right'),path(1.25,'home')]},
 skill:{label:'절명삼연',duration:2.3,contacts:[.48,.94,1.46],poses:[pose(0,'skill',0),pose(.40,'skill',1),pose(.75,'skill',2),pose(1.02,'skill',3),pose(1.12,'skill',4),pose(1.25,'skill',5),pose(1.4,'skill',6),pose(1.73,'skill',7)],path:[path(0,'home'),path(.2,'home'),path(.40,'left'),path(.62,'left'),path(.85,'second'),path(1.1,'second'),path(1.4,'third'),path(1.74,'third'),path(2.3,'home')]},
 ultimate:{label:'전선 절단',duration:3.5,contacts:[1.38,1.88],physicalContacts:[1.38],pressureContacts:[1.88],poses:[pose(0,'ultimate',0),pose(.28,'ultimate',1),pose(.57,'ultimate',2),pose(1.28,'ultimate',3),pose(1.52,'ultimate',4),pose(1.76,'ultimate',5),pose(2.3,'ultimate',6),pose(2.9,'ultimate',7)],path:[path(0,'home'),path(.55,'home'),path(1.28,'left'),path(1.6,'left'),path(2.6,'left'),path(3.5,'home')]}
};
for(const mode of Object.values(MODES))mode.steps=mode.poses.map(p=>p.at);
export const LINES={idle:'길을 열겠다. 내 뒤를 따라와.',attack:'빈틈이다.',skill:'세 번이면 충분하다.',dash:'이미 늦었다.',ultimate:'이 전선은, 내가 끊는다.',victory:'끝까지 서 있는 쪽이 이긴다.'};
export const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
export function sample(mode,time){
 const m=MODES[mode],t=clamp(time,0,m.duration),frame=Math.max(0,m.poses.findLastIndex(p=>p.at<=t)),p=m.poses[frame];
 const i=Math.max(0,m.path.findLastIndex(p=>p.at<=t)),from=m.path[i],to=m.path[Math.min(i+1,m.path.length-1)],q=to.at===from.at?1:smooth((t-from.at)/(to.at-from.at));
 const effects=[];
 const fx=(key,start,end,options={})=>{if(t<start||t>=end)return;effects.push({key,progress:(t-start)/(end-start),alpha:1,anchor:'target',angle:0,width:1.65,...options});};
 if(mode==='dash')fx('dash',.18,.9,{anchor:'wake',width:2.4,alpha:.8});
 if(mode==='attack'){
  fx('dash',.18,.46,{anchor:'wake',width:1.4,alpha:.38});
  fx('slash',.28,.76,{width:1.95,angle:-.04});
 }
 if(mode==='skill'){
  fx('dash',.22,.5,{anchor:'wake',width:1.7,alpha:.55});
  fx('slash',.32,.79,{width:2.0,angle:-.42});
  fx('crosscut',.78,1.27,{width:2.15,angle:.12});
  fx('slash',1.27,1.86,{width:2.6,angle:.08});
  fx('fracture',1.46,2.2,{anchor:'ground',width:1.9,alpha:.7});
 }
 if(mode==='ultimate'){
  fx('dash',.58,1.02,{anchor:'wake',width:1.9,alpha:.48});
  fx('crosscut',.88,1.51,{anchor:'actor',width:2.7,alpha:.85,angle:-.12});
  fx('ultimate',1.18,2.63,{anchor:'field',width:6.2,alpha:.94});
  fx('fracture',1.83,3.32,{anchor:'fieldground',width:5.4,alpha:Math.min(1,(3.32-t)/.4)});
 }
 const impact=m.contacts.reduce((v,at)=>Math.max(v,t>=at&&t<at+.16?(1-(t-at)/.16):0),0);
 const phase=mode==='idle'?'고요한 검압':mode==='dash'?(t<.22?'발끝 압축':t<.58?'섬보 · 돌파':t<.85?'제동 · 망토 잔향':'자세 회복'):mode==='attack'?(t<.28?'간격 포착':t<.48?'백은일섬':t<.76?'검압 잔향':'자세 회복'):mode==='skill'?(t<.32?'중심 이동':t<.79?'첫 번째 검격':t<1.27?'두 번째 검격':t<1.73?'세 번째 검격':'자세 회복'):t<.57?'전선을 읽다':t<1.18?'중심 압축 · 회전':t<1.6?'전선 절단':t<1.88?'검압 관통':t<2.7?'지면 파열 · 파편':'검을 거두다';
 return{mode,time:t,frame,pose:p,phase,effects,impact,path:{from:from.anchor,to:to.anchor,mix:q},lift:mix(from.lift,to.lift,q),done:t>=m.duration,contactCount:m.contacts.filter(at=>at<=t).length,ghosts:mode==='dash'&&t>.22&&t<.65||mode==='skill'&&t>.25&&t<1.7||mode==='ultimate'&&t>.88&&t<1.62};
}
export function bladeContact(grip,tip,torso,radius){
 const dx=tip.x-grip.x,dy=tip.y-grip.y,l=dx*dx+dy*dy,u=l?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/l):0;
 const distance=Math.hypot(grip.x+dx*u-torso.x,grip.y+dy*u-torso.y);
 return{u,distance,intersects:u>.08&&u<.96&&distance<=radius,tipDistance:Math.hypot(tip.x-torso.x,tip.y-torso.y)};
}
