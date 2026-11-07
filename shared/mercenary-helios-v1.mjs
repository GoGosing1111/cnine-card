import {VALTER_COMBAT,LIMITED_1950K_COMBAT,LIMITED_1950K_AREA_BALANCE,limited1950kCombatText} from './mercenary-valter-v1.mjs';

// 2026-10-12: approved performance, followed by explicit formation release.
// Ownership and pack economy remain separate from this combat policy.
export const HELIOS_CODE='V-999';
export const HELIOS_AREA_EVENT='MERCENARY_HELIOS_AREA';
export const HELIOS_AREA_MECHANIC='SOLAR_COLLAPSE';
export const HELIOS_AREA_SKILL=Object.freeze({
 id:'MS-999',name:'천양붕락',mechanic:HELIOS_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:LIMITED_1950K_AREA_BALANCE
});
export const HELIOS_COMBAT=Object.freeze({
 ...LIMITED_1950K_COMBAT,version:3,motionPlaybackRate:2.6
});
export const isHelios=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===HELIOS_CODE;
export const heliosActionCredit=actors=>actors.some(a=>isHelios(a)&&a.alive!==false&&a.hp>0)?HELIOS_COMBAT.actionCredit:1;
// Both approved profiles use fractional credit. Preserve the existing exports
// while recognizing Valter independently of any later Helios policy change.
const fractionalCredit=credit=>credit===HELIOS_COMBAT.actionCredit||credit===VALTER_COMBAT.actionCredit;
export const normalizeHeliosCredit=(debt,credit)=>fractionalCredit(credit)?Math.round(debt*100)/100:debt;
// Preserve the fractional remainder when 0.96 + 3.12 becomes 4.08. Capping
// at ceil(credit) would discard credit repeatedly and silently lose the buff.
export const heliosCreditLimit=(interval,credit)=>fractionalCredit(credit)?interval+credit:interval+Math.ceil(credit)-1;
export function heliosIncomingDamage(target,incoming,source){
 if(!isHelios(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===HELIOS_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*HELIOS_COMBAT.damageTakenScale);
}
export const heliosMotionRate=mode=>mode==='aura'?1:HELIOS_COMBAT.motionPlaybackRate;
export const HELIOS_COMBAT_DESCRIPTION=limited1950kCombatText(HELIOS_AREA_SKILL)+' 공격·스킬 모션은 원본 대비 2.6배속입니다. 보유한 헬리오스를 PVE·PVP에 각각 편성할 수 있습니다.';
