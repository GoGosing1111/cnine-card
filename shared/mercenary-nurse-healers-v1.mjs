// 2026-10-05 user-requested healing nerf. Keep the four SS healers and shared skill.
export const NURSE_CODES=Object.freeze(['V-051','V-052','V-053','V-054']);
export const NURSE_NAMES=Object.freeze(['디임간호사','희야 간호사','조은 간호사','봉순 간호사']);
export const NURSE_SKILL_ID='MS-051';
export const NURSE_MECHANIC='WHITE_OATH_GROUP_HEAL';
export const NURSE_BALANCE=Object.freeze({damageRatio:1.6,cooldownTurns:6,cost:25});
export const NURSE_HEAL_POLICY=Object.freeze({version:1,maxTargetHpPercent:15});
// Freeze the cap in newly captured battle snapshots. Existing cooperative rooms
// keep their original policy when QTEs or departures replay the saved battle.
export function nurseRuntimeSkill(skill){
 return skill?.mechanic===NURSE_MECHANIC?{...skill,nurseHealing:{...NURSE_HEAL_POLICY}}:skill;
}
export function nurseSkillText(skill){
 if(skill?.mechanic!==NURSE_MECHANIC)return skill;
 const b=skill.balance||NURSE_BALANCE;
 return {...skill,effect:`공격력 ${Math.round(b.damageRatio*100)}%의 총 회복량을 자신을 포함한 생존 일반 카드와 용병에게 균등 분배합니다. 대상별 회복은 1회 최대 체력의 ${NURSE_HEAL_POLICY.maxTargetHpPercent}% 이내이며, 회복 억제는 이 상한 적용 후 반영합니다. 재사용 ${b.cooldownTurns}턴, 자원 ${b.cost}를 소모합니다.`};
}
export const NURSE_DRAW_WEIGHT=3;
// User follow-up: each nurse has equal weight 3. Preserve every older weight;
// explicit later CMS nurse weights always win over this registration default.
export function nurseSelectionWeights(codes,weights){
 if(!NURSE_CODES.every(c=>codes.includes(c))||NURSE_CODES.some(c=>Object.hasOwn(weights,c)))return weights;
 return {...weights,...Object.fromEntries(NURSE_CODES.map(c=>[c,NURSE_DRAW_WEIGHT]))};
}
export function nursePosition(code){return {code,rank:'SS',position:'REAR',role:'SUPPORT',basicTarget:'FRONT_ENEMY',skillTarget:'ALLY_TEAM',
 specialty:'생존 아군 전체 회복',weakness:'회복 억제와 기절·침묵에 취약',rationale:'후열에서 백의의 맹세로 총 회복량을 생존 아군에게 균등 분배한다.'};}
export function createNurseSkill(definition,art){
 return definition(NURSE_SKILL_ID,'백의의 맹세','SUPPORT','ALLY_TEAM',NURSE_MECHANIC,
  '회복이 필요한 생존 아군이 있고 자원·재사용 조건을 충족하면 발동합니다.',
  nurseSkillText({mechanic:NURSE_MECHANIC}).effect,
  '기절·침묵은 시전을 막으며 회복 억제를 적용합니다. 초과 회복은 버리고 사망자를 부활시키지 않습니다.',
  'PVE·PVP 모두 동일한 총 회복 예산을 사용합니다. 배틀슈트와 호송 목표물은 제외하며 정화·보호막·추가 피해를 부여하지 않습니다.',
  art('white-oath',NURSE_MECHANIC,.14,[.88],2.6,'#9fffe0'),
  ['치유 에너지 집중','백의의 빛 전개','생존 아군 회복','치유 잔향 소멸']);
}
export function prepareNurseDefaults(document){
 for(const [i,code] of NURSE_CODES.entries()){
  const card=document.mercenaries.find(c=>c.code===code);if(!card)continue;
  Object.assign(card,{name:NURSE_NAMES[i],rank:'SS',review:'REVIEWED',
   acquisition:{type:'DROP',source:'하이퍼팩 · SS 용병 · 개별 추첨 가중치 3',coinPrice:null,dropRate:null}});
  document.assignments.find(a=>a.code===code).skillIds=[NURSE_SKILL_ID];
 }
 const skill=document.skills.find(s=>s.id===NURSE_SKILL_ID);
 if(skill){skill.balance={...NURSE_BALANCE};skill.review='REVIEWED';}
 return document;
}
