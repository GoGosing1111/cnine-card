import {mountOrganization} from './organization-system-v1.mjs?v=20261017-additional-recruitment-v1';
import {organizationApi,organizationToken} from './organization-api-v1.mjs?v=20261015-organization-live-v2';

const embedded=window.parent!==window;
document.documentElement.classList.toggle('org-embedded',embedded);
const root=document.getElementById('organization-root');
const mounted=await mountOrganization({root,api:organizationApi});
let previousToken=organizationToken();
window.addEventListener('storage',event=>{if(event.key==='cnine_card_api_token'&&organizationToken()!==previousToken){previousToken=organizationToken();void mounted.refresh();}});
window.addEventListener('pagehide',()=>mounted.destroy(),{once:true});
if(embedded){
 let queued=false,lastHeight=0;
 const sendSize=()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{
   queued=false;
   const height=Math.ceil(document.body.getBoundingClientRect().height);
   if(height!==lastHeight){lastHeight=height;parent.postMessage({type:'organization:height',height},location.origin);}
  });
 };
 new ResizeObserver(sendSize).observe(document.body);
 document.fonts.ready.then(sendSize);
 sendSize();
}
