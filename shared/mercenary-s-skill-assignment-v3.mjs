import {expandMercenarySkillCatalog,validateMercenaryCms} from './mercenary-cms-model-v1.mjs';

// Explicit one-time operation only. Not imported by account, gameplay or seed
// initialization. Re-reading a catalog must never assign skills automatically.
export function prepareSSkillAssignments(document,defaults,catalog,plan) {
  if(plan?.authority!=='USER_REQUEST_S_SS_CREATE_AND_ASSIGN'||plan.runtimeEnabled!==false||plan.assignmentMode!=='APPEND_PRESERVE_EXISTING'||!Array.isArray(plan.targets))throw Error('명시적인 S·SS 제작·배정 계획이 필요합니다.');
  const result=expandMercenarySkillCatalog(document,defaults,catalog);
  const expected=result.mercenaries.filter(r=>['S','SS'].includes(r.rank));
  if(expected.length!==plan.targets.length||new Set(plan.targets.map(r=>r.code)).size!==expected.length)throw Error('운영 S·SS 명단이 제작 기준에서 변경되었습니다.');
  for(const target of plan.targets){
    if(!expected.some(r=>r.code===target.code&&r.rank===target.rank))throw Error('운영 S·SS 등급이 제작 기준에서 변경되었습니다.');
    if(!result.skills.some(s=>s.id===target.skillId))throw Error('제작되지 않은 스킬은 배정할 수 없습니다.');
    const row=result.assignments.find(r=>r.code===target.code);
    if(!row.skillIds.includes(target.skillId))row.skillIds.push(target.skillId);
  }
  return validateMercenaryCms(result,catalog);
}
