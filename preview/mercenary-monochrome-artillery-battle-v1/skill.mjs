export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const SHOT_INTERVAL=1/9, RIFLE_FLIGHT=.105;
const burst=(start,count)=>Array.from({length:count},(_,i)=>start+i*SHOT_INTERVAL);
const rifleMode=(duration,start,count,description,events)=>{const launches=burst(start,count);return{duration,description,events,launches,rifleLaunches:launches,contacts:launches.map(t=>t+RIFLE_FLIGHT)};};
const artillery=[1.8,2.35,2.9,3.45,4];
export const MODES={
 aura:{duration:6,description:'망령 군기 · 등 뒤 두 군기의 느린 흐름과 백색 광륜',events:[[0,'망령 군기 전개'],[2,'검은 천과 백색 문양'],[4,'느린 기운의 흐름']],contacts:[],rifleLaunches:[]},
 attack:rifleMode(1.75,.22,9,'AR 연발 사격 · 짧은 팔 반동과 연속 탄도',[[0,'견착 유지'],[.22,'9발 자동 사격'],[1.22,'사격 종료 · 복귀']]),
 skill:rifleMode(4.55,.38,30,'백탄 난사 · 30발 지속 사격 → 해골 낙인 파쇄',[[0,'총구 앞 은탄 응축'],[.38,'AR 지속 사격'],[.485,'적중 · 해골 낙인'],[3.602,'마지막 탄환'],[3.9,'낙인 파쇄 · 잔향']]),
 ultimate:{duration:6.35,description:'중앙 중포대 · AR 엄호 연발과 5회 연속 광역 포격',events:[[0,'중앙 포대 소환'],[1.25,'포신 충전'],[1.35,'AR 엄호 연발'],[1.8,'연속 광역 포격 개시'],[4,'최종 대폭쇄'],[5.2,'포대 해체']],launches:artillery,rifleLaunches:burst(1.35,25),contacts:artillery.map(t=>t+.27)},
};
export const SHOWCASE=['aura','attack','skill','ultimate'];
export function makePlan({mode='aura',cancelAt=null,targetLostAt=null}={}){if(!MODES[mode])throw Error('Unknown mode');const stops=[cancelAt,targetLostAt].filter(Number.isFinite);return{mode,...MODES[mode],stop:stops.length?Math.min(...stops):null};}
export function sample(plan,time){const t=clamp(time,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;let frame=0;
 if(!cancelled&&!done){const last=plan.rifleLaunches.filter(at=>at<=t).at(-1),age=last===undefined?Infinity:t-last;frame=age<.025?1:age<.052?2:age<.083?3:0;}
 return{time:t,pose:{key:'ar',frame},cancelled,done,label:cancelled?'사격 중단 · 이펙트 정리':plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'',contacts:cancelled?[]:plan.contacts.filter(at=>t>=at&&t-at<.085).map(at=>({at,age:t-at}))};}
