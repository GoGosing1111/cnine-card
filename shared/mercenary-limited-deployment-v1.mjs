import {RAZAK_CODE,razakDeploymentSnapshot} from './mercenary-razak-v1.mjs';
import {NAMSUDAENG_CODE,namsudaengDeploymentSnapshot} from './mercenary-bloodmoon-namsudaeng-v1.mjs';
import {EUNSEOL_CODE,eunseolDeploymentSnapshot} from './mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_CODE,generalJokDeploymentSnapshot} from './mercenary-general-jok-v1.mjs';
import {PRIME_CODE,primeDeploymentSnapshot} from './mercenary-prime-requiem-v1.mjs';
import {ZERO_CODE,zeroDeploymentSnapshot} from './mercenary-zero-v1.mjs';
import {LEONEL_CODE,leonelDeploymentSnapshot} from './mercenary-leonel-v1.mjs';
import {BATHORY_CODE,bathoryDeploymentSnapshot} from './mercenary-bathory-v1.mjs';
import {JOKRO_CODE,jokroDeploymentSnapshot} from './mercenary-jokro-v1.mjs';
import {HALLOWEEN_MERCENARIES} from './mercenary-halloween-catalog-v1.mjs';
import {HALLOWEEN_COMBAT,HALLOWEEN_COMBAT_VERSION} from './mercenary-halloween-combat-v1.mjs';
import {SHIRANUI_CODE,shiranuiDeploymentSnapshot} from './mercenary-shiranui-v1.mjs';
import {LIMITED_MERCENARIES} from './mercenary-limited-catalog-v1.mjs';
import {SS_LIMITED_COMBAT,SS_LIMITED_BALANCE_VERSION} from './mercenary-ss-limited-v1.mjs';
import {VALTER_CODE,VALTER_COMBAT,VALTER_AREA_SKILL} from './mercenary-valter-v1.mjs';
import {HELIOS_CODE,HELIOS_COMBAT,HELIOS_AREA_SKILL} from './mercenary-helios-v1.mjs';

import {JINMU_CODE,jinmuDeploymentSnapshot} from './mercenary-jinmu-v1.mjs';
import {KAIRON_CODE,kaironDeploymentSnapshot} from './mercenary-kairon-v1.mjs';

// User release: 2026-10-09. Ownership is still checked by the account service.
// Artwork provenance, acquisition and pack release remain separate contracts.
export const LIMITED_DEPLOYMENT_VERSION='20261012-helios-deployment-v1';
export function limitedDeploymentSnapshot(code){
 if(code===RAZAK_CODE)return razakDeploymentSnapshot();
 if(code===NAMSUDAENG_CODE)return namsudaengDeploymentSnapshot();
 if(code===EUNSEOL_CODE)return eunseolDeploymentSnapshot();
 if(code===GENERAL_JOK_CODE)return generalJokDeploymentSnapshot();
 if(code===PRIME_CODE)return primeDeploymentSnapshot();
 if(code===ZERO_CODE)return zeroDeploymentSnapshot();
 if(code===BATHORY_CODE)return bathoryDeploymentSnapshot();
 if(code===LEONEL_CODE)return leonelDeploymentSnapshot();
 if(code===JOKRO_CODE)return jokroDeploymentSnapshot();
 if(code===SHIRANUI_CODE)return shiranuiDeploymentSnapshot();
 if(code===KAIRON_CODE)return kaironDeploymentSnapshot();
 if(code===JINMU_CODE)return jinmuDeploymentSnapshot();
 const art=[...LIMITED_MERCENARIES,...HALLOWEEN_MERCENARIES].find(c=>c.code===code);if(!art)return null;
 const profile=SS_LIMITED_COMBAT[code]||HALLOWEEN_COMBAT[code],valter=code===VALTER_CODE,helios=code===HELIOS_CODE;
 if(!valter&&!helios&&!profile)return null;
 return {code,name:art.name,title:art.title,rank:art.rank,edition:'LIMITED',actorKind:'MERCENARY',
  sourceArt:art.sourceArt,battleSprite:art.battleSprite,level:1,statMode:'RANK_FIXED',
  basePower:helios?HELIOS_COMBAT.basePower:valter?VALTER_COMBAT.basePower:profile.basePower,
  position:valter||helios?'FRONT':profile.position,role:valter||helios?'VANGUARD':profile.role,
  attackStyle:valter||helios?'MELEE':profile.attackStyle,
  skills:[structuredClone(helios?HELIOS_AREA_SKILL:profile?profile.skill:VALTER_AREA_SKILL)],pendingSkillIds:[],
  ...(helios?{heliosPolicyVersion:HELIOS_COMBAT.version}:valter?{valterPolicyVersion:VALTER_COMBAT.version}:{ssLimitedPolicyVersion:SS_LIMITED_BALANCE_VERSION,...(HALLOWEEN_COMBAT[code]?{halloweenPolicyVersion:HALLOWEEN_COMBAT_VERSION}:{})}),
  deploymentEnabled:true,deploymentVersion:LIMITED_DEPLOYMENT_VERSION};
}
