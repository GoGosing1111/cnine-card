import * as policy from './policy.mjs';
Object.defineProperty(window,'CNineStorePolicy',{value:Object.freeze(policy),writable:false,configurable:false});
const nativeFetch=window.fetch.bind(window);
let countIdentity='',countUntil=0,countValue=0,countLoading=null;
async function visibleUnread(input,init){
  const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
  const identity=headers.get('authorization')||'';
  if(identity!==countIdentity){countIdentity=identity;countUntil=0;countLoading=null;}
  if(Date.now()<countUntil)return countValue;
  if(!countLoading)countLoading=(async()=>{
    const r=await nativeFetch('/api/messages',{method:'GET',cache:'no-store',credentials:'same-origin',headers,signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('Unread count unavailable');
    const data=policy.filterRecords(await r.json());
    if(identity===countIdentity){countValue=Number(data.unread)||0;countUntil=Date.now()+15000;}
    return Number(data.unread)||0;
  })();
  try{return await countLoading;}finally{if(identity===countIdentity)countLoading=null;}
}
window.fetch=async function(input,init){
  const url=typeof input==='string'||input instanceof URL?String(input):input.url;
  if(policy.blockedRequest(url)) return new Response(JSON.stringify({error:'이 앱에서 제공하지 않는 기능입니다.',code:'STORE_CONTENT_UNAVAILABLE'}),{status:403,headers:{'content-type':'application/json'}});
  // Bulk cleanup could affect excluded records on the shared account. It is
  // disabled in this edition; individual ordinary messages retain their UI.
  if(new URL(url,location.origin).pathname==='/api/messages' && /HIDE_COMPLETED/.test(String(init?.body||''))) return new Response('{}',{status:403,headers:{'content-type':'application/json'}});
  const response=await nativeFetch(input,init);
  const path=new URL(url,location.origin).pathname;
  if(!response.ok || !/^\/api\/(?:messages|shell\/summary|live-operations|notifications|announcements)(?:\/|$)/.test(path)) return response;
  if(!response.headers.get('content-type')?.includes('json')) return response;
  const data=policy.filterRecords(await response.json());
  if(path==='/api/shell/summary'&&data.messages){try{data.messages.unread=await visibleUnread(input,init);}catch{data.messages.unread=0;}}
  if(path==='/api/messages')countUntil=0;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
};
const attrs=['data-tab','data-mobile-tab','data-v21-route','data-route'];
const selector=attrs.map(x=>'['+x+']').join(',')+',.ss-menu-footer,.pe-pass-magnet,[data-support-package],[data-season-pass],#deleteCompletedMessages,#messageCleanupHint';
function prune(root){
  for(const el of root.querySelectorAll(selector)) if(!attrs.some(attr=>el.hasAttribute(attr)) || attrs.some(attr=>el.hasAttribute(attr)&&!policy.allowsRoute(el.getAttribute(attr)))) el.remove();
  for(const el of root.querySelectorAll('*')) if(el.shadowRoot&&!seen.has(el.shadowRoot)) watch(el.shadowRoot);
}
const seen=new WeakSet();
function watch(root){if(seen.has(root))return;seen.add(root);let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;prune(root);});}).observe(root,{subtree:true,childList:true});prune(root);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>watch(document),{once:true});else watch(document);
