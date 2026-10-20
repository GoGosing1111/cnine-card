import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from './equipment-forge-release-v1.mjs';

export const defaultDefenseReward=()=>({coin:0,masterStars:0,items:[]});
export const hasDefenseReward=r=>!!r&&(r.coin>0||r.masterStars>0||r.items?.length>0);
export function validateDefenseReward(raw){
 const fail=message=>{throw Object.assign(Error(message),{status:400,code:'DEFENSE_REWARDS'});};
 const integer=(n,max,label)=>{if(!Number.isSafeInteger(n)||n<0||n>max)fail(`${label}: 0~${max.toLocaleString()} 정수를 입력하세요.`);return n;};
 if(!raw||!Array.isArray(raw.items)||raw.items.length>20)fail('난이도별 보상 아이템은 최대 20종입니다.');
 const codes=new Set(),items=raw.items.map(item=>{
  if(!item||typeof item.code!=='string'||! /^[A-Z][A-Z0-9_]{0,79}$/.test(item.code)||['MASTER_STAR',EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE].includes(item.code)||codes.has(item.code))fail('중복되지 않는 지급 가능 아이템을 선택하세요. 마스터의 별은 별도로 입력하세요.');
  codes.add(item.code);const quantity=integer(item.quantity,100000,'아이템 수량');if(!quantity)fail('아이템 수량은 1개 이상이어야 합니다.');return {code:item.code,quantity};
 });
 return {coin:integer(raw.coin,1000000000000,'코인'),masterStars:integer(raw.masterStars,10000000,'마스터의 별'),items};
}
export function freezeDefenseReward(settings,difficulty,practice=false){
 const row=settings.difficulties.find(d=>d.id===difficulty),reward=validateDefenseReward(row?.clearReward||defaultDefenseReward());
 return {version:1,mode:settings.mode,enabled:settings.mode==='ON'&&!practice&&settings.rewardsEnabled&&hasDefenseReward(reward),settingsRevision:settings.revision,difficulty,...structuredClone(reward)};
}
