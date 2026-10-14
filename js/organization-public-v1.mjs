import {mountOrganization} from './organization-system-v1.mjs?v=20261015-live-v1';
import {organizationPublicApi} from '../shared/organization-public-v1.mjs';

const embedded=window.parent!==window;
document.documentElement.classList.toggle('org-embedded',embedded);
const root=document.getElementById('organization-root');
await mountOrganization({root,api:organizationPublicApi});
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
