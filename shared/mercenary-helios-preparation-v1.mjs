import {LIMITED_MERCENARIES} from './mercenary-limited-catalog-v1.mjs';
import {HELIOS_CODE,HELIOS_COMBAT,HELIOS_AREA_SKILL} from './mercenary-helios-v1.mjs';

// Explicit test/review snapshot. Never imported by the account/loadout service.
export function heliosPreparedSnapshot(){
 const art=LIMITED_MERCENARIES.find(c=>c.code===HELIOS_CODE);
 return {...art,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',basePower:HELIOS_COMBAT.basePower,
  position:'FRONT',role:'VANGUARD',attackStyle:'MELEE',skills:[structuredClone(HELIOS_AREA_SKILL)],
  pendingSkillIds:[],heliosPolicyVersion:HELIOS_COMBAT.version,deploymentEnabled:false,acquisitionEnabled:false};
}
