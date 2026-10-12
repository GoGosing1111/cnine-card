import {COOP_DIFFICULTIES} from './cooperative-battleground-v1.mjs';
import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from './equipment-forge-release-v1.mjs';

export const COOP_REWARD_DAILY_LIMIT=3;
export const COOP_SETTINGS_KEY='cooperative_battleground_settings_v1';
export const defaultCoopRewards=()=>({enabled:false,dailyLimit:COOP_REWARD_DAILY_LIMIT,difficulties:COOP_DIFFICULTIES.map(d=>({id:d.id,coin:0,masterStars:0,items:[]}))});
const fail=message=>{throw Object.assign(Error(message),{code:'COOP_REWARDS',status:400});};
const integer=(v,max,label)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail(`${label}: 0~${max.toLocaleString()} 사이의 정수를 입력하세요.`);return v;};
export const hasCoopReward=row=>!!row&&(row.coin>0||row.masterStars>0||row.items?.length>0);
export function validateCoopRewards(value){
 if(!value||typeof value.enabled!=='boolean'||value.dailyLimit!==COOP_REWARD_DAILY_LIMIT||!Array.isArray(value.difficulties)||value.difficulties.length!==3)fail('격전지 보상은 전체 난이도 통합 하루 3회입니다.');
 const difficulties=value.difficulties.map((row,i)=>{
  if(row?.id!==COOP_DIFFICULTIES[i].id||!Array.isArray(row.items)||row.items.length>20)fail('난이도별 보상 아이템은 최대 20종입니다.');
  const codes=new Set();
  const items=row.items.map(item=>{
   if(!item||typeof item.code!=='string'||! /^[A-Z][A-Z0-9_]{0,79}$/.test(item.code)||['MASTER_STAR',EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE].includes(item.code)||codes.has(item.code))fail('중복되지 않는 지급 가능 아이템을 선택하세요. 마별은 별도 금액에 입력하세요.');
   codes.add(item.code);const quantity=integer(item.quantity,100000,'아이템 수량');if(!quantity)fail('아이템 수량은 1개 이상이어야 합니다.');return {code:item.code,quantity};
  });
  return {id:row.id,coin:integer(row.coin,1000000000000,'코인'),masterStars:integer(row.masterStars,10000000,'마스터의 별'),items};
 });
 if(value.enabled&&!difficulties.some(hasCoopReward))fail('보상을 켜려면 한 난이도 이상에 지급할 보상을 입력하세요.');
 return {enabled:value.enabled,dailyLimit:COOP_REWARD_DAILY_LIMIT,difficulties};
}
export function coopRewardDay(at=Date.now()){
 const day=new Date(at+9*3600000).toISOString().slice(0,10);
 return {day,resetAt:Date.parse(day+'T00:00:00+09:00')+86400000,limit:COOP_REWARD_DAILY_LIMIT};
}
export function freezeCoopReward(settings,difficulty){
 const rewards=validateCoopRewards(settings.rewards??defaultCoopRewards()),row=rewards.difficulties.find(d=>d.id===difficulty);
 return {version:1,mode:settings.mode,enabled:settings.mode==='ON'&&rewards.enabled&&hasCoopReward(row),settingsRevision:settings.revision,...structuredClone(row),dailyLimit:COOP_REWARD_DAILY_LIMIT};
}
