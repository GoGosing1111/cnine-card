export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const MODES={
 aura:{duration:6,description:'머리 뒤 백색 광륜 · 총구 앞에 정렬된 은탄',events:[[0,'대기 · 백색 광륜'],[2,'총구 축에 은탄 정렬'],[4,'광륜의 은은한 발광']],contacts:[]},
 attack:{duration:2.1,description:'총구에서 시작하는 단발 사격 · 명중점에서 파편 발생',events:[[0,'정밀 조준'],[.6,'단발 발사'],[.88,'적중'],[1.35,'자세 회복']],contacts:[.88],launches:[.6]},
 skill:{duration:4.1,description:'백탄 낙인 · 세 발의 은탄을 정렬하고 적중한 적에게 해골 표식',events:[[0,'총구 앞 은탄 응축'],[.95,'첫 번째 정밀 사격'],[1.23,'적중 · 해골 낙인'],[1.8,'마지막 은탄 발사'],[2.08,'낙인 파쇄'],[3.3,'잔향 해체']],contacts:[1.23,1.65,2.08],launches:[.95,1.37,1.8]},
 ultimate:{duration:6.8,description:'망령 포대 · 적 진형 앞 자주포 전개 → 포신 반동 → 지면 폭쇄',events:[[0,'포격 지점 지시'],[.65,'적 진형 앞 포대 전개'],[1.8,'포신 충전'],[2.2,'첫 번째 포격'],[3.1,'재장전 · 두 번째 포격'],[4.25,'적 진형 연쇄 폭쇄'],[5.5,'포대 해체']],contacts:[2.72,2.84,3.62,3.74,4.25],launches:[2.2,3.1,3.73]},
};
export const SHOWCASE=['aura','attack','skill','ultimate'];
export function makePlan({mode='aura',cancelAt=null,targetLostAt=null}={}){if(!MODES[mode])throw Error('Unknown mode');const stops=[cancelAt,targetLostAt].filter(Number.isFinite);return{mode,...MODES[mode],stop:stops.length?Math.min(...stops):null};}
export function sample(plan,time){const t=clamp(time,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;let key='ready';
 if(!cancelled&&!done){if(plan.mode==='attack'||plan.mode==='skill'){const launches=plan.launches;key=t<launches[0]?'brace':'ready';for(const at of launches){if(t>=at-.12&&t<at)key='brace';if(t>=at&&t<at+.13)key='recoil';}}
 if(plan.mode==='ultimate')key=t<1.75?'commandPoint':t<4.5?'commandFire':'ready';}
 return{time:t,pose:{key,frame:0},cancelled,done,label:cancelled?'연출 중단 · 원위치 복귀':plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'',contacts:cancelled?[]:plan.contacts.filter(at=>t>=at&&t-at<.22).map(at=>({at,age:t-at}))};}
