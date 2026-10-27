export const MODES={idle:'고정 대기',dash:'이동',attack:'기본 공격',skill:'스킬 1',skill2:'스킬 2',hit:'피격',defeat:'전투 불능'};
export const SKILLS={heeya:'흑관 관통',bongsoon:'녹옥 저격',joeun:'왕관 점사',diim:'자월 연격',sudaeng:'황금화관',orikkung:'왕관 산탄'};
export const SECOND_SKILLS={heeya:'흑우 탄막',bongsoon:'녹옥 관통',joeun:'흑관 파쇄',diim:'월영 회수',sudaeng:'흑염 결계',orikkung:'크라운 일제탄'};
function controlledRecoil(id,p){
 if(!['joeun','orikkung'].includes(id))return p;
 const poses=[[0,'idle',0],[.12,'attack',0],[.5,'attack',1]];
 for(const time of [...new Set(p.shots.map(s=>s.release))])poses.push([time,'attack',2],[time+.09,'attack',1]);
 poses.push([Math.max(...p.shots.map(s=>s.release))+.35,'attack',3],[p.duration-.35,'idle',0]);
 return {...p,poses:poses.sort((a,b)=>a[0]-b[0]),recoilSeconds:.09};
}
export function plan(id,mode){
 const base={name:MODES[mode],duration:2.8,peak:1.15,shots:[],poses:[[0,'idle',0],[.2,'attack',0],[.65,'attack',1],[1,'attack',2],[1.65,'attack',3],[2.5,'idle',0]]};
 if(mode==='idle')return {...base,duration:1,peak:0,poses:[[0,'idle',0]]};
 if(mode==='dash')return {...base,duration:2,peak:.6,poses:[[0,'idle',0],[.1,'dash',0],[.32,'dash',1],[.55,'dash',0],[.78,'dash',1],[1,'dash',0],[1.22,'dash',1],[1.45,'dash',0],[1.75,'idle',0]]};
 if(mode==='hit')return {...base,duration:1.6,peak:.3,poses:[[0,'idle',0],[.2,'hit',0],[1.05,'attack',3],[1.4,'idle',0]]};
 if(mode==='defeat')return {...base,duration:2,peak:1.25,poses:[[0,'idle',0],[.2,'hit',0],[.9,'defeat',0]]};
 const release=id==='diim'?.65:1;
 base.shots=[{release,hit:release+.32,target:1,pose:id==='diim'?1:2,impactLife:.85}];base.peak=release+.44;
 if(mode==='attack')return controlledRecoil(id,base);
 if(mode==='skill2'){
  const p={...base,name:SECOND_SKILLS[id],duration:3.4,effectBank:'secondary',peak:1.65,poses:[[0,'idle',0],[.12,'attack',0],[.5,'attack',1],[1,'attack',2],[2.2,'attack',3],[3,'idle',0]]};
  if(id==='heeya')p.shots=[0,1,2].map((target,i)=>({release:1+i*.1,hit:1.38+i*.1,target,pose:2,impactLife:.8}));
  if(id==='bongsoon')p.shots=[{release:1,hit:1.36,target:1,pose:2,impactLife:1},{release:1.36,hit:1.58,target:0,pose:2,impactLife:.9,fromTarget:1,suppressMuzzle:true}];
  if(id==='joeun')p.shots=[{release:1,hit:1.36,target:1,pose:2,impactLife:1.15},{release:1.22,hit:1.58,target:1,pose:2,impactLife:.85}];
  if(id==='diim'){p.shots=[{release:.65,hit:1.25,target:1,pose:1,impactLife:.7,arc:-.8,returnAt:1.55,returnEnd:2.35}];p.poses=[[0,'idle',0],[.12,'attack',0],[.65,'attack',1],[1.5,'attack',3],[2.35,'attack',0],[3,'idle',0]];p.peak=1.4;}
  if(id==='sudaeng'){p.shots=[0,1,2].map((target,i)=>({release:1,hit:1.4+i*.2,target,pose:2,impactLife:1.15,ground:true,suppressMuzzle:i>0}));p.peak=1.85;}
  if(id==='orikkung')p.shots=[0,1,2].map(target=>({release:1,hit:1.34,target,pose:2,impactLife:1}));
  return controlledRecoil(id,p);
 }
 base.name=SKILLS[id];base.duration=3.4;base.poses=[[0,'idle',0],[.12,'attack',0],[.5,'attack',1],[1,'attack',2],[2.15,'attack',3],[3,'idle',0]];
 if(id==='joeun')base.shots=[0,.2,.4].map((t,i)=>({release:1+t,hit:1.32+t,target:[1,0,2][i],pose:2,impactLife:.72}));
 if(id==='diim'){base.shots=[{release:.65,hit:1.05,target:1,pose:1,impactLife:.6},{release:1.65,hit:1.65,target:1,pose:2,impactLife:.9,melee:true}];base.poses=[[0,'idle',0],[.12,'attack',0],[.65,'attack',1],[1.35,'attack',2],[2.15,'attack',3],[3,'idle',0]];base.peak=1.8;}
 if(id==='sudaeng'){base.shots=[{release:1,hit:1.55,target:1,pose:2,impactLife:1.1}];base.peak=1.75;}
 if(id==='orikkung')base.shots=[{release:1,hit:1.3,target:1,pose:2,impactLife:1}];
 return controlledRecoil(id,base);
}
