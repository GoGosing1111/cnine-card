import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// Approved performance policy; this does not release acquisition or deployment.
// Compare fighters with the same allied deck and growth. Never rewrite results.
export const VALTER_CODE='V-996';
export const VALTER_AREA_EVENT='MERCENARY_VALTER_AREA';
export const VALTER_AREA_MECHANIC='CRIMSON_FINAL_EXECUTION';
// Valter, Helios, Kairon and Jinmu share this combat band. Scale the entire
// opening shield (including the front-row bonus) and keep speed independent.
const basePower=1950000,statsReferencePower=1123200;
const statScale=basePower/statsReferencePower;
export const LIMITED_1950K_COMBAT=Object.freeze({
 basePower,statsReferencePower,statScale,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,
 link:Object.freeze({attackPercent:1830.4*statScale,hpPercent:1164.8*statScale,shieldPercent:686.4*statScale-60}),
 basicCapScale:2*statScale,damageTakenScale:.25,hardCounter:BERKAN_CODE
});
export const LIMITED_1950K_AREA_BALANCE=Object.freeze({damageRatio:12.6,cooldownTurns:5,cost:35});
const percent=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:2});
export function limited1950kCombatText(skill){
 const {link}=LIMITED_1950K_COMBAT,{damageRatio,cost,cooldownTurns}=skill.balance;
 return `기본 전투력 ${percent(basePower)}. 아군 일반 카드 평균 공격력의 ${percent(link.attackPercent)}%를 최소 공격력, 평균 최대 체력의 ${percent(link.hpPercent)}%를 최소 체력으로 사용합니다. PVE 전열 시작 방벽은 평균 최대 체력의 ${percent(link.shieldPercent+60)}%입니다. 아군 일반 카드 25회 행동당 추가 78회 행동합니다. 개인 피해 75% 경감, 상태이상·반격 보호, 베르칸 피해 면역을 지닙니다. PVE ${skill.name}은 적 전체에 총 ${percent(damageRatio*100)}% 피해를 나눠 적용합니다(에너지 ${cost} · 재사용 ${cooldownTurns}행동). PVP는 기본 공격을 사용합니다.`;
}
export const VALTER_AREA_SKILL=Object.freeze({
 id:'MS-996',name:'종결 집행',mechanic:VALTER_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:LIMITED_1950K_AREA_BALANCE
});
export const VALTER_COMBAT=Object.freeze({
 ...LIMITED_1950K_COMBAT,version:4,
 // Applies only to defense derived from innate power, before level growth.
 innateDefensePercent:12
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
export const VALTER_COMBAT_DESCRIPTION=limited1950kCombatText(VALTER_AREA_SKILL)+' 고유 방어력이 12% 증가하며 장비 방어력은 이 보너스에서 제외합니다.';
