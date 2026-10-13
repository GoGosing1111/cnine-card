export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const MODES={
 aura:{duration:6,description:'안정된 대기 자세 · 날개와 지팡이를 감싸는 청옥 오라',events:[[0,'대기 · 청옥 오라'],[2,'날개 주변 마력의 흐름'],[4,'지팡이 광원 · 결정 공명']],contacts:[]},
 attack:{duration:2.8,description:'지팡이의 마력을 손끝으로 모아 단일 결정탄 발사',events:[[0,'마력 응축'],[.7,'결정탄 발사'],[1.35,'접촉 · 파열'],[2.2,'회복']],contacts:[1.35]},
 skill:{duration:4.9,description:'세 겹의 마법진 · 여섯 발의 결정창 · 연속 적중 폭쇄',events:[[0,'다중 마법진 전개'],[.8,'결정창 응축'],[1.45,'연속 포격'],[3.1,'여섯 번째 폭쇄'],[4,'마법진 해체']],contacts:[1.45,1.78,2.11,2.44,2.77,3.1]},
 ultimate:{duration:7.8,description:'삼중 천공 봉인 → 결정 강림 → 거대 청옥 폭쇄',events:[[0,'날개 · 마력 개방'],[.8,'삼중 천공 마법진'],[1.65,'거대 결정 형성'],[2.65,'중앙 강림'],[3.05,'연쇄 결정 낙하'],[4.1,'최종 청옥 폭쇄'],[6.5,'잔향 · 회복']],contacts:[2.65,2.75,2.85,2.95,3.05,4.1],finalAt:4.1},
 hit:{duration:1.8,description:'충격을 받아 자세를 낮춘 뒤 복귀',events:[[0,'피격'],[.25,'충격 흡수'],[.75,'회복']],contacts:[]},
 defeat:{duration:2.6,description:'무릎을 꿇고 날개와 마력을 거두는 쓰러짐',events:[[0,'큰 충격'],[.5,'균형 상실'],[1.1,'한쪽 무릎'],[1.75,'정착']],contacts:[]}
};
export const SHOWCASE=['aura','attack','skill','ultimate','hit','defeat'];
export function makePlan({mode='aura',cancelAt=null,targetLostAt=null}={}){if(!MODES[mode])throw Error('Unknown mode');const stops=[cancelAt,targetLostAt].filter(Number.isFinite);return{mode,...MODES[mode],stop:stops.length?Math.min(...stops):null};}
const p=(key,frame)=>({key,frame});
// These separately authored idle silhouettes are not consecutive animation keys.
// Keep one grounded posture; the surrounding aura owns the idle movement.
export function sample(plan,time){const t=clamp(time,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;let pose=p('idle',0),travel=0,jump=0;
 if(!cancelled){switch(plan.mode){
 case 'attack':pose=t<.35?p('ultimate',0):t<.7?p('cast',0):t<1.65?p('cast',1):t<2?p('cast',0):pose;break;
 case 'skill':pose=t<.4?p('ultimate',0):t<.9?p('ultimate',1):t<3.5?p('cast',1):t<4?p('cast',0):pose;break;
 case 'ultimate':pose=t<.45?p('ultimate',0):t<1.1?p('ultimate',1):t<2.6?p('ultimate',2):t<3.45?p('ultimate',3):t<4.1?p('ultimate',2):t<4.8?p('ultimate',3):t<5.5?p('ultimate',1):t<6.2?p('ultimate',0):pose;break;
 case 'hit':pose=t<.35?p('defeat',0):t<.7?p('defeat',1):pose;break;
 case 'defeat':pose=p('defeat',t<.45?0:t<1?1:t<1.65?2:3);break;
 }}
 if(cancelled||done&&plan.mode!=='defeat'){pose=p('idle',0);travel=jump=0;}
 return{time:t,pose,travel,jump,cancelled,done,label:cancelled?'시전 중단 · 원위치 복귀':plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'',contacts:cancelled?[]:plan.contacts.filter(at=>t>=at&&t-at<.24).map(at=>({at,age:t-at}))};}
