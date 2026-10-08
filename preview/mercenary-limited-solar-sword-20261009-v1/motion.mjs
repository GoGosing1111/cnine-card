// Visual choreography only: no HP, damage or account writes.
const pose=(at,bank,index,facing=1)=>({at,bank,index,facing});
export const clamp=n=>Math.max(0,Math.min(1,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
export const mix=(a,b,t)=>a+(b-a)*t;
export const STRIKE=2.48;
export const MODES={
 aura:{label:'태양의 권능',duration:6,contacts:[],poses:[pose(0,'idle',0),pose(1.5,'idle',1),pose(3,'idle',2),pose(4.5,'idle',3)]},
 dash:{label:'일식 잔영',duration:1.9,contacts:[],poses:[pose(0,'idle',0),pose(.16,'dash',0),pose(.28,'dash',1),pose(.38,'dash',2),pose(.66,'dash',3),pose(.84,'idle',1),pose(1.10,'dash',1,-1),pose(1.22,'dash',2,-1),pose(1.51,'dash',3,-1),pose(1.72,'idle',0)]},
 attack:{label:'여명 일섬',duration:1.7,contacts:[.48],poses:[pose(0,'idle',0),pose(.18,'cut',0),pose(.33,'cut',1),pose(.455,'cut',2),pose(.61,'attack',4),pose(.88,'attack',5),pose(1.10,'attack',6),pose(1.40,'idle',0)]},
 skill:{label:'육광 · 태양검진',duration:4.3,contacts:[1.20,1.39,1.58,1.77,1.96,2.15,2.66],poses:[pose(0,'idle',0),pose(.20,'command',0),pose(.49,'command',1),pose(.85,'command',2),pose(2.36,'command',3),pose(3.06,'command',0),pose(3.66,'idle',0)]},
 ultimate:{label:'천양붕락',duration:5.8,contacts:[STRIKE],poses:[pose(0,'idle',0),pose(.24,'ultimate',0),pose(.68,'ultimate',1),pose(1.00,'ultimate',2),pose(1.60,'ultimate',3),pose(2.15,'ultimate',4),pose(3.38,'ultimate',5),pose(4.25,'ultimate',6),pose(5.02,'idle',0)]}
};
export function sample(mode,time){
 const spec=MODES[mode],t=Math.max(0,Math.min(spec.duration,time)),frame=Math.max(0,spec.poses.findLastIndex(p=>p.at<=t));
 let entry=0,phase='태양핵 · 후광 · 검신 광원',travel=false;
 if(mode==='dash'){entry=smooth((t-.25)/.39)*(1-smooth((t-1.12)/.40));travel=t>.25&&t<.69||t>1.12&&t<1.55;phase=t<.25?'빛의 응축':t<.69?'일식 통과 · 잔영 분해':t<1.12?'빛의 재결합':t<1.55?'귀환 잔영':'자세 회복';}
 if(mode==='attack'){entry=smooth((t-.08)/.25)*(1-smooth((t-1.10)/.45));phase=t<.33?'무게 이동 · 검 들기':t<.61?'대각선 베기':t<1.1?'날끝의 잔광':'회수';}
 if(mode==='skill'){entry=smooth((t-.10)/.45)*(1-smooth((t-3.35)/.65));phase=t<.49?'태양핵 개방':t<1.20?'여섯 검의 포위':t<2.36?'순차 관통 · 육광':t<3.05?'검진 수렴 · 종결':'금빛 파편 · 귀환';}
 if(mode==='ultimate'){entry=smooth((t-.18)/.50)*(1-smooth((t-4.72)/.85));phase=t<.68?'태양문 개방':t<1.95?'거대 태양검 현현':t<STRIKE?'천공에서 낙하':t<3.18?'지면 강타 · 진형 파열':t<4.6?'왕관 충격파 · 지층 붕괴':'별가루 · 자세 회복';}
 const impact=spec.contacts.reduce((v,at)=>Math.max(v,t>=at&&t<at+.23?(1-(t-at)/.23):0),0);
 return{mode,time:t,frame,pose:spec.poses[frame],entry,phase,travel,impact,done:t>=spec.duration,contactCount:spec.contacts.filter(at=>at<=t).length};
}
export function bladeContact(grip,tip,torso,radius){
 const dx=tip.x-grip.x,dy=tip.y-grip.y,len2=dx*dx+dy*dy,u=len2?clamp(((torso.x-grip.x)*dx+(torso.y-grip.y)*dy)/len2):0;
 const distance=Math.hypot(grip.x+dx*u-torso.x,grip.y+dy*u-torso.y);
 return{u,distance,intersects:u>.10&&u<.95&&distance<=radius};
}
export function areaHits(points,center,size){
 const distances=points.map(p=>Math.hypot(p.x-center.x,(p.y-center.y)*1.15)),radius=Math.max(size*.5,...distances);
 return distances.map((distance,index)=>({index,at:STRIKE+.035+distance/radius*.28}));
}
