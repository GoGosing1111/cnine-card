// User approved the complete V-044 SD/skill package for live release on 2026-09-15.
export const HEEYA_RELEASE = '20260915-hi-heeya-live-v1';
export const HEEYA_CODE = 'V-044';
export const HEEYA_SKILL_ID = 'MS-044';
export const HEEYA_BALANCE = Object.freeze({damageRatio:4.2,cooldownTurns:5,cost:25});
export const HEEYA_IMPACTS = Object.freeze(Array.from({length:9},(_,i)=>Number((.66+i*.17).toFixed(2))));

export function createHeeyaSkill(definition,art){
 return definition(HEEYA_SKILL_ID,'해일 탄막','MARKSMAN','FRONT_ENEMY','TIDAL_BARRAGE',
  '적 전열의 한 대상을 고정하고 경기관총 사격을 준비한다.',
  '적 전열 한 명을 겨냥해 백청색 탄막을 아홉 발 연사한다. 마지막 탄이 적중하면 집중 사격의 피해가 적용된다.',
  '준비 중 시전자를 제압하거나 표적을 보호한다. 조준한 표적이 사라지면 다른 적에게 피해를 이전하지 않는다.',
  '보스에도 같은 단일 피해 예산을 적용한다. 최대 HP 비례 피해·방어 무시·추가 발동은 없다.',
  art('tidal-barrage','TIDAL_BARRAGE',.4,[...HEEYA_IMPACTS],3.4,'#7edcf0'),
  ['전열 표적 고정','경기관총 9연사','마지막 탄막 충돌','물결과 탄피 소멸']);
}

// Only the newly approved entry gets release defaults. Existing CMS edits are untouched.
export function prepareHeeyaDefaults(document){
 const card=document.mercenaries.find(c=>c.code===HEEYA_CODE);
 if(!card)return document;
 card.review='REVIEWED';card.acquisition={type:'DROP',source:'하이퍼팩 · SS 등급 내 균등 확률',coinPrice:null,dropRate:null};
 const skill=document.skills.find(s=>s.id===HEEYA_SKILL_ID);
 skill.balance={...HEEYA_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===HEEYA_CODE).skillIds=[HEEYA_SKILL_ID];
 return document;
}
