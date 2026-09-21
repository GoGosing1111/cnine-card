// One finite bodyguard link. Reuse the assigned skill and CMS resource values;
// neither a rank/stat bonus nor an automatic skill assignment is introduced.
export const MERCENARY_GUARD_BALANCE_VERSION='20260917-guard-v1';
// v2119: 호위는 행동을 소모하지 않고 기본 공격을 함께 한다. 50% 위력이면 그 행동이 사실상
// 반쯤 사라져 호위형이 최하위가 됐다. 85% 로 올려 호위해도 공격이 무뎌 보이지 않게 한다.
export const MERCENARY_GUARD_BASIC_SCALE=.85;
// 보호막 계열(호위·불퇴진)이 막아 주는 비율을 CMS interceptPercent 에 더한다.
export const MERCENARY_WARD_BONUS_PERCENT=30;
export const mercenaryWardPercent=percent=>Math.min(90,Number(percent||0)+MERCENARY_WARD_BONUS_PERCENT);
export const isMercenaryGuardSkill=skill=>skill?.mechanic==='INTERCEPT_ONE_HIT';
export const MERCENARY_GUARD_SUMMARY='자신을 제외한 최저 HP 비율 아군을 현재 행동에서 호위하며 85% 위력의 기본 공격을 함께 수행합니다. 보호 대상의 행동을 기준으로 유지하며, 유효한 호위가 남아 있으면 중복 시전하지 않고 기본 공격합니다.';
export function mercenaryGuardSkillText(skill){
 if(!isMercenaryGuardSkill(skill))return skill;
 return {...skill,trigger:'자원과 재사용 대기 조건을 충족하면 자신을 제외한 최저 HP 비율 아군을 즉시 호위합니다.',
  effect:'호위 설치와 85% 위력의 기본 공격을 함께 수행합니다. 유지 시간은 보호 대상의 행동으로 계산합니다. 첫 단일 기본 공격 또는 단일 용병 공격 스킬의 피해 일부를 대신 받습니다. 호위는 한 번만 작동하며 보호자가 실제로 받은 피해만 이전됩니다. 유효한 호위가 남아 있으면 기본 공격합니다.',
  counterplay:'광역·지속 피해·반격·고정 피해·즉사는 가로채지 못합니다. 보호자 사망·기절·침묵 중에는 작동하지 않으며 연타에는 첫 타격만 보호합니다.',
  bossRule:'보스의 일반 단일 기본 공격만 호위합니다. 광역 기믹·즉사·고정 피해는 이전하지 않습니다.',
  procRule:'호위 설치와 85% 위력의 기본 공격을 한 행동에서 수행합니다. 설치 행동의 공격은 자원을 회복하지 않습니다. 비용과 재사용 대기는 설치할 때 한 번 적용하며, 피해 이전은 추가 공격·자원 회복·연쇄 호위를 만들지 않습니다.'};
}
