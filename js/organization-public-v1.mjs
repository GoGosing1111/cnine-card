import {mountOrganization} from './organization-system-v1.mjs?v=20261023-clan-identity';
import {observeOrganizationHeight,isOrganizationEmbedded} from './organization-embed-size-v1.mjs?v=20261023-clan-identity';
import {organizationApi,organizationToken} from './organization-api-v1.mjs?v=20261023-clan-identity';

const embedded=isOrganizationEmbedded();
document.documentElement.classList.toggle('org-embedded',embedded);
const root=document.getElementById('organization-root');
const mounted=await mountOrganization({root,api:organizationApi});
let previousToken=organizationToken();
window.addEventListener('storage',event=>{if(event.key==='cnine_card_api_token'&&organizationToken()!==previousToken){previousToken=organizationToken();void mounted.refresh();}});
window.addEventListener('pagehide',()=>mounted.destroy(),{once:true});
observeOrganizationHeight(root,'organization:height');
