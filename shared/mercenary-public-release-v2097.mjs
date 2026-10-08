// 2026-09-13: the user explicitly requested live PVE/PVP one-mercenary
// deployment and Hyper opening. Opening still has its own OWNER CMS switch.
export const MERCENARY_DEPLOYMENT_RELEASE_ENABLED=true;
export const MERCENARY_DEPLOYMENT_VERSION='20261009-mercenary-loadout-modes';
export const mercenaryDeploymentState=()=>({enabled:MERCENARY_DEPLOYMENT_RELEASE_ENABLED,version:MERCENARY_DEPLOYMENT_VERSION,cardSlots:5,mercenarySlots:1,scope:'PVE_PVP_SEPARATE',modes:['PVE','PVP'],allowSameMercenary:true,url:'/mercenary-codex/?view=owned',upgradeEnabled:false});
