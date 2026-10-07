import {X_BODY_AREA_SKILL} from './x-body-area-skill.mjs';
// User: connect the approved SX suit and double only its attack speed.
export const SX_SUIT_CODE='BATTLE_SUIT_SX';
export const SX_RELEASE_ENABLED=true;
export const SX_ATTACK_SPEED=2;
export const SX_AREA_SKILL=Object.freeze({
  code:'BATTLE_SUIT_SX_SKYFALL',name:'창천멸진',effectKey:'sx-skyfall',
  damageMultiplier:X_BODY_AREA_SKILL.damageMultiplier,intervalMs:X_BODY_AREA_SKILL.intervalMs,openingDelayMs:0,
  damageReference:X_BODY_AREA_SKILL.code,targeting:'ALL_LIVING_ENEMIES',intrinsic:true,silent:true,
  impactOffsetsMs:Object.freeze([2020,2090,2160,2230,2300]),effectDurationMs:5700,sortOrder:130,
});
export const isSxSuit=code=>String(code||'').trim().toUpperCase()===SX_SUIT_CODE;
export const isSxAreaActor=actor=>actor?.cardId==='BATTLE_SUIT:'+SX_SUIT_CODE&&actor.isBattleSuit===true;
