import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from './equipment-forge-release-v1.mjs';

export const defaultDefenseReward=()=>({coin:0,masterStars:0,items:[]});
export const defenseRewardItemRule=item=>({chancePercent:item.chancePercent??100,minQuantity:item.minQuantity??item.quantity,maxQuantity:item.maxQuantity??item.quantity});
export const hasDefenseReward=r=>!!r&&(r.coin>0||r.masterStars>0||r.items?.some(i=>defenseRewardItemRule(i).chancePercent>0));
export function defenseRewardItemLabel(item){
 const r=defenseRewardItemRule(item),quantity=r.minQuantity===r.maxQuantity?r.minQuantity.toLocaleString():`${r.minQuantity.toLocaleString()}~${r.maxQuantity.toLocaleString()}`;
 return `${quantity}개${r.chancePercent===100?' · 확정':` · ${r.chancePercent}% 확률`}`;
}
export function validateDefenseReward(raw){
 const fail=message=>{throw Object.assign(Error(message),{status:400,code:'DEFENSE_REWARDS'});};
 const integer=(n,max,label)=>{if(!Number.isSafeInteger(n)||n<0||n>max)fail(`${label}: 0~${max.toLocaleString()} 정수를 입력하세요.`);return n;};
 if(!raw||!Array.isArray(raw.items)||raw.items.length>20)fail('난이도별 보상 아이템은 최대 20종입니다.');
 const codes=new Set(),items=raw.items.map(item=>{
  if(!item||typeof item.code!=='string'||! /^[A-Z][A-Z0-9_]{0,79}$/.test(item.code)||['MASTER_STAR',EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE].includes(item.code)||codes.has(item.code))fail('중복되지 않는 지급 가능 아이템을 선택하세요. 마스터의 별은 별도로 입력하세요.');
  codes.add(item.code);const {chancePercent,minQuantity,maxQuantity}=defenseRewardItemRule(item);
  if(!Number.isFinite(chancePercent)||chancePercent<0||chancePercent>100||Math.abs(chancePercent*100-Math.round(chancePercent*100))>1e-8)fail('아이템 지급 확률은 0~100%, 소수점 둘째 자리까지 입력하세요.');
  integer(minQuantity,100000,'최소 수량');integer(maxQuantity,100000,'최대 수량');
  if(minQuantity<1||maxQuantity<minQuantity)fail('최소 수량은 1개 이상, 최대 수량은 최소 수량 이상이어야 합니다.');
  if(item.quantity!==undefined&&(item.quantity!==minQuantity||item.quantity!==maxQuantity))fail('고정 수량과 수량 범위를 함께 지정할 수 없습니다.');
  // Keep existing fixed policies byte-for-byte compatible after validation.
  return chancePercent===100&&minQuantity===maxQuantity?{code:item.code,quantity:minQuantity}:{code:item.code,chancePercent:Math.round(chancePercent*100)/100,minQuantity,maxQuantity};
 });
 return {coin:integer(raw.coin,1000000000000,'코인'),masterStars:integer(raw.masterStars,10000000,'마스터의 별'),items};
}
export function freezeDefenseReward(settings,difficulty,practice=false){
 const row=settings.difficulties.find(d=>d.id===difficulty),reward=validateDefenseReward(row?.clearReward||defaultDefenseReward());
 const rollSeed=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 return {version:2,rollSeed,mode:settings.mode,enabled:settings.mode==='ON'&&!practice&&settings.rewardsEnabled&&hasDefenseReward(reward),settingsRevision:settings.revision,difficulty,...structuredClone(reward)};
}
