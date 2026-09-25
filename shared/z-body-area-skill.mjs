import {skillChipByCode,createSkillChipSchedule} from './battle-suit-skill-chips.mjs';

// The replacement art must be reviewed before this gate is enabled.
export const Z_BODY_AREA_RELEASE_ENABLED=false;
// JSON/API payloads cannot opt into a review build using this process-local key.
export const Z_BODY_AREA_REVIEW=Symbol('Z_BODY_AREA_REVIEW_20260926');
const helicopter=skillChipByCode('SKILL_CHIP_HELICOPTER_AIRSTRIKE');
export const Z_BODY_AREA_SKILL=Object.freeze({
  code:'BATTLE_SUIT_Z_THUNDER_JUDGMENT',name:'뇌검 집행',effectKey:'z-thunder',
  damageMultiplier:helicopter.damageMultiplier,intervalMs:helicopter.intervalMs,
  damageReference:helicopter.code,targeting:'ALL_LIVING_ENEMIES',intrinsic:true,silent:true,
  impactOffsetsMs:Object.freeze([1080,1210,1340,1430,1540]),effectDurationMs:3200,sortOrder:100
});
export function isZBodyAreaActor(actor){return actor?.cardId==='BATTLE_SUIT:BATTLE_SUIT_Z_BODY'&&actor.isBattleSuit===true;}
export function battleSuitCombatSkillByCode(code){return code===Z_BODY_AREA_SKILL.code?Z_BODY_AREA_SKILL:skillChipByCode(code);}
export function createBattleSuitCombatSchedule(codes,includeZ=false){
  const chips=createSkillChipSchedule(codes);let activation=0;
  return {
    peek(){
      const next=chips.peek(),z=includeZ?{chip:Z_BODY_AREA_SKILL,activation,atMs:(activation+1)*Z_BODY_AREA_SKILL.intervalMs}:null;
      return !z?next:!next||z.atMs<next.atMs?z:next;
    },
    take(){const next=this.peek();if(next?.chip.intrinsic){activation++;return {...next,activation};}return chips.take();}
  };
}
