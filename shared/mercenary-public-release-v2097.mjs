// 2026-09-13: the user explicitly requested live PVE/PVP one-mercenary
// deployment and Hyper opening. Opening still has its own OWNER CMS switch.
export const MERCENARY_DEPLOYMENT_RELEASE_ENABLED=true;
export const MERCENARY_DEPLOYMENT_VERSION='2097-mercenary-deployment';
export const mercenaryDeploymentState=()=>({enabled:MERCENARY_DEPLOYMENT_RELEASE_ENABLED,version:MERCENARY_DEPLOYMENT_VERSION,cardSlots:5,mercenarySlots:1,scope:'PVE_PVP_SHARED',url:'/mercenary-hangar/',upgradeEnabled:false});
