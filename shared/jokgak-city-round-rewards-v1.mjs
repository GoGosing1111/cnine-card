export const CITY_ROUND_REWARD_MAX_COIN=5_000_000_000_000;
export const defaultCityRoundRewards=()=>({
  participation:{enabled:false,minAttacks:0,coin:0,items:[]},
  top5:{enabled:false,ranks:Array.from({length:5},(_,i)=>({rank:i+1,coin:0,items:[]}))}
});
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const fail=message=>{throw Object.assign(Error(message),{code:'CITY_POLICY',status:400});};
export const hasCityRoundReward=row=>row.coin>0||row.items.length>0;
export function validateCityRoundRewards(value=defaultCityRoundRewards()){
  if(!object(value,['participation','top5']))fail('회차 보상 설정을 확인하세요.');
  const {participation,top5}=value;
  if(!object(participation,['enabled','minAttacks','coin','items'])||typeof participation.enabled!=='boolean'||!integer(participation.minAttacks,0,100000))fail('참여 보상의 최소 공격 횟수는 0~10만 회 정수입니다.');
  if(!object(top5,['enabled','ranks'])||typeof top5.enabled!=='boolean'||!Array.isArray(top5.ranks)||top5.ranks.length!==5)fail('현금 TOP 5의 1~5위 보상을 모두 설정하세요.');
  const rows=[participation,...top5.ranks];
  for(const [i,row] of rows.entries()){
    if(i&&(!object(row,['rank','coin','items'])||row.rank!==i))fail('현금 TOP 5 순위는 1~5위 순서입니다.');
    if(!integer(row.coin,0,CITY_ROUND_REWARD_MAX_COIN)||!Array.isArray(row.items)||row.items.length>5)fail('회차 보상 코인은 0~5조, 아이템은 최대 5종입니다.');
    if(row.items.some(x=>!object(x,['code','quantity'])||typeof x.code!=='string'||!/^[A-Z0-9_:-]{1,100}$/.test(x.code)||!integer(x.quantity,1,1000000))||new Set(row.items.map(x=>x.code)).size!==row.items.length)fail('회차 보상 아이템의 코드·중복·수량(1~100만)을 확인하세요.');
  }
  if(participation.enabled&&(participation.minAttacks<1||!hasCityRoundReward(participation)))fail('참여 보상을 켜려면 최소 공격 횟수를 1회 이상, 코인 또는 아이템을 입력하세요.');
  if(top5.enabled&&!top5.ranks.some(hasCityRoundReward))fail('현금 TOP 5를 켜려면 한 순위 이상에 보상을 입력하세요.');
  return structuredClone(value);
}
// Competition ranking preserves the city's existing joint-first convention.
export function rankCityRoundCandidates(candidates){
  const sorted=[...candidates].sort((a,b)=>b.cash-a.cash||a.id-b.id);let rank=0,last;
  return sorted.map((row,i)=>{if(i===0||row.cash!==last)rank=i+1;last=row.cash;return {...row,rank};});
}
