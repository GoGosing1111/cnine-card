// One authored V3 clock drives body drawings, all movement, afterimages and independent VFX.
export const EFFECT_BANKS=['aura','light','blade','dash','cut','cross','ground','flurry','tempest','cleave'];
const pose=(at,bank,index,facing=1)=>({at,bank,index,facing}),path=(at,anchor,lift=0)=>({at,anchor,lift});
// Whole-body drawings turn the blade through a large arc. A strike is never a fixed horizontal pose translated into the enemy.
const down=(hit,facing=1)=>[pose(hit-.22,'sweep',0,facing),pose(hit-.12,'sweep',1,facing),pose(hit-.035,'sweep',2,facing),pose(hit+.095,'rise',0,facing)];
const up=(hit,facing=1)=>[pose(hit-.17,'rise',0,facing),pose(hit-.04,'rise',1,facing),pose(hit+.06,'rise',2,facing)];
const quickDown=(hit,facing=1)=>[pose(hit-.16,'sweep',0,facing),pose(hit-.08,'sweep',1,facing),pose(hit-.02,'sweep',2,facing),pose(hit+.06,'rise',0,facing)];
const quickUp=(hit,facing=1)=>[pose(hit-.14,'rise',0,facing),pose(hit-.02,'rise',1,facing),pose(hit+.065,'rise',2,facing)];
const whirlwind=(hit,facing=1)=>[pose(hit-.29,'spin',0,facing),pose(hit-.16,'spin',1,facing),pose(hit-.025,'sweep',2,facing),pose(hit+.115,'rise',0,facing)];
export const MODES={
 idle:{label:'푸른 사신 · 대기',duration:4.8,contacts:[],loop:true,poses:[pose(0,'dash',0)],path:[path(0,'home'),path(4.8,'home')]},
 dash:{label:'잔영 대시',duration:1.75,contacts:[],poses:[pose(0,'dash',0),pose(.12,'dash',1),pose(.21,'dash',2),pose(.29,'dash',3),pose(.37,'dash',4),pose(.47,'dash',5),pose(.56,'dash',6),pose(.72,'dash',7),pose(.93,'dash',1,-1),pose(1.04,'dash',3,-1),pose(1.2,'dash',5,-1),pose(1.34,'dash',6,-1),pose(1.48,'dash',7)],path:[path(0,'home'),path(.18,'home'),path(.53,'left'),path(.95,'left'),path(1.34,'home'),path(1.75,'home')]},
 attack:{label:'청령 일섬',duration:1.6,contacts:[.43],poses:[pose(0,'rise',0),...down(.43),pose(.85,'dash',7),pose(1.06,'dash',2,-1),pose(1.21,'dash',5,-1),pose(1.38,'dash',7)],path:[path(0,'home'),path(.13,'home'),path(.35,'left'),path(1.02,'left'),path(1.37,'home'),path(1.6,'home')]},
 skill:{label:'청령 검무 · 잔영난무',duration:3.9,contacts:[.58,.82,1.06,1.30,1.54,1.78,2.48],poses:[pose(0,'skill',0),pose(.15,'dash',1),...quickDown(.58),...quickUp(.82,-1),...quickDown(1.06),...quickUp(1.30,-1),...quickDown(1.54),...quickUp(1.78,-1),pose(1.98,'sweep',0),...down(2.48),pose(2.82,'dash',7),pose(3.05,'dash',2,-1),pose(3.34,'dash',5,-1),pose(3.60,'dash',7)],path:[path(0,'home'),path(.18,'home'),path(.52,'left'),path(.655,'left'),path(.76,'right'),path(.895,'right'),path(1.0,'left'),path(1.135,'left'),path(1.24,'right'),path(1.375,'right'),path(1.48,'left'),path(1.615,'left'),path(1.72,'right'),path(1.87,'right'),path(2.14,'finish'),path(3.04,'finish'),path(3.60,'home'),path(3.9,'home')]},
 ultimate:{label:'궁극기 · 창천사신검',duration:5.7,contacts:[.80,1.35,1.90,3.53],poses:[pose(0,'ultimate',0),pose(.22,'dash',1),...whirlwind(.80),...whirlwind(1.35,-1),...whirlwind(1.90),pose(2.12,'spin',0),pose(2.32,'spin',2),pose(3.31,'sweep',1),pose(3.495,'spin',3),pose(3.94,'rise',0),pose(4.25,'dash',7),pose(4.65,'dash',2,-1),pose(4.94,'dash',5,-1),pose(5.27,'dash',7)],path:[path(0,'home'),path(.23,'home'),path(.72,'left'),path(.98,'left'),path(1.27,'sweepRight'),path(1.54,'sweepRight'),path(1.82,'left'),path(2.11,'left'),path(2.32,'charge'),path(3.23,'charge'),path(3.46,'ultimateFinish'),path(4.64,'ultimateFinish'),path(5.27,'home'),path(5.7,'home')]}
};
for(const m of Object.values(MODES)){m.poses.sort((a,b)=>a.at-b.at);m.steps=m.poses.map(p=>p.at);}
export const clamp=n=>Math.max(0,Math.min(1,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
export function sample(mode,time){
 const s=MODES[mode],t=Math.max(0,Math.min(s.duration,time)),frame=s.poses.findLastIndex(p=>p.at<=t),p=s.poses[frame];
 const n=Math.max(0,s.path.findLastIndex(p=>p.at<=t)),a=s.path[n],b=s.path[Math.min(n+1,s.path.length-1)],q=b.at===a.at?1:smooth((t-a.at)/(b.at-a.at));
 const effects=[],add=(key,start,end,opt={})=>{if(t<start||t>=end)return;const v=(t-start)/(end-start);effects.push({key,frame:Math.min(11,Math.floor(v*12)),alpha:1,anchor:'target',angle:0,width:1.7,...opt});};
 // Every travel segment, including return, has an authored air wake on the same clock.
 for(let i=1;i<s.path.length;i++){const from=s.path[i-1],to=s.path[i];if(from.anchor===to.anchor&&from.lift===to.lift)continue;const end=to.at+.16;add('dash',from.at,end,{anchor:'wake',width:1.75,alpha:.48*Math.min(1,(end-t)/.16),travelFrom:from.at});}
 if(mode==='attack')add('cut',.30,.78,{width:1.8,angle:.65});
 if(mode==='skill'){
  for(const [i,hit]of s.contacts.entries()){if(i>=6)continue;add('cut',hit-.085,hit+.16,{width:1.50+i*.055,angle:i%2?-.72:.72,alpha:.92});}
  add('flurry',.82,2.83,{width:3.1,alpha:1});add('cross',2.40,2.91,{width:2.25,alpha:.95});add('ground',2.47,3.08,{anchor:'ground',width:2.0,alpha:.85});
 }
 if(mode==='ultimate'){
  for(const [i,hit]of s.contacts.entries()){if(i===3)continue;add('tempest',hit-.29,hit+.32,{anchor:'orbit',width:2.55+i*.25,angle:i%2?-.24:.12,alpha:1});}
  add('tempest',2.18,3.27,{anchor:'charge',width:1.6-.7*clamp((t-2.18)/1.09),angle:-.6,alpha:.9});
  add('cleave',3.38,4.31,{anchor:'cleave',width:3.15,alpha:1});add('ground',3.50,4.66,{anchor:'ground',width:2.7,alpha:1});
 }
 const impact=s.contacts.reduce((v,at,i)=>Math.max(v,t>=at&&t<at+.17?(1-(t-at)/.17)*(i===s.contacts.length-1&&(mode==='skill'||mode==='ultimate')?1:.36):0),0);
 const phase=mode==='idle'?'푸른 사신 · 영혼의 오라':mode==='dash'?(t<.18?'발진 준비':t<.55?'잔영 돌진':t<.93?'제동 · 착지':t<1.38?'잔영 복귀':'자세 회복'):mode==='attack'?(t<.38?'검격 준비':t<.65?'대각선 내려베기':t<1.02?'후속 동작':t<1.37?'잔영 복귀':'자세 회복'):mode==='skill'?(t<.42?'발진 · 검격 준비':t<1.98?'잔영난무 · 교차 연속 베기':t<2.42?'교차 검흔 응축':t<2.84?'난무 폭발 · 마지막 검격':t<3.05?'잔향':t<3.60?'잔영 복귀':'자세 회복'):(t<.51?'회전 베기 준비':t<2.12?'삼중 회전 검풍':t<3.31?'양손 검압 응축':t<3.95?'창천사신검 · 거대 내려베기':t<4.65?'검압 파열 · 잔향':t<5.27?'잔영 복귀':'자세 회복');
 return{mode,time:t,frame,pose:p,phase,effects,impact,lift:mix(a.lift,b.lift,q),path:{from:a.anchor,to:b.anchor,mix:q},done:!s.loop&&t>=s.duration,contactCount:s.contacts.filter(at=>at<=t).length};
}
export function bladeContact(grip,tip,torso,radius){const dx=tip.x-grip.x,dy=tip.y-grip.y,l=dx*dx+dy*dy,u=l?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/l):0,distance=Math.hypot(grip.x+dx*u-torso.x,grip.y+dy*u-torso.y);return{u,distance,intersects:u>.10&&u<.95&&distance<=radius};}
