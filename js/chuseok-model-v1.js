export const CHUSEOK_KEY='chuseok_events_v1';
export const CHUSEOK_COIN='CHUSEOK_COIN';
export const CHUSEOK_ASSETS='/assets/ui/events/chuseok-v1/';
export const CHUSEOK_EVENTS=Object.freeze({songpyeon:'송편 고르기',envelope:'추석 떡값'});
export const CHUSEOK_RETIRED_ITEMS=Object.freeze(['PINGDU_OLD_AXE','PINGDU_WISH_TICKET']);
export const CHUSEOK_KINDS=Object.freeze({COIN:'코인',ITEM:'아이템',EQUIPMENT:'장비',MERCENARY:'용병',MISS:'꽝'});
const invalid=message=>{throw Error(message);};
function number(value,min,max,rate=false){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(!rate&&!Number.isSafeInteger(value))||(rate&&Math.abs(value*10000-Math.round(value*10000))>1e-6))invalid('수량·확률의 범위를 확인하세요. 확률은 소수점 4자리까지 입력할 수 있습니다.');
 return value;
}
function date(value){
 if(value===undefined||value===null||value==='')return null;
 const m=typeof value==='string'&&value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/);
 if(!m||!Number.isFinite(Date.parse(value))||+m[2]<1||+m[2]>12||+m[3]<1||+m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+(m[6]||0)>59)invalid('시간대가 포함된 올바른 일시를 입력하세요.');
 return new Date(value).toISOString();
}
export function cleanChuseokEvent(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('이벤트 설정 형식을 확인하세요.');
 if(raw.enabled!==undefined&&typeof raw.enabled!=='boolean')invalid('도전 ON/OFF 상태를 확인하세요.');
 const rewards=raw.rewards??[];
 if(!Array.isArray(rewards)||rewards.length>60)invalid('상품은 최대 60종까지 등록할 수 있습니다.');
 const ids=new Set();
 const s={enabled:raw.enabled===true,startsAt:date(raw.startsAt),endsAt:date(raw.endsAt),coinCost:number(raw.coinCost,1,1000000),dailyLimit:number(raw.dailyLimit,0,100000),rewards:rewards.map(r=>{
  if(!r||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(r.id)||ids.has(r.id))invalid('상품 ID가 잘못되었거나 중복되었습니다.');
  ids.add(r.id);
  if(!Object.hasOwn(CHUSEOK_KINDS,r.kind))invalid('상품 종류를 확인하세요.');
  const ref=['ITEM','EQUIPMENT','MERCENARY'].includes(r.kind)?String(r.ref||''):'';
  if(ref&&!/^[A-Za-z0-9_-]{1,100}$/.test(ref))invalid('상품 코드를 확인하세요.');
  if(CHUSEOK_RETIRED_ITEMS.includes(ref)||ref===CHUSEOK_COIN)invalid('종료된 아이템과 참가용 추석 코인은 보상으로 등록할 수 없습니다.');
  return {id:r.id,kind:r.kind,ref,amount:r.kind==='MISS'?null:number(r.amount,1,r.kind==='COIN'?Number.MAX_SAFE_INTEGER:r.kind==='ITEM'?1000000:1),rate:number(r.rate,0,100,true)};
 })};
 if(s.startsAt&&s.endsAt&&Date.parse(s.endsAt)<=Date.parse(s.startsAt))invalid('종료 일시는 시작 일시보다 뒤여야 합니다.');
 if(s.rewards.reduce((sum,r)=>sum+Math.round((r.rate??0)*10000),0)>1000000)invalid('상품과 꽝의 확률 합계는 100% 이하여야 합니다.');
 if(s.enabled&&!chuseokComplete(s))invalid('기간·코인 비용·일일 횟수·상품·100% 확률을 모두 설정해야 도전을 ON으로 저장할 수 있습니다.');
 return s;
}
export function cleanChuseokSettings(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('이벤트 설정 형식을 확인하세요.');
 if(raw.visible!==undefined&&typeof raw.visible!=='boolean')invalid('메뉴 공개 상태를 확인하세요.');
 const s={visible:raw.visible!==false,events:Object.fromEntries(Object.keys(CHUSEOK_EVENTS).map(k=>[k,cleanChuseokEvent(raw.events?.[k])]))};
 if(!s.visible&&Object.values(s.events).some(e=>e.enabled))invalid('도전을 ON으로 저장하려면 이벤트를 공개하세요.');
 return s;
}
export function chuseokComplete(s){
 return Boolean(s.startsAt&&s.endsAt&&s.coinCost&&s.dailyLimit!==null&&s.rewards.length&&s.rewards.every(r=>r.rate!==null&&(r.kind==='MISS'||r.amount!==null)&&(!['ITEM','EQUIPMENT','MERCENARY'].includes(r.kind)||r.ref))&&s.rewards.reduce((sum,r)=>sum+Math.round(r.rate*10000),0)===1000000&&s.rewards.some(r=>r.kind!=='MISS'&&r.rate>0));
}
export function chuseokPhase(s,visible=true,now=Date.now()){
 if(!visible)return 'HIDDEN';
 if(!chuseokComplete(s))return 'UNCONFIGURED';
 if(!s.enabled)return 'PAUSED';
 if(now<Date.parse(s.startsAt))return 'SCHEDULED';
 if(now>=Date.parse(s.endsAt))return 'ENDED';
 return 'OPEN';
}
export function pickChuseokReward(s,sample){
 if(!Number.isInteger(sample)||sample<0||sample>=1000000)invalid('잘못된 추첨 값입니다.');
 let n=sample;for(const r of s.rewards){n-=Math.round(r.rate*10000);if(n<0)return r;}
 invalid('확률 합계가 맞지 않습니다.');
}
