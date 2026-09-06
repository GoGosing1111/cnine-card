// One registry for inventory, loadout and the forthcoming authoritative battle runtime.
// Cooldowns are proposed interpretations of the duplicated skill name in the request.
// Do not enable combat until the user confirms timing and the multiplier's base damage.
export const SKILL_CHIP_MAX_SLOTS=3;
export const SKILL_CHIP_RUNTIME_ENABLED=false;
export const SKILL_CHIP_BALANCE_STATUS='TIMING_AND_DAMAGE_BASE_CONFIRMATION_PENDING';
export const SKILL_CHIP_CATALOG=Object.freeze([
  Object.freeze({code:'SKILL_CHIP_ROCKET_LAUNCHER',name:'로켓런처',effectKey:'missile',damageMultiplier:2.5,proposedIntervalMs:3000,image:'/assets/ui/project-v/skill-chips/rocket-launcher-v1.webp',description:'투사체 발사 후 대상 발끝에서 폭발하는 배틀슈트 스킬칩.',sortOrder:10}),
  Object.freeze({code:'SKILL_CHIP_HELICOPTER_AIRSTRIKE',name:'헬기폭격',effectKey:'airstrike',damageMultiplier:5,proposedIntervalMs:15000,image:'/assets/ui/project-v/skill-chips/helicopter-airstrike-v1.webp',description:'헬기 그림자가 접근한 뒤 연속 폭격하는 배틀슈트 스킬칩.',sortOrder:20})
]);
export function skillChipByCode(code){return SKILL_CHIP_CATALOG.find(chip=>chip.code===code)||null;}
export function skillChipDamage(baseDamage,code){
  const chip=skillChipByCode(code);
  if(!chip)throw new RangeError('등록되지 않은 스킬칩입니다.');
  if(!Number.isSafeInteger(baseDamage)||baseDamage<0)throw new RangeError('기준 피해는 0 이상의 안전한 정수여야 합니다.');
  const damage=Math.round(baseDamage*chip.damageMultiplier);
  if(!Number.isSafeInteger(damage))throw new RangeError('스킬칩 피해가 안전한 정수 범위를 초과했습니다.');
  return damage;
}
