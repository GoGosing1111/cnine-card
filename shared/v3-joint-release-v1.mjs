import {V3_LIVE_CONNECTIONS} from './v3-live-connections.mjs';
import {pvePublicContentState} from './pve-public-release-v2092.mjs';
import {mercenaryDeploymentState} from './mercenary-public-release-v2097.mjs';
// One source gate for the coordinated V3 / mercenary / equipment launch.
// A CMS value, request field or environment override cannot open this gate.
export const V3_JOINT_RELEASE_ENABLED = false;
export const V3_JOINT_RELEASE_VERSION = '20260913-joint1';
export const V3_JOINT_COMPONENTS = Object.freeze(['TOWER','SCRAPYARD','COW_ROOM','IDLE','MERCENARY','EQUIPMENT_FORGE']);
export function v3JointReleaseState(){
  return {version:V3_JOINT_RELEASE_VERSION,enabled:V3_JOINT_RELEASE_ENABLED,components:[...V3_JOINT_COMPONENTS],connected:true,connections:V3_LIVE_CONNECTIONS,publicContent:{...pvePublicContentState(),MERCENARY:mercenaryDeploymentState()}};
}
