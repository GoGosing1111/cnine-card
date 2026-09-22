export const HEUKWOL_CODE='V-048';
export const HEUKWOL_SKILL_ID='MS-048';
export const HEUKWOL_MECHANIC='BLACK_MOON_TRIPLE_SEVER';
// Existing SS single-target budget; three contacts divide one cast, not three casts.
export const HEUKWOL_BALANCE=Object.freeze({damageRatio:4.2,cooldownTurns:5,cost:25});
export const HEUKWOL_IMPACTS=Object.freeze([.72,1.24,1.92]);
export const HEUKWOL_SHARES=Object.freeze([.3,.3,.4]);
export function createHeukwolSkill(definition,art){
 return definition(HEUKWOL_SKILL_ID,'흑월 삼연참','VANGUARD','FRONT_ENEMY',HEUKWOL_MECHANIC,
  '자원과 재사용 대기 조건을 충족하면 적 전열 한 명에게 접근합니다.',
  '내려베기·올려베기·횡베기를 연속 사용합니다. 전체 피해 예산의 30%·30%·40%를 세 타격에 나누어 적용합니다.',
  '회피·방어·보호막·단일 피해 호위가 적용됩니다. 시전자 제압 또는 대상 소멸 시 남은 타격을 취소합니다.',
  '보스도 같은 단일 피해 예산을 받습니다. 추가 행동·방어 무시·최대 HP 비례 피해 없이 세 타격이 한 행동의 피해 상한을 나눕니다.',
  art('black-moon-triple-sever',HEUKWOL_MECHANIC,.4,[...HEUKWOL_IMPACTS],3.8,'#e9c681'),
  ['발검 · 전진','내려베기 · 올려베기','횡베기 · 교차 검흔','잔광 소멸 · 원위치 복귀']);
}
export function prepareHeukwolDefaults(document){
 const card=document.mercenaries.find(c=>c.code===HEUKWOL_CODE);if(!card)return document;
 card.review='REVIEWED';card.acquisition={type:'DROP',source:'하이퍼팩 · SS 등급 내 균등 확률',coinPrice:null,dropRate:null};
 const skill=document.skills.find(s=>s.id===HEUKWOL_SKILL_ID);skill.balance={...HEUKWOL_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===HEUKWOL_CODE).skillIds=[HEUKWOL_SKILL_ID];return document;
}
