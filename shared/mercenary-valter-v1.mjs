import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// Approved performance policy; this does not release acquisition or deployment.
// Compare fighters with the same allied deck and growth. Never rewrite results.
export const VALTER_CODE='V-996';
export const VALTER_AREA_EVENT='MERCENARY_VALTER_AREA';
export const VALTER_AREA_MECHANIC='CRIMSON_FINAL_EXECUTION';
// The approved V17 ultimate now has a PVE server cast. Use the established
// SSS area budget/cost/cooldown; the 2026-10-21 parity update retains this skill.
export const VALTER_AREA_SKILL=Object.freeze({
 id:'MS-996',name:'종결 집행',mechanic:VALTER_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({damageRatio:5.6,cooldownTurns:5,cost:35})
});
export const VALTER_COMBAT=Object.freeze({
 version:3,basePower:1080000,speedScale:3.12,actionCredit:3.12,
 link:Object.freeze({attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8}),
 // Applies only to defense derived from innate power, before level growth.
 // Equipment, displayed power and the separate 75% mitigation are unchanged.
 innateDefensePercent:12,
 basicCapScale:2,damageTakenScale:.25,
 hardCounter:BERKAN_CODE
});
export const isValter=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===VALTER_CODE;
export const valterActionCredit=actors=>actors.some(a=>isValter(a)&&a.alive!==false&&a.hp>0)?VALTER_COMBAT.actionCredit:1;

// Run after hit caps/minimum damage and before either shield or HP consumption.
// Berkan's basic shot, twin starfall and PVE arrow rain all carry their source.
// The exact actor code is required: names, art and ordinary card IDs cannot opt in.
export function valterIncomingDamage(target,incoming,source){
 if(!isValter(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===VALTER_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*VALTER_COMBAT.damageTakenScale);
}
export const VALTER_COMBAT_DESCRIPTION='기본 전투력 1,080,000. 아군 일반 카드 평균 공격력의 1,830.4%를 최소 공격력, 평균 최대 체력의 1,164.8%를 최소 체력으로 사용하며 전열 보너스를 포함한 시작 방벽은 686.4%입니다. 자연 행동 속도와 추가 행동·연계 효과는 헬리오스와 같습니다. 아군 일반 카드 25회 행동당 추가 78회 행동합니다. 고유 방어력이 12% 증가하며 장비 방어력은 이 보너스에서 제외합니다. 피해 경감 75%와 개인 면역은 유지합니다. PVE 종결 집행은 적 전체에 총 560% 피해를 나눠 적용합니다(에너지 35 · 재사용 5행동). PVP는 기본 공격을 사용합니다.';
