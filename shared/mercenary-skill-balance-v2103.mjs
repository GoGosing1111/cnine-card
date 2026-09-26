import {validateMercenaryCms} from './mercenary-cms-model-v1.mjs';
import {MERCENARY_SKILL_BALANCE_V2097} from './mercenary-skill-balance-v2097.mjs';

// One explicitly authorized CMS update. Runtime reads the saved CMS document;
// importing this proposal never replaces a later operator edit.
const values={
 'MS-001':[2.2,4,20],'MS-008':[2.8,4,25],'MS-009':[4.5,5,30],
 'MS-010':[2.8,4,25],'MS-011':[3,4,25],'MS-022':[3.2,4,25],
 'MS-036':[3.6,5,30],'MS-037':[3.8,5,30],'MS-040':[4.2,5,25],
 'MS-021':[5.6,5,35],'MS-003':[0,3,15],'MS-004':[3.8,3,20],
 'MS-006':[2.5,4,20],'MS-005':[4.2,5,25],'MS-013':[0,3,20],
 'MS-015':[3.2,4,20],'MS-016':[0,3,20],'MS-018':[3.2,4,25],
 'MS-023':[2.2,3,20],'MS-025':[3.4,5,25],'MS-027':[2.8,4,20],
 'MS-028':[3,4,25],'MS-032':[2.8,4,25],'MS-038':[2,3,20],
 'MS-042':[2.4,3,20],'MS-043':[3.6,4,25]
};
export const MERCENARY_SKILL_BALANCE_V2103=Object.freeze(MERCENARY_SKILL_BALANCE_V2097.map(({id,mechanic})=>{
 const [damageRatio,cooldownTurns,cost]=values[id];return Object.freeze({id,mechanic,balance:Object.freeze({damageRatio,cooldownTurns,cost})});
}));
export function applyMercenaryBalanceV2103(document,catalog){
 const result=structuredClone(document);
 if(result.skills.filter(s=>!['MS-044','MS-045','MS-046','MS-047','MS-048','MS-049','MS-050','MS-051'].includes(s.id)).length!==MERCENARY_SKILL_BALANCE_V2103.length)throw Error('스킬 목록이 변경됐습니다. 새 목록을 확인하세요.');
 for(const proposal of MERCENARY_SKILL_BALANCE_V2103){
  const skill=result.skills.find(s=>s.id===proposal.id);
  if(!skill||skill.mechanic!==proposal.mechanic)throw Error(`${proposal.id}: 기존 스킬 기믹을 확인하세요.`);
  skill.balance={...proposal.balance};skill.review='REVIEWED';
 }
 return validateMercenaryCms(result,catalog);
}
