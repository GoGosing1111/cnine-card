export const MODES=Object.freeze({
 ready:{label:'준비 자세',description:'승인된 키·비율 · 수평 견착 · 황금 전신 아우라',duration:3.2,shots:[]},
 recoil:{label:'발사 자세',description:'발밑 원형 연기 · 기립 후방 반동 · 명중 시 작은 황금 타격 표식',duration:3.35,shots:[.55]},
 attack:{label:'대물 관통탄',description:'거대한 대물탄 · 강한 탄착 · 머리 위 황금 원숭이 타격 표식',duration:3.55,shots:[.75]},
 barrage:{label:'제압 사격',description:'세 차례 대물탄 · 전열 제압 · 명중마다 황금 타격 표식',duration:5.55,shots:[.8,1.55,2.3]},
 breaker:{label:'황금 파쇄탄',description:'무거운 파쇄탄 · 강한 반동 · 넓은 황금 충격면',duration:5.8,shots:[1.25]},
 critical:{label:'황금 낙인탄',description:'단일 급소 관통 · 강한 넉백 · 머리 위 황금 원숭이 낙인',duration:3.5,shots:[1.05],travel:.17,newCandidate:true},
 sabotage:{label:'초고속 철갑탄',description:'정밀 견착 · 수평 고속 관통 · 지연 파열',duration:5,shots:[1.1],travel:.28,newCandidate:true},
 airburst:{label:'공중 산개탄',description:'대구경 탄두 공중 분리 · 다섯 갈래 탄우 · 순차 폭발',duration:6.5,shots:[1.2],travel:.65,newCandidate:true},
 artillery:{label:'M777 야포단',description:'M777 155mm 3문 · 포구 화염 · 연속 탄착 폭발',duration:8.4,shots:[1.55,4.7]},
 ultimate:{label:'황금 함대 · 종결 포격',description:'황금 코어 전함 · 4개 포탑 연속 일제 사격 · 적 전열 집중 폭격',duration:11.6,shots:[1.55,6.7],newCandidate:true},
 hit:{label:'피격 넉백',description:'키와 비율을 유지한 기립 후방 이동',duration:2.2,shots:[]}
});
export const CANDIDATES=['critical','ultimate','sabotage','airburst','artillery','breaker','barrage','attack'];
export const SHOWCASE=['critical','ultimate','sabotage','airburst','artillery','breaker'];
export const HIT_MARK_WIDTH=88;
export const CRITICAL_HIT=Object.freeze({target:0,targetCount:1,hitWidth:290,hitDuration:.82,knockback:118,knockbackDuration:1.15,markDelay:.24,markDuration:1.1,markWidth:HIT_MARK_WIDTH});
export const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
export function impulse(time,start,duration=.6){
 const t=(time-start)/duration;if(t<=0||t>=1)return 0;
 if(t<.09)return Math.sin(t/.09*Math.PI/2);
 return Math.pow(1-(t-.09)/.91,2);
}
export function recoilSlide(time,start){
 const t=time-start;if(t<=0||t>=.72)return 0;
 if(t<.08)return 1-Math.pow(1-t/.08,3);
 if(t<.19)return 1;
 const r=(t-.19)/.53;return 1-r*r*(3-2*r);
}
export function makePlan({mode='ultimate',stop=null}={}){
 if(!MODES[mode])throw Error('Unknown mode');const m=MODES[mode];
 const shots=m.shots.map((fire,index)=>({fire,impact:fire+(m.travel??.48),index}));
 const area=['barrage','breaker','sabotage','airburst','artillery','ultimate'].includes(mode);
 const battery=mode==='artillery'?[1.8,1.98,2.16,3.1,3.28,3.46].map((fire,index)=>({index,gun:index%3,fire,impact:fire+1.02,target:[0,2,4,1,3,2][index]})):[];
 const naval=mode==='ultimate'?Array.from({length:40},(_,index)=>{const volley=Math.floor(index/8),barrel=index%8,fire=[1.9,3.25,4.6,5.95,7][volley]+Math.floor(barrel/2)*.075+(barrel%2)*.035;return {index,volley,barrel,fire,impact:fire+.4+(barrel%3)*.04,target:(index*3)%5};}):[];
 const fragments=mode==='airburst'?Array.from({length:5},(_,index)=>({index,fire:1.95+index*.055,impact:2.58+index*.18,target:index})):[];
 const finale=mode==='artillery'?5.18:mode==='ultimate'?8.35:null;
 let events=mode==='ultimate'?[[0,'황금 코어 충전'],[.45,'후방 무장 전함 출현'],[1.55,'제너럴 족 · 개시 사격'],[1.9,'포탑 일제 사격 · 제1파'],[3.25,'포탑 일제 사격 · 제2파'],[4.6,'포탑 일제 사격 · 제3파'],[5.95,'포탑 일제 사격 · 제4파'],[7,'포탑 일제 사격 · 제5파'],[8.35,'적 전열 · 집중 폭쇄'],[9.8,'전함 퇴장 · 잔연 소멸']]
  :mode==='artillery'?[[0,'기존 M777 야포단 비교'],[.3,'155mm 3문 전개'],[1.8,'제1차 일제 포격'],[3.1,'제2차 집중 포격'],[5.18,'전열 전체 대폭발']]
  :mode==='sabotage'?[[0,'철갑탄 장전 · 정밀 견착'],[1.1,'초고속 철갑탄 발사 · 기립 반동'],[1.38,'전열 수평 관통'],[1.55,'지연 파열 · 연속 충격'],[2.65,'탄도 잔광 소멸']]
  :mode==='airburst'?[[0,'산개탄 장전'],[1.2,'대구경 탄두 발사'],[1.85,'공중 분리 · 다섯 갈래 탄우'],[2.58,'순차 탄착 · 지면 폭발'],[4.3,'화염과 연무 소멸']]
  :mode==='breaker'?[[0,'파쇄탄 장전'],[.25,'수평 견착 · 사격 준비'],[1.25,'초대형 파쇄탄 발사'],[1.73,'관통 충격면 · 전열 넉백'],[2.2,'황금 파편 · 잔류 폭발']]
  :mode==='critical'?[[0,'단일 급소 조준'],[.3,'총구 집중 · 황금 섬광'],[1.05,'낙인탄 발사 · 기립 반동'],[1.22,'1인 급소 관통 · 강한 넉백'],[1.46,'머리 위 원숭이 낙인'],[2.56,'낙인 잔광 소멸']]
  :mode==='hit'?[[0,'기립 자세'],[.5,'후방 넉백'],[1.2,'원위치 복귀']]
  :[[0,'황금 아우라 · 수평 견착'],...shots.flatMap(s=>[[s.fire,'수평 발사 · 발밑 원형 연기'],[s.fire+.045,'총구 들림 · 강한 후방 반동'],[s.impact,area?'황금 연쇄 폭발':'탄착 폭발']])];
 let hitMarks=[];
 // End each ordinary hit's own blast with the small head mark. It is not
 // an ultimate finisher, and the bright impact must not swallow the face.
 if(mode==='critical')hitMarks=[{at:shots[0].impact+CRITICAL_HIT.markDelay,target:0,duration:CRITICAL_HIT.markDuration,critical:true}];
 else if(mode==='sabotage')hitMarks=Array.from({length:5},(_,target)=>({at:1.55+target*.1+1.37,target}));
 else if(mode==='airburst')hitMarks=fragments.map(f=>({at:f.impact+1.57,target:f.target}));
 else if(mode==='breaker')hitMarks=Array.from({length:5},(_,target)=>({at:shots[0].impact+target*.13+2.47,target}));
 else if(!['ultimate','artillery'].includes(mode))hitMarks=shots.flatMap(s=>Array.from({length:area?5:1},(_,target)=>({at:s.impact+target*.035+(area?1.14:.88),target})));
 if(mode!=='critical')for(const mark of hitMarks.filter(x=>x.target===0))events.push([mark.at,'일반 스킬 명중 · 머리 위 타격 표식']);
 events.push([m.duration,'준비 자세 복귀']);
 events.sort((a,b)=>a[0]-b[0]);
 return {mode,label:m.label,duration:m.duration,shots,area,targetCount:area?5:1,stop,battery,naval,fragments,finale,hitMarks,markAt:hitMarks[0]?.at??null,
  contacts:mode==='ultimate'?[...naval.map(s=>s.impact),finale]:mode==='artillery'?[...battery.map(s=>s.impact),finale]:mode==='airburst'?fragments.map(s=>s.impact):shots.map(s=>s.impact),events};
}
export function sample(plan,time){
 const t=clamp(time,0,plan.duration),cancelled=Number.isFinite(plan.stop)&&t>=plan.stop,done=t>=plan.duration;
 const recoil=cancelled||done?0:plan.shots.reduce((a,s)=>a+recoilSlide(t,s.fire),0);
 const hit=plan.mode==='hit'&&!cancelled&&!done?impulse(t,.5,.9):0;
 const pose=!cancelled&&!done&&plan.shots.some(s=>t-s.fire>=.045&&t-s.fire<.34)?'fire':'ready';
 const distance={ultimate:156,artillery:156,breaker:148,critical:148,sabotage:154,airburst:140,barrage:122}[plan.mode]||104;
 return {time:t,cancelled,done,recoil,hit,pose,offsetX:-(recoil*distance+hit*70)||0,offsetY:0,rotation:0,
  label:cancelled?'동작 중단 · 원위치':done?'복귀 완료':plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||plan.label};
}
