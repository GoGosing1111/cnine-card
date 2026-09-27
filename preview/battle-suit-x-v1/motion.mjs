// Authored drawings and visual contacts sampled from one V3 GSAP clock. No combat calculations.
const pose=(at,bank,index,facing=1)=>({at,bank,index,facing});
const path=(at,anchor,lift=0)=>({at,anchor,lift});
export const MODES={
 dash:{label:'청광 대시',duration:1.15,contact:null,contacts:[],
  poses:[pose(0,'dash',0),pose(.13,'dash',1),pose(.21,'dash',2),pose(.28,'dash',3),pose(.37,'dash',4),pose(.46,'dash',5),pose(.55,'dash',6),pose(.77,'dash',7)],
  path:[path(0,'home'),path(.23,'home'),path(.48,'left'),path(1.15,'left')]},
 attack:{label:'일섬',duration:1.1,contact:.37,contacts:[.37],
  poses:[pose(0,'combo',0),pose(.13,'dash',2),pose(.21,'dash',3),pose(.29,'combo',0),pose(.345,'combo',1),pose(.425,'combo',2),pose(.56,'attack',5),pose(.79,'attack',7)],
  path:[path(0,'home'),path(.15,'home'),path(.345,'left'),path(.425,'left'),path(1.1,'left')]},
 skill:{label:'천광 연섬',duration:3.4,contact:2.18,contacts:[.37,.64,.91,1.18,1.43,2.18],
  poses:[pose(0,'skill',0),pose(.10,'combo',0),pose(.20,'dash',2),pose(.26,'dash',3),pose(.31,'combo',0),
   pose(.345,'combo',1),pose(.415,'combo',2),pose(.47,'dash',3),pose(.525,'dash',4),pose(.57,'combo',0,-1),
   pose(.615,'combo',2,-1),pose(.695,'combo',3,-1),pose(.75,'dash',3,-1),pose(.805,'dash',4,-1),pose(.85,'combo',0),
   pose(.885,'combo',1),pose(.965,'combo',2),pose(1.025,'dash',4),pose(1.10,'combo',0,-1),
   pose(1.155,'combo',2,-1),pose(1.235,'combo',3,-1),pose(1.285,'dash',4,-1),pose(1.36,'combo',3),
   pose(1.49,'combo',4),pose(1.57,'combo',5),pose(1.76,'skill',3),pose(1.95,'skill',4),
   pose(2.06,'combo',6),pose(2.155,'combo',7),pose(2.34,'skill',6),pose(2.64,'skill',7)],
  path:[path(0,'home'),path(.17,'home'),path(.345,'left'),path(.415,'left'),path(.59,'right'),path(.695,'right'),
   path(.855,'left'),path(.965,'left'),path(1.125,'right'),path(1.235,'right'),path(1.37,'rise'),path(1.49,'rise'),
   path(1.76,'air',.58),path(1.94,'air',.58),path(2.18,'finish'),path(3.4,'finish')]}
};
for(const s of Object.values(MODES))s.steps=s.poses.map(p=>p.at);
export const clamp=n=>Math.max(0,Math.min(1,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;

export function sample(mode,time){
 const s=MODES[mode],t=Math.max(0,Math.min(s.duration,time));
 const frame=s.poses.findLastIndex(p=>p.at<=t),p=s.poses[frame];
 const n=Math.max(0,s.path.findLastIndex(p=>p.at<=t)),from=s.path[n],to=s.path[Math.min(n+1,s.path.length-1)];
 const pathMix=to.at===from.at?1:smooth((t-from.at)/(to.at-from.at));
 const lift=mix(from.lift,to.lift,pathMix),effects=[];
 const add=(key,start,end,options={})=>{
  if(t<start||t>=end)return;
  const q=(t-start)/(end-start),first=options.first??0,last=options.last??11;
  effects.push({key,frame:Math.min(last,Math.floor(first+q*(last-first+1))),alpha:1,anchor:'body',angle:0,width:1.55,...options});
 };
 if(mode==='dash')add('dash',.20,.87,{anchor:'wake',width:2.05,alpha:.82});
 if(mode==='attack'){
  add('dash',.17,.39,{anchor:'wake',width:1.6,alpha:.48});
  add('cut-v2',.255,.66,{width:1.6,angle:-.08});
 }
 if(mode==='skill'){
  add('dash',.18,.40,{anchor:'wake',width:1.85,alpha:.72});
  add('cut-v2',.255,.66,{width:1.65,angle:-.14});
  add('cross-v2',.52,.88,{width:1.6,angle:.08});
  add('cut-v2',.795,1.2,{width:1.85,angle:.22});
  add('cross-v2',1.06,1.43,{width:1.9,angle:-.16});
  add('cut-v2',1.31,1.76,{width:2.05,angle:-1.1});
  add('dash',1.58,1.94,{anchor:'wake',width:1.5,angle:-.65,alpha:.50});
  add('cleave-v2',1.96,2.92,{anchor:'ground',width:2.8,alpha:.94});
  add('ground-v2',2.16,3.32,{anchor:'ground',width:2.15,alpha:Math.min(1,(3.32-t)/.36)});
 }
 const impact=s.contacts.reduce((n,at,i)=>Math.max(n,t>=at&&t<at+.18?(1-(t-at)/.18)*(i===s.contacts.length-1&&mode==='skill'?1:.38):0),0);
 const phase=mode==='dash'?(t<.21?'발진 준비':t<.48?'청광 돌진':t<.77?'착지':'자세 회복'):
  mode==='attack'?(t<.255?'발도 · 접근':t<.425?'횡베기':t<.66?'검격 잔향':'자세 회복'):
   t<.255?'응축 · 발도':t<1.31?'교차 돌진 · 연속 베기':t<1.57?'올려베기':t<1.96?'도약 · 검압 응축':t<2.18?'공중 내려베기':t<2.4?'최종 검격 · 지면 파열':t<3.1?'파편 · 검기 잔향':'자세 회복';
 return{mode,time:t,frame,pose:p,phase,effects,impact,lift,path:{from:from.anchor,to:to.anchor,mix:pathMix},done:t>=s.duration,
  contactCount:s.contacts.filter(at=>at<=t).length,ghosts:mode==='skill'&&t>.25&&t<2.25||mode==='dash'&&t>.25&&t<.6};
}

// Segment versus torso. The edge passes through the torso; the tip continues beyond it.
export function bladeContact(grip,tip,torso,radius){
 const dx=tip.x-grip.x,dy=tip.y-grip.y,len2=dx*dx+dy*dy;
 const u=len2?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/len2):0;
 const nearest={x:grip.x+dx*u,y:grip.y+dy*u},distance=Math.hypot(nearest.x-torso.x,nearest.y-torso.y);
 return{u,distance,intersects:u>.12&&u<.93&&distance<=radius,tipDistance:Math.hypot(tip.x-torso.x,tip.y-torso.y)};
}
