import {EQUIPMENT_POWER_STANDARD} from './equipment-mercenary-power-v1.mjs';
export const FORGE_ADVANCED_KEY='equipment_forge_advanced_policy_v1';
export const FORGE_MAX_LEVEL=15;
export const FORGE_SCROLL_ITEMS=Object.freeze([
 Object.freeze({code:'WEAPON_ENHANCEMENT_SCROLL',name:'무기 강화주문서',subtitle:'WEAPON ENHANCEMENT',image:'assets/items/weapon-enhancement-scroll-v1.webp',slot:'WEAPON'}),
 Object.freeze({code:'ARMOR_ENHANCEMENT_SCROLL',name:'방어구 강화주문서',subtitle:'ARMOR ENHANCEMENT',image:'assets/items/armor-enhancement-scroll-v1.webp',slot:'ARMOR'})
]);
export const forgeScrollForSlot=slot=>FORGE_SCROLL_ITEMS[slot==='WEAPON'?0:1];
export const FORGE_ADVANCED_FIELDS=Object.freeze([
 ['successPpm','성공률 (%)',10,100,'percent'],
 ['maintainPpm','유지율 (%)',0,100,'percent'],
 ['destroyPpm','파괴율 (%)',0,100,'percent'],
 ['coinCost','코인',1,1e12,'integer'],
 ['itemQuantity','마스터의 별',1,Number.MAX_SAFE_INTEGER,'integer'],
 ['scrollQuantity','강화주문서 (장)',1,10000,'integer'],
 ['protectionQuantity','보호권 (장, 0=사용 불가)',0,10000,'integer'],
 ['powerBonusPercent','기본 전투력 대비 증가 (%)',121,100000,'integer']
]);
export function forgeAdvancedDraft(){return {schemaVersion:1,revision:0,steps:Array.from({length:5},(_,i)=>({level:i+10,...Object.fromEntries(FORGE_ADVANCED_FIELDS.map(([key])=>[key,null]))}))};}
export function validateForgeAdvanced(raw){
 const fail=message=>{throw Object.assign(Error(message),{code:'FORGE_ADVANCED_POLICY',status:400});};
 if(!raw||raw.schemaVersion!==1||!Number.isSafeInteger(raw.revision)||raw.revision<0||raw.revision>=2147483647||!Array.isArray(raw.steps)||raw.steps.length!==5)fail('고급 강화 정책 버전과 +11~+15 단계를 확인하세요.');
 let previousBonus=120;
 const steps=raw.steps.map((row,i)=>{
  if(!row||row.level!==i+10)fail('고급 강화 단계 순서를 확인하세요.');
  const next={level:i+10};
  for(const [key,label,min,max,type] of FORGE_ADVANCED_FIELDS){
   const v=row[key],factor=type==='percent'?10000:1;
   if(v!==null&&(!Number.isSafeInteger(v)||v<min*factor||v>max*factor))fail('+'+(i+11)+' '+label+' 범위를 확인하세요.');
   next[key]=v;
  }
  const rates=[next.successPpm,next.maintainPpm,next.destroyPpm],sum=rates.reduce((a,b)=>a+(b??0),0);
  if(sum>1000000||rates.every(v=>v!==null)&&sum!==1000000)fail('+'+(i+11)+' 확률 합계는 100%여야 합니다.');
  if(next.powerBonusPercent!==null){if(next.powerBonusPercent<=previousBonus)fail('단계별 전투력 증가율은 앞 단계보다 커야 합니다.');previousBonus=next.powerBonusPercent;}
  return next;
 });
 return {schemaVersion:1,revision:raw.revision,steps};
}
export function forgeAdvancedReadiness(policy){
 return policy.steps.map((step,i)=>{
  const missing=FORGE_ADVANCED_FIELDS.filter(([key])=>step[key]===null).map(([,label])=>label);
  if(policy.steps.slice(0,i).some(row=>row.powerBonusPercent===null))missing.push('이전 단계 전투력');
  return {level:step.level,targetLevel:step.level+1,ready:missing.length===0,missing};
 });
}
export function forgePowerBonuses(advanced){
 return [...EQUIPMENT_POWER_STANDARD.bonusPercentByLevel,...(advanced?.steps??forgeAdvancedDraft().steps).map(row=>row.powerBonusPercent)];
}
