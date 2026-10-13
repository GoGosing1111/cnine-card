export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const MODES={
 aura:{duration:8,description:'주작이 자리를 지키며 붉은 날개와 꼬리를 천천히 펼칩니다.',events:[[0,'주작의 가호'],[2,'느린 날갯짓'],[4,'진홍빛 꼬리의 흐름'],[6,'제자리에서 날개를 펼침']],contacts:[]},
 dash:{duration:1.8,description:'자세를 낮춰 이동하고 주작의 깃을 뒤로 흘립니다.',events:[[0,'무게 이동'],[.3,'추진'],[.85,'착지'],[1.25,'진형 복귀']],contacts:[]},
 attack:{duration:2.4,description:'금빛 시위를 당겨 정교한 관통 화살을 발사합니다.',events:[[0,'화살 응축'],[.5,'시위 만개'],[.8,'발사'],[1.22,'관통 · 깃 파열'],[1.7,'회복']],contacts:[1.22]},
 skill:{duration:4.4,description:'활에 응축된 주작이 세 번 비상하며 적을 관통합니다.',events:[[0,'주작을 활에 응축'],[.7,'날개의 개방'],[1.4,'첫 비상'],[2.1,'두 번째 관통'],[2.8,'마지막 관통'],[3.6,'잔광 회수']],contacts:[1.4,2.1,2.8]},
 ultimate:{duration:6.8,description:'천공에 주작의 화살진을 열고 화살비 뒤 거대한 주작이 강림합니다.',events:[[0,'활을 들어 천공 조준'],[.8,'주작의 화살진'],[1.75,'천공 사격'],[2.7,'광역 화살비'],[3.85,'주작 강림'],[4.5,'날개 폭쇄 · 지면 파열'],[5.8,'깃털과 잔향']],contacts:[2.7,2.84,2.98,3.12,3.26,3.85]},
 hit:{duration:1.7,description:'충격을 흡수하고 활을 다시 가다듬습니다.',events:[[0,'피격'],[.3,'균형 회복'],[.9,'복귀']],contacts:[]},
 defeat:{duration:2.7,description:'활을 내려놓고 무릎을 꿇으며 주작의 기운을 거둡니다.',events:[[0,'충격'],[.5,'균형 상실'],[1.1,'무릎'],[1.8,'정착']],contacts:[]}
};
export const SHOWCASE=['aura','dash','attack','skill','ultimate','hit','defeat'];
export function makePlan({mode='aura',cancelAt=null,targetLostAt=null}={}){if(!MODES[mode])throw Error('Unknown mode');const stops=[cancelAt,targetLostAt].filter(Number.isFinite);return{mode,...MODES[mode],stop:stops.length?Math.min(...stops):null};}
const p=(key,frame)=>({key,frame});
export function sample(plan,time){const t=clamp(time,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;let pose=p('idle',0),travel=0,jump=0;
 if(!cancelled){switch(plan.mode){
 case 'dash':if(t<1.05){pose=p('dash',Math.min(3,Math.floor(t/.26)));travel=clamp(t/.85);jump=Math.sin(clamp((t-.25)/.6)*Math.PI)*.1;}else{travel=1-clamp((t-1.05)/.55);}break;
 case 'attack':pose=t<.8?p('draw',Math.min(3,Math.floor(t/.2))):t<1.8?p('release',Math.min(3,Math.floor((t-.8)/.25))):pose;break;
 case 'skill':if(t<.7)pose=p('draw',Math.min(3,Math.floor(t/.175)));else if(t<3.1){const q=(t-.7)%.7;pose=q<.4?p('release',Math.min(1,Math.floor(q/.2))):p('draw',q<.55?2:3);}else if(t<3.65)pose=p('release',t<3.35?2:3);break;
 case 'ultimate':pose=t<.4?p('ultimate',0):t<1.0?p('ultimate',1):t<1.75?p('ultimate',2):t<3.9?p('ultimate',3):t<4.6?p('release',2):pose;break;
 case 'hit':pose=t<.45?p('defeat',0):t<.8?p('release',3):pose;break;
 case 'defeat':pose=p('defeat',t<.4?0:t<1?1:t<1.7?2:3);break;
 }}
 if(cancelled||done&&plan.mode!=='defeat'){pose=p('idle',0);travel=jump=0;}
 return{time:t,pose,travel,jump,cancelled,done,label:cancelled?'시전 중단 · 원위치 복귀':plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'',contacts:cancelled?[]:plan.contacts.filter(at=>t>=at&&t-at<.24).map(at=>({at,age:t-at}))};
}
