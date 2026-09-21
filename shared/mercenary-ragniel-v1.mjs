// User approval: 2026-09-19 "반영해 SSS로". Existing SSS power/budget policy.
export const RAGNIEL_CODE='V-046';
export const RAGNIEL_SKILL_ID='MS-046';
export const RAGNIEL_MECHANIC='PLATINUM_SANCTUARY';
export const RAGNIEL_BALANCE=Object.freeze({damageRatio:5.6,cooldownTurns:5,cost:35});
export const RAGNIEL_IMPACTS=Object.freeze([1.58,2.42]);
export const RAGNIEL_SHARES=Object.freeze([.4,.6]);
export const RAGNIEL_DURATION=5.8;
export function createRagnielSkill(definition,art){
 return definition(RAGNIEL_SKILL_ID,'종언의 백금성역','VANGUARD','FRONT_GROUP',RAGNIEL_MECHANIC,
  '자원과 재사용 대기 조건을 충족하면 적 전열 최대 2명을 고정합니다.',
  '백금 질주 후 성검으로 베고 거대 성검을 낙하시킵니다. 전체 피해 예산의 40%와 60%를 두 충돌에 나누고, 각 단계의 예산을 처음 지정한 대상 수로 나눕니다.',
  '회피·보호막·방어가 적용됩니다. 첫 검격을 회피하면 그 대상의 낙하 피해는 취소됩니다. 지정 대상이 먼저 쓰러지면 낙하 피해는 남은 지정 대상에게 이어집니다.',
  '단일 보스는 같은 전체 예산을 받습니다. 최대 HP 비례·즉사·방어 무시·추가 행동은 없습니다. 두 타격이 한 행동의 피해 상한을 나누어 사용합니다.',
  art('platinum-sanctuary',RAGNIEL_MECHANIC,.72,[...RAGNIEL_IMPACTS],RAGNIEL_DURATION,'#f5d582'),
  ['성검 집중 · 광익 개방','백금 질주 · 성검 단죄','거대 성검 낙하 · 광익 폭발','금빛 파편 · 잔광 소멸']);
}
export function prepareRagnielDefaults(document){
 const card=document.mercenaries.find(c=>c.code===RAGNIEL_CODE);if(!card)return document;
 card.review='REVIEWED';card.acquisition={type:'DROP',source:'하이퍼팩 · SSS 등급 내 균등 확률',coinPrice:null,dropRate:null};
 const skill=document.skills.find(s=>s.id===RAGNIEL_SKILL_ID);skill.balance={...RAGNIEL_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===RAGNIEL_CODE).skillIds=[RAGNIEL_SKILL_ID];return document;
}
