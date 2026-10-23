import {organizationIdentity} from '../shared/organization-identity-v1.mjs?v=20261023-clan-identity';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The six current IDs keep their membership and state; only their public crest changes.
export function organizationCrest(id,className='org-emblem-v1'){
 const identity=organizationIdentity(id);
 if(!identity)return '';
 return '<img class="'+esc(className)+' org-clan-mark" src="'+esc(identity.markImage)+'" alt="'+esc(identity.name)+' 클랜 마크" width="384" height="384" decoding="async" draggable="false">';
}
