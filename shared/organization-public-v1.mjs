import {ORGANIZATION_PREPARATION} from './organization-preparation-v1.mjs?v=20261023-clan-identity';
import {ORGANIZATIONS,defaultOrganizationPolicy,organizationHideout} from './organization-system-v1.mjs?v=20261023-clan-identity';

// Public preparation has no accounts, enrollment, fictional participants or DB writes.
// This adapter is deliberately separate from the authenticated TEST service.
export function organizationPublicOverview(){
 const policy=defaultOrganizationPolicy();
 return {ok:true,viewerId:'public-preparation',previewOnly:true,releaseEnabled:false,admissionEnabled:false,
  preparation:ORGANIZATION_PREPARATION,round:null,policy,survey:null,membership:null,
  roster:[],participantCount:null,ratedCount:0,proposal:null,
  organizations:ORGANIZATIONS.map(o=>({...o,applicants:0,memberCount:0,power:0,hideout:organizationHideout(0,policy)}))};
}
export async function organizationPublicApi(path,options={}){
 if((options.method||'GET')!=='GET'||path!=='organization/overview')
  throw Object.assign(Error('입단 심사는 현재 OFF 상태입니다. 모집 일정은 추후 안내합니다.'),{code:'ORG_RECRUITMENT_CLOSED',status:409});
 return organizationPublicOverview();
}
