import {skillChipByCode} from './battle-suit-skill-chips.mjs';
// 2026-09-27: user approved the visual and the same balance as Z-BODY.
export const X_BODY_AREA_RELEASE_ENABLED=true;
export const X_BODY_AREA_REVIEW=Symbol('X_BODY_AREA_REVIEW_20260927');
const reference=skillChipByCode('SKILL_CHIP_HELICOPTER_AIRSTRIKE');
export const X_BODY_AREA_SKILL=Object.freeze({
 code:'BATTLE_SUIT_X_CELESTIAL_DRAGON',name:'천룡 강림',effectKey:'x-dragon',
 damageMultiplier:reference.damageMultiplier,intervalMs:reference.intervalMs,
 damageReference:reference.code,targeting:'ALL_LIVING_ENEMIES',intrinsic:true,silent:true,
 impactOffsetsMs:Object.freeze([2180,2240,2300,2360,2420]),effectDurationMs:4600,sortOrder:110
});
export function isXBodyAreaActor(actor){return actor?.cardId==='BATTLE_SUIT:BATTLE_SUIT_X_BODY'&&actor.isBattleSuit===true;}
