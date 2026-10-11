import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// 2026-10-12: approved performance, followed by explicit formation release.
// Ownership and pack economy remain separate from this combat policy.
export const HELIOS_CODE='V-999';
export const HELIOS_AREA_EVENT='MERCENARY_HELIOS_AREA';
export const HELIOS_AREA_MECHANIC='SOLAR_COLLAPSE';
export const HELIOS_AREA_SKILL=Object.freeze({
 id:'MS-999',name:'천양붕락',mechanic:HELIOS_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({damageRatio:5.6,cooldownTurns:5,cost:35})
});
export const HELIOS_COMBAT=Object.freeze({
 version:2,basePower:1123200,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:2.6,
 // 2026-10-12 follow-up: also retain a small attack advantage on strong decks.
 // Only the card-derived attack floor gains 4%; existing cadence and gear stay unchanged.
 link:Object.freeze({attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8}),
 basicCapScale:2,damageTakenScale:.25,hardCounter:BERKAN_CODE
});
export const isHelios=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===HELIOS_CODE;
export const heliosActionCredit=actors=>actors.some(a=>isHelios(a)&&a.alive!==false&&a.hp>0)?HELIOS_COMBAT.actionCredit:1;
// Hundredth-action precision makes 25 allied actions fund exactly 78 turns.
export const normalizeHeliosCredit=(debt,credit)=>credit===HELIOS_COMBAT.actionCredit?Math.round(debt*100)/100:debt;
// Preserve the fractional remainder when 0.96 + 3.12 becomes 4.08. Capping
// at ceil(credit) would discard credit repeatedly and silently lose the buff.
export const heliosCreditLimit=(interval,credit)=>credit===HELIOS_COMBAT.actionCredit?interval+credit:interval+Math.ceil(credit)-1;
export function heliosIncomingDamage(target,incoming,source){
 if(!isHelios(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===HELIOS_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*HELIOS_COMBAT.damageTakenScale);
}
export const heliosMotionRate=mode=>mode==='aura'?1:HELIOS_COMBAT.motionPlaybackRate;
export const HELIOS_COMBAT_DESCRIPTION='기본 전투력 1,123,200. 아군 일반 카드 평균 공격력의 1,830.4%를 최소 공격력으로 사용하며, 발테르보다 공격 연계 배율이 4% 높습니다. 피해 경감·개인 면역은 발테르와 같고, 자연 행동 속도 약 4%, 추가 행동·연계 체력·전용 방벽은 4% 높습니다. 아군 일반 카드 25회 행동당 추가 78회 행동합니다. PVE 천양붕락은 적 전체에 총 560% 피해를 나눠 적용합니다(에너지 35 · 재사용 5행동). 공격·스킬 모션은 원본 대비 2.6배속입니다. 보유한 헬리오스를 PVE·PVP에 각각 편성할 수 있습니다.';
