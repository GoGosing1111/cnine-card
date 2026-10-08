export const CHICKEN_KEY='pingdu_chicken_event_v1';
export const CHICKEN_TICKET='PINGDU_BAEMIN_TICKET';
export const CHICKEN_NAME='철구네 치킨';
export const CHICKEN_ASSETS='/assets/ui/events/chicken-v1/';
export const CHICKEN_CHOICES=Object.freeze({FRIED:'후라이드치킨',YANGNYEOM:'양념치킨'});
export function chickenDraft(){return {visible:false,enabled:false,startsAt:null,endsAt:null,rewards:[]};}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function cleanChickenSettings(raw=chickenDraft()){
 if(!exact(raw,['visible','enabled','startsAt','endsAt','rewards'])||typeof raw.visible!=='boolean'||typeof raw.enabled!=='boolean')throw Error('이벤트 설정 형식을 확인하세요.');
 const date=v=>{if(v===null||v==='')return null;const m=typeof v==='string'&&v.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/);if(!m||!Number.isFinite(Date.parse(v))||+m[2]<1||+m[2]>12||+m[3]<1||+m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+(m[6]||0)>59)throw Error('시간대를 포함한 올바른 날짜를 입력하세요.');return new Date(v).toISOString();};
 if(!Array.isArray(raw.rewards)||raw.rewards.length>200)throw Error('보상은 최대 200종까지 설정할 수 있습니다.');
 const seen=new Set();
 const rewards=raw.rewards.map(r=>{
  if(!exact(r,['kind','code','quantity','chancePpm'])||!['COIN','ITEM','MERCENARY','LIMITED'].includes(r.kind)||typeof r.code!=='string'||!/^[A-Z0-9_-]{1,96}$/.test(r.code))throw Error('등록된 보상을 선택하세요.');
  if(r.kind==='COIN'&&r.code!=='COIN'||['MERCENARY','LIMITED'].includes(r.kind)&&!/^V-\d{3}$/.test(r.code))throw Error('보상 코드를 확인하세요.');
  if(r.code===CHICKEN_TICKET||['PINGDU_OLD_AXE','PINGDU_WISH_TICKET','CHUSEOK_COIN'].includes(r.code))throw Error('참가권과 종료된 이벤트 재료는 사은품으로 설정할 수 없습니다.');
  const key=r.kind+':'+r.code;if(seen.has(key))throw Error('같은 보상을 중복 추가할 수 없습니다.');seen.add(key);
  if(!Number.isSafeInteger(r.quantity)||r.quantity<1||r.quantity>(r.kind==='COIN'?1000000000000000:1000000000)||['MERCENARY','LIMITED'].includes(r.kind)&&r.quantity!==1)throw Error('지급 수량을 확인하세요. 용병은 1장씩 지급합니다.');
  if(r.chancePpm!==null&&(!Number.isInteger(r.chancePpm)||r.chancePpm<0||r.chancePpm>1000000))throw Error('확률은 0~100%, 소수점 4자리까지 설정하세요.');
  return {...r};
 });
 const next={visible:raw.visible,enabled:raw.enabled,startsAt:date(raw.startsAt),endsAt:date(raw.endsAt),rewards};
 if(next.startsAt&&next.endsAt&&Date.parse(next.endsAt)<=Date.parse(next.startsAt))throw Error('종료 일시는 시작 일시보다 뒤여야 합니다.');
 if(rewards.reduce((sum,r)=>sum+(r.chancePpm??0),0)>1000000)throw Error('보상 확률 합계는 100% 이하여야 합니다.');
 if(next.enabled&&(!next.visible||!chickenComplete(next)))throw Error('기간과 보상 확률 합계 100%를 설정한 뒤 공개·운영 ON으로 저장하세요.');
 return next;
}
export function chickenComplete(s){return Boolean(s.startsAt&&s.endsAt&&s.rewards.length&&s.rewards.every(r=>r.chancePpm!==null)&&s.rewards.reduce((sum,r)=>sum+r.chancePpm,0)===1000000);}
export function chickenPhase(s,now=Date.now()){
 if(!s.visible)return 'HIDDEN';if(!chickenComplete(s))return 'UNCONFIGURED';if(!s.enabled)return 'PAUSED';
 if(now<Date.parse(s.startsAt))return 'SCHEDULED';if(now>=Date.parse(s.endsAt))return 'ENDED';return 'OPEN';
}
// The food choice is deliberately absent: both choices use the exact same pool.
export function pickChickenReward(settings,sample){
 if(!Number.isInteger(sample)||sample<0||sample>=1000000)throw Error('추첨 값을 확인하세요.');
 for(const r of settings.rewards){sample-=r.chancePpm;if(sample<0)return {...r};}throw Error('확률 합계가 100%가 아닙니다.');
}
