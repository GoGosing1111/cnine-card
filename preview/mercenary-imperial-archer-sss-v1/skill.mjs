export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const SHOTS=[.98,1.26,1.54,1.82,2.10,2.68];
export const RAIN_HITS=Array.from({length:15},(_,i)=>2.35+i*.085);
export const MODES={
 idle:{duration:5,description:'안정된 자세로 활과 화살을 겨눕니다.',events:[[0,'대기 · 시위 정렬']],contacts:[]},
 dash:{duration:1.8,description:'몸을 낮춰 빠르게 이동하고 사격 자세로 돌아옵니다.',events:[[0,'무게 이동'],[.3,'전진'],[.85,'착지'],[1.25,'사격 자세 복귀']],contacts:[]},
 attack:{duration:2.6,description:'시위를 깊게 당겨 묵직한 화살로 적의 갑주를 관통합니다.',events:[[0,'화살 응축'],[.5,'시위 만개'],[.85,'강궁 발사'],[1.18,'갑주 관통'],[1.75,'파편 · 잔향']],contacts:[1.18]},
 skill:{duration:4.1,description:'한 대상에게 고속 관통탄을 연사한 뒤 일곱 화살을 한 번에 쏟아붓습니다.',events:[[0,'속사 조준'],[.68,'고속 관통 연사'],[2.1,'마지막 시위 충전'],[2.38,'일곱 화살 동시 방출'],[2.68,'집중 관통'],[3.25,'자세 회복']],contacts:SHOTS},
 ultimate:{duration:6.6,description:'천공에 쏜 화살이 빽빽한 화살비로 내려꽂히고, 거대한 마지막 화살이 진형을 꿰뚫습니다.',events:[[0,'천공 조준'],[.65,'시위 압축'],[1.3,'천공 사격'],[2.35,'연속 화살비'],[4.05,'거대 화살 · 지면 파열'],[5.35,'파편 · 잔향']],contacts:[...RAIN_HITS,4.05]},
 hit:{duration:1.7,description:'충격을 흡수하고 활을 다시 가다듬습니다.',events:[[0,'피격'],[.3,'균형 회복'],[.9,'복귀']],contacts:[]},
 defeat:{duration:2.7,description:'활을 낮추고 무릎을 꿇으며 자세를 잃습니다.',events:[[0,'충격'],[.5,'균형 상실'],[1.1,'무릎'],[1.8,'정착']],contacts:[]}
};
export const SHOWCASE=['idle','dash','attack','skill','ultimate','hit','defeat'];
export function makePlan({mode='idle',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown mode');
 const stops=[cancelAt,targetLostAt].filter(Number.isFinite);
 return{mode,...MODES[mode],stop:stops.length?Math.min(...stops):null};
}
const p=(key,frame)=>({key,frame});
export function sample(plan,time){
 const t=clamp(time,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;
 let pose=p('idle',0),travel=0,jump=0,recoil=0;
 if(!cancelled)switch(plan.mode){
  case 'dash':if(t<1.05){pose=p('dash',Math.min(3,Math.floor(t/.26)));travel=clamp(t/.85);jump=Math.sin(clamp((t-.25)/.6)*Math.PI)*.1;}else travel=1-clamp((t-1.05)/.55);break;
  case 'attack':
   pose=t<.85?p('draw',Math.min(3,Math.floor(t/.2125))):t<1.9?p('release',Math.min(3,Math.floor((t-.85)/.26))):pose;
   if(t>=.85&&t<1.07)recoil=Math.sin((t-.85)/.22*Math.PI);break;
  case 'skill':{
   const launches=SHOTS.map(h=>h-.3),last=launches.filter(a=>t>=a).at(-1);
   if(last===undefined)pose=p('draw',Math.min(3,Math.floor(t/.17)));
   else if(t<3.3){const age=t-last;pose=age<.14?p('release',age<.07?0:1):age<.20?p('release',2):p('draw',age<.25?2:3);if(age<.18)recoil=Math.sin(age/.18*Math.PI)*.75;}
   if(t>=2.85&&t<3.4)pose=p('release',t<3.1?2:3);break;
  }
  case 'ultimate':pose=t<.35?p('ultimate',0):t<.75?p('ultimate',1):t<1.3?p('ultimate',2):t<1.9?p('ultimate',3):t<2.55?p('release',t<2.2?2:3):pose;if(t>=1.3&&t<1.6)recoil=Math.sin((t-1.3)/.3*Math.PI)*1.2;break;
  case 'hit':pose=t<.45?p('defeat',0):t<.8?p('release',3):pose;break;
  case 'defeat':pose=p('defeat',t<.4?0:t<1?1:t<1.7?2:3);break;
 }
 if(cancelled||done&&plan.mode!=='defeat'){pose=p('idle',0);travel=jump=recoil=0;}
 return{time:t,pose,travel,jump,recoil,cancelled,done,label:cancelled?'시전 중단 · 원위치 복귀':plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'',contacts:cancelled?[]:plan.contacts.filter(at=>t>=at&&t-at<.18).map(at=>({at,age:t-at}))};
}
