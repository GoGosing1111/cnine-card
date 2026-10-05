// 2026-10-05 user approved live launch and a stronger recommendation than X-BODY.
export const OVERLORD_SUIT_CODE='BATTLE_SUIT_OVERLORD';
export const OVERLORD_RELEASE_ENABLED=true;
export const OVERLORD_INITIAL_POWER=62500000; // Current live X-BODY 50,000,000 × 1.25.
export const OVERLORD_AREA_SKILL=Object.freeze({
 code:'BATTLE_SUIT_OVERLORD_WHITE_TIGER',name:'백호멸진',effectKey:'overlord-white-tiger',
 damageMultiplier:6,intervalMs:18000,openingDelayMs:0,
 targeting:'ALL_LIVING_ENEMIES',intrinsic:true,silent:true,
 impactOffsetsMs:Object.freeze([2270,2340,2410,2480,2550]),effectDurationMs:5350,sortOrder:120
});
export const isOverlord=code=>String(code||'').trim().toUpperCase()===OVERLORD_SUIT_CODE;
export const isOverlordAreaActor=actor=>actor?.cardId==='BATTLE_SUIT:'+OVERLORD_SUIT_CODE&&actor.isBattleSuit===true;

