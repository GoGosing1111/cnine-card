export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const MODES={
 aura:{duration:4,description:'청옥 마력환과 날개의 호흡',events:[[0,'대기 자세'],[.8,'마력환 전개'],[2,'결정 공명'],[3.5,'잔향 회수']],contacts:[]},
 dash:{duration:2.2,description:'짧게 활공하며 남기는 결정 잔상',events:[[0,'무게 이동'],[.4,'활공'],[.95,'착지'],[1.5,'진형 복귀']],contacts:[]},
 attack:{duration:2.8,description:'지팡이의 마력을 손끝으로 모아 단일 결정탄 발사',events:[[0,'마력 응축'],[.7,'결정탄 발사'],[1.35,'접촉 · 파열'],[2.2,'회복']],contacts:[1.35]},
 skill:{duration:4.5,description:'다중 마법진에서 네 발의 결정창을 연속 발사',events:[[0,'세 겹 마법진 전개'],[.9,'결정창 형성'],[1.5,'첫 관통'],[2.58,'마지막 파열'],[3.7,'마법진 해체']],contacts:[1.5,1.86,2.22,2.58]},
 ultimate:{duration:6.4,description:'날개를 펼쳐 천공의 봉인을 열고 적 진형에 청옥 결정 강림',events:[[0,'날개 · 마력 개방'],[.8,'천공 마법진 전개'],[1.65,'거대 결정 형성'],[2.65,'중앙 강림'],[3.05,'연쇄 결정 폭쇄'],[4.4,'파편 · 잔향'],[5.7,'회복']],contacts:[2.65,2.75,2.85,2.95,3.05]},
 hit:{duration:1.8,description:'충격을 받아 자세를 낮춘 뒤 복귀',events:[[0,'피격'],[.25,'충격 흡수'],[.75,'회복']],contacts:[]},
 defeat:{duration:2.6,description:'무릎을 꿇고 날개와 마력을 거두는 쓰러짐',events:[[0,'큰 충격'],[.5,'균형 상실'],[1.1,'한쪽 무릎'],[1.75,'정착']],contacts:[]}
};
export const SHOWCASE=['aura','dash','attack','skill','ultimate','hit','defeat'];
export function makePlan({mode='aura',cancelAt=null,targetLostAt=null}={}){if(!MODES[mode])throw Error('Unknown mode');const stops=[cancelAt,targetLostAt].filter(Number.isFinite);return{mode,...MODES[mode],stop:stops.length?Math.min(...stops):null};}
const p=(key,frame)=>({key,frame});
export function sample(plan,time){const t=clamp(time,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;let pose=p('idle',Math.floor(t*2)%4),travel=0,jump=0;
 if(!cancelled){switch(plan.mode){
 case 'dash':if(t<1.25){pose=p('dash',Math.min(3,Math.floor(t/.3)));travel=t<.85?clamp(t/.85):1;jump=Math.sin(clamp((t-.3)/.6)*Math.PI)*.10;}else{travel=1-clamp((t-1.25)/.6);}break;
 case 'attack':pose=t<.35?p('ultimate',0):t<.7?p('cast',0):t<1.65?p('cast',1):t<2?p('cast',0):pose;break;
 case 'skill':pose=t<.4?p('ultimate',0):t<.9?p('ultimate',1):t<3.0?p('cast',Math.floor((t-.9)*5)%2):t<3.5?p('cast',0):pose;break;
 case 'ultimate':pose=t<.45?p('ultimate',0):t<1.1?p('ultimate',1):t<2.6?p('ultimate',2):t<3.7?p('ultimate',3):t<4.5?p('ultimate',1):t<5.1?p('ultimate',0):pose;break;
 case 'hit':pose=t<.35?p('defeat',0):t<.7?p('defeat',1):pose;break;
 case 'defeat':pose=p('defeat',t<.45?0:t<1?1:t<1.65?2:3);break;
 }}
 if(cancelled||done&&plan.mode!=='defeat'){pose=p('idle',0);travel=jump=0;}
 return{time:t,pose,travel,jump,cancelled,done,label:cancelled?'시전 중단 · 원위치 복귀':plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'',contacts:cancelled?[]:plan.contacts.filter(at=>t>=at&&t-at<.24).map(at=>({at,age:t-at}))};}
