import {CITY_ROLES,cityShift} from './jokgak-city-v1.mjs';
import {CITY_CASH_MAX,ensureCityCash,changeCityCash} from './jokgak-city-cash-v1.mjs';
import {cityArmory} from './jokgak-city-expansion-v1.mjs';
export const CITY_HOUR=3600000;
export const CITY_JOBS=Object.freeze([
 {code:'SORT',name:'우편물 분류',role:null,location:'POST',kind:'알바',cash:500},
 {code:'DELIVERY',name:'시장 물품 배달',role:null,location:'MARKET',kind:'알바',cash:500},
 {code:'RETAIL',name:'매장 근무',role:'CITIZEN',location:'DEPARTMENT',kind:'정규 근무',cash:600},
 {code:'RECYCLE',name:'재활용품 수거',role:'BEGGAR',location:'ALLEY',kind:'정규 근무',cash:400},
 {code:'PATROL',name:'관할 구역 순찰',role:'POLICE',location:'POLICE',kind:'정규 근무',cash:900},
 {code:'WARD',name:'병동 지원',role:'NURSE',location:'HOSPITAL',kind:'정규 근무',cash:750},
 {code:'CLINIC',name:'외래 진료',role:'DOCTOR',location:'HOSPITAL',kind:'정규 근무',cash:1200},
 {code:'DOCK_WORK',name:'항만 물류 관리',role:'GANG',location:'DOCK',kind:'정규 근무',cash:750},
 {code:'ALLEY_WORK',name:'거리 정비',role:'VANDAL',location:'ALLEY',kind:'정규 근무',cash:450}
]);
export const CITY_POLICE_RANKS=Object.freeze([{code:'OFFICER',name:'순경',merit:0},{code:'CORPORAL',name:'경장',merit:3},{code:'SERGEANT',name:'경사',merit:8},{code:'LIEUTENANT',name:'경위',merit:15}]);
export function defaultCityCareer(){return {enabled:false,startedAt:0,resetCash:10000,rates:CITY_ROLES.map((r,i)=>({code:r.code,cash:[2000,1000,3000,2500,4000,2500,1500][i]})),jobsEnabled:true,jobs:CITY_JOBS.map(j=>({code:j.code,enabled:true,cash:j.cash,durationMs:300000,cooldownMs:60000})),police:{workMerit:1,arrestMerit:2,ranks:CITY_POLICE_RANKS.map(({code,merit})=>({code,merit}))}};}
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function validateCityCareer(value=defaultCityCareer()){
 const fail=()=>{throw Object.assign(Error('직업 수입·교대 초기화·일거리·경찰 직급 설정을 확인하세요.'),{status:400,code:'CITY_CAREER_POLICY'});};
 if(!shape(value,['enabled','startedAt','resetCash','rates','jobsEnabled','jobs','police'])||typeof value.enabled!=='boolean'||typeof value.jobsEnabled!=='boolean'||!integer(value.startedAt,0,Number.MAX_SAFE_INTEGER)||!integer(value.resetCash,0,1000000000))fail();
 if(!Array.isArray(value.rates)||value.rates.length!==7||new Set(value.rates.map(r=>r?.code)).size!==7)fail();
 for(const r of value.rates)if(!shape(r,['code','cash'])||!CITY_ROLES.some(x=>x.code===r.code)||!integer(r.cash,0,100000000))fail();
 if(!Array.isArray(value.jobs)||value.jobs.length!==CITY_JOBS.length||new Set(value.jobs.map(j=>j?.code)).size!==CITY_JOBS.length)fail();
 for(const j of value.jobs)if(!shape(j,['code','enabled','cash','durationMs','cooldownMs'])||!CITY_JOBS.some(x=>x.code===j.code)||typeof j.enabled!=='boolean'||!integer(j.cash,0,100000000)||!integer(j.durationMs,60000,3600000)||!integer(j.cooldownMs,0,3600000))fail();
 if(!shape(value.police,['workMerit','arrestMerit','ranks'])||!integer(value.police.workMerit,0,100)||!integer(value.police.arrestMerit,0,100)||!Array.isArray(value.police.ranks)||value.police.ranks.length!==4)fail();
 value.police.ranks.forEach((r,i)=>{if(!shape(r,['code','merit'])||r.code!==CITY_POLICE_RANKS[i].code||!integer(r.merit,0,100000)||i===0&&r.merit!==0||i>0&&r.merit<=value.police.ranks[i-1].merit)fail();});
 return structuredClone(value);
}
export function validateCityCareerState(life){
 if(life.careers==null)return;
 if(!shape(life.careers,['TEST','ON']))throw Error('CITY_CAREER_STATE');
 for(const mode of ['TEST','ON']){
  const c=life.careers[mode];if(c==null)continue;
  if(!integer(c.epoch,0,Number.MAX_SAFE_INTEGER)||!integer(c.cursor,0,Number.MAX_SAFE_INTEGER)||!integer(c.merit,0,100000)||!integer(c.income,0,CITY_CASH_MAX)||!integer(c.jobIncome,0,CITY_CASH_MAX)||!integer(c.nextWorkAt,0,Number.MAX_SAFE_INTEGER)||typeof c.employed!=='boolean')throw Error('CITY_CAREER_STATE');
  if(c.work&&(!CITY_JOBS.some(j=>j.code===c.work.code)||!integer(c.work.endsAt,0,Number.MAX_SAFE_INTEGER)||!integer(c.work.cash,0,100000000)||!integer(c.work.cooldownMs,0,3600000)||!integer(c.work.merit,0,100)))throw Error('CITY_WORK_STATE');
 }
}
const newCareer=(at)=>({epoch:cityShift(at).id,cursor:at,employed:false,work:null,merit:0,income:0,jobIncome:0,nextWorkAt:0,lastPay:null});
export function cityPoliceRank(career,policy){
 const merit=career?.merit||0,ranks=policy.career?.police?.ranks||defaultCityCareer().police.ranks;
 const index=ranks.findLastIndex(r=>merit>=r.merit),rank=CITY_POLICE_RANKS[Math.max(0,index)];
 return {...rank,merit,next:index<3?{...CITY_POLICE_RANKS[index+1],merit:ranks[index+1].merit}:null};
}
// A six-hour round is the maximum offline accounting window: everything from
// older rounds is discarded before the current occupation's income accrues.
export function projectCityCareer(state,life,now,policy){
 const cfg=policy.career,mode=policy.mode;if(!cfg?.enabled||!['TEST','ON'].includes(mode)||cfg.startedAt>now)return;
 const wallet=ensureCityCash(life,policy,now);life.careers??={TEST:null,ON:null};
 let c=life.careers[mode];if(!c)c=life.careers[mode]=newCareer(Math.max(wallet.openedAt,cfg.startedAt));
 const shift=cityShift(now);
 if(c.epoch!==shift.id){
  wallet.balance=cfg.resetCash;life.bags[mode]={};Object.assign(cityArmory(life,mode),{owned:[],equipped:null});
  c=life.careers[mode]=newCareer(shift.startsAt);c.resetAt=shift.startsAt;
  if(life.begging?.mode===mode)life.begging=null;
 }
 const hours=Math.max(0,Math.floor((now-c.cursor)/CITY_HOUR)),rate=cfg.rates.find(r=>r.code===state.role).cash;
 if(hours){const amount=Math.min(hours*rate,CITY_CASH_MAX-wallet.balance);wallet.balance+=amount;c.income+=amount;c.cursor+=hours*CITY_HOUR;c.lastPay={at:c.cursor,amount,hours,role:state.role};}
 if(c.work&&(!state.active||state.location!==c.work.location||state.deadUntil>now||life.death&&!life.death.resolved||state.jailedUntil>now||c.work.role!==state.role))c.work=null;
}
export function applyCityCareerView(state,life,policy){
 const cfg=policy.career,c=life.careers?.[policy.mode];
 state.career=cfg?.enabled&&c?{...structuredClone(c),incomePerHour:cfg.rates.find(r=>r.code===state.role).cash,nextIncomeAt:c.cursor+CITY_HOUR,resetAt:cityShift(life.at).endsAt}:null;
 state.policeRank=state.role==='POLICE'?cityPoliceRank(c,policy):null;
 return state;
}
const fail=message=>{throw Object.assign(Error(message),{status:409,code:'CITY_WORK'});};
export function cityWorkAction({action,code,state,life,policy,now,requestId}){
 const cfg=policy.career,c=life.careers?.[policy.mode];if(!cfg?.enabled||!cfg.jobsEnabled||!c)fail('현재 일거리를 이용할 수 없습니다.');
 if(action==='workCancel'){if(!c.work)fail('진행 중인 근무가 없습니다.');c.work=null;return {kind:action};}
 if(action==='employment'){
  const job=CITY_JOBS.find(j=>j.role===state.role);if(state.location!==job.location)fail('직업 근무처로 이동한 뒤 취직 등록하세요.');if(c.employed)fail('이번 교대에 이미 취직 등록했습니다.');c.employed=true;return {kind:action,name:job.name};
 }
 if(state.nextActionAt>now)fail('행동 대기가 끝난 뒤 근무를 진행하세요.');
 if(action==='workFinish'){
  const w=c.work;if(!w)fail('진행 중인 근무가 없습니다.');if(now<w.endsAt)fail('아직 근무 시간이 남았습니다.');
  const cash=changeCityCash(life,policy,w.cash);c.work=null;c.jobIncome+=w.cash;c.nextWorkAt=now+w.cooldownMs;c.merit=Math.min(100000,c.merit+w.merit);state.nextActionAt=now+policy.life.serviceCooldownMs;
  return {kind:action,code:w.code,cash,merit:w.merit};
 }
 const meta=CITY_JOBS.find(j=>j.code===code),j=cfg.jobs.find(j=>j.code===code);
 if(!meta||!j?.enabled||meta.role&&meta.role!==state.role)fail('현재 직업이 할 수 있는 일거리를 선택하세요.');
 if(c.work)fail('진행 중인 근무를 마치거나 취소하세요.');if(c.nextWorkAt>now)fail('다음 근무 대기시간이 남았습니다.');
 if(state.location!==meta.location)fail('해당 근무처로 이동한 뒤 시작하세요.');if(meta.role&&!c.employed)fail('먼저 이번 직업의 취직 등록을 완료하세요.');
 if(now+j.durationMs>=cityShift(now).endsAt)fail('역할 교대까지 근무를 마칠 시간이 부족합니다.');
 c.work={id:requestId,code,role:state.role,location:meta.location,endsAt:now+j.durationMs,cash:j.cash,cooldownMs:j.cooldownMs,merit:state.role==='POLICE'&&meta.role==='POLICE'?cfg.police.workMerit:0};
 return {kind:'workStart',...c.work};
}
export function cancelCityWork(life,mode){if(life.careers?.[mode])life.careers[mode].work=null;}
