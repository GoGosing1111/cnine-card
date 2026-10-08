import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// Approved performance policy; this does not release acquisition or deployment.
// Compare fighters with the same allied deck and growth. Never rewrite results.
export const VALTER_CODE='V-996';
export const VALTER_COMBAT=Object.freeze({
 version:1,basePower:1080000,speedScale:2,actionCredit:1.5,
 link:Object.freeze({attackPercent:1760,shieldPercent:600,hpPercent:1120}),
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
