import {KAIRON_CODE,KAIRON_COMBAT,KAIRON_AREA_SKILL} from '../../shared/mercenary-kairon-v1.mjs';

// Approved name and balance target, 2026-10-15. Roster code and live registration remain pending.
export const MONOCHROME_ARTILLERY_COMBAT=KAIRON_COMBAT;
export const MONOCHROME_ARTILLERY_AREA_BALANCE=KAIRON_AREA_SKILL.balance;
export const MONOCHROME_ARTILLERY_COMBAT_PREPARATION=Object.freeze({
 version:1,date:'2026-10-15',status:'NAME_AND_BALANCE_APPROVED_RELEASE_PENDING',
 userInstruction:'성능은 카이론하고 동급으로 맞추고 이름은 뭐가 좋냐',
 referenceCode:KAIRON_CODE,referenceModule:'shared/mercenary-kairon-v1.mjs',
 combat:MONOCHROME_ARTILLERY_COMBAT,
 fighter:Object.freeze({statMode:'RANK_FIXED',position:'FRONT',role:'VANGUARD',attackStyle:'RANGED',
  counterImmune:true,controlImmune:true,poisonImmune:true,
  debuffProtection:'SAME_SOVEREIGN_BRANCHES_AS_KAIRON',equipmentScaling:'SAME_STATS_AND_SPEED_REFERENCE_FORMULAS_AS_KAIRON'}),
 pvp:Object.freeze({areaSkillEnabled:false,basicCapScale:KAIRON_COMBAT.basicCapScale,
  tierOffenseReferenceCode:KAIRON_CODE,tierDamageTakenReferenceCode:KAIRON_CODE}),
 pve:Object.freeze({areaSkillEnabled:true,target:KAIRON_AREA_SKILL.target,balance:MONOCHROME_ARTILLERY_AREA_BALANCE,
  damageAllocation:'TOTAL_RATIO_DIVIDED_BY_UNIQUE_LIVING_TARGET_COUNT',damageApplicationsPerTargetPerCast:1}),
 visualDamageContract:Object.freeze({attackRounds:9,skillRounds:30,artillerySalvos:5,coveringFireRounds:25,
  damageAuthority:'SERVER_RECEIPT_ONLY',roundsMultiplyDamage:false,skullMarkAddsDebuff:false}),
 identity:Object.freeze({name:'시라누이',title:null,code:null,rank:null,edition:null}),
 release:Object.freeze({runtimeEnabled:false,acquisitionEnabled:false,deploymentEnabled:false,acquisitionMethod:null}),
 naming:Object.freeze({selected:'시라누이',japanese:'不知火',selectedBy:'USER',userInstruction:'시라누이로 짓고'})
});
