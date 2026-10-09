import {LIMITED_MERCENARIES} from './mercenary-limited-catalog-v1.mjs';
import {isLimitedRate,limitedRateUnits,LIMITED_RATE_TOTAL} from './mercenary-limited-rates-v1.mjs';
export const LIMITED_POLICY_KEY='mercenary_limited_draw_policy_v1';
export const LIMITED_RECEIPT_PREFIX='mercenary_limited_save:';
export function limitedPolicyDraft(){return {format:'MERCENARY_LIMITED_POLICY_V1',acquisitionEnabled:false,rankRatesPpm:{SS:null,SSS:null},cardWeights:Object.fromEntries(LIMITED_MERCENARIES.map(c=>[c.code,1])),notes:''};}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
// Catalog additions must not invalidate saved operator rates. New entries stay
// at zero until an operator saves an explicit weight; reading never writes DB.
export function readLimitedPolicy(value){
 const policy=structuredClone(value);
 if(policy?.cardWeights&&typeof policy.cardWeights==='object'&&!Array.isArray(policy.cardWeights)){
  for(const card of LIMITED_MERCENARIES)if(!Object.hasOwn(policy.cardWeights,card.code))policy.cardWeights[card.code]=0;
 }
 return validateLimitedPolicy(policy);
}
export function validateLimitedPolicy(value){
 if(!exact(value,['format','acquisitionEnabled','rankRatesPpm','cardWeights','notes'])||value.format!=='MERCENARY_LIMITED_POLICY_V1'||value.acquisitionEnabled!==false)throw Error('리미티드 획득은 잠금 상태로만 저장할 수 있습니다.');
 if(!exact(value.rankRatesPpm,['SS','SSS'])||Object.values(value.rankRatesPpm).some(n=>n!==null&&!isLimitedRate(n))||Object.values(value.rankRatesPpm).reduce((sum,n)=>sum+(n===null?0:limitedRateUnits(n)),0)>LIMITED_RATE_TOTAL)throw Error('SS·SSS 확률은 0.00000001% 단위, 미정 또는 합계 100% 이내로 설정하세요.');
 if(!exact(value.cardWeights,LIMITED_MERCENARIES.map(c=>c.code))||Object.values(value.cardWeights).some(n=>!Number.isSafeInteger(n)||n<0||n>1000000))throw Error('리미티드 전용 가중치는 0~1,000,000 정수로 설정하세요.');
 if(typeof value.notes!=='string'||value.notes.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.notes))throw Error('운영 메모는 2,000자 이내로 입력하세요.');
 return structuredClone(value);
}
