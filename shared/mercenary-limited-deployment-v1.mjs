import {LIMITED_MERCENARIES} from './mercenary-limited-catalog-v1.mjs';
import {SS_LIMITED_COMBAT,SS_LIMITED_BALANCE_VERSION} from './mercenary-ss-limited-v1.mjs';
import {VALTER_CODE,VALTER_COMBAT,VALTER_AREA_SKILL} from './mercenary-valter-v1.mjs';

// User release: 2026-10-09. Ownership is still checked by the account service.
// Artwork provenance, acquisition and pack release remain separate contracts.
export const LIMITED_DEPLOYMENT_VERSION='20261009-limited-deployment-v1';
export function limitedDeploymentSnapshot(code){
 const art=LIMITED_MERCENARIES.find(c=>c.code===code);if(!art)return null;
 const profile=SS_LIMITED_COMBAT[code],valter=code===VALTER_CODE;
 if(!valter&&!profile)return null;
 return {code,name:art.name,title:art.title,rank:art.rank,edition:'LIMITED',actorKind:'MERCENARY',
  sourceArt:art.sourceArt,battleSprite:art.battleSprite,level:1,statMode:'RANK_FIXED',
  basePower:valter?VALTER_COMBAT.basePower:profile.basePower,
  position:valter?'FRONT':profile.position,role:valter?'VANGUARD':profile.role,
  attackStyle:valter?'MELEE':profile.attackStyle,
  skills:[structuredClone(profile?profile.skill:VALTER_AREA_SKILL)],pendingSkillIds:[],
  ...(valter?{valterPolicyVersion:VALTER_COMBAT.version}:{ssLimitedPolicyVersion:SS_LIMITED_BALANCE_VERSION}),
  deploymentEnabled:true,deploymentVersion:LIMITED_DEPLOYMENT_VERSION};
}
