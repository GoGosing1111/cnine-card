const DEFAULT_API='https://cnine-card.pages.dev/api';
const getStore=keys=>chrome.storage.local.get(keys);
const setStore=data=>chrome.storage.local.set(data);

async function api(path,options={}){
  const {adminToken,apiBase=DEFAULT_API}=await getStore(['adminToken','apiBase']);
  if(!adminToken) throw new Error('씨켓몬 관리자 인증을 먼저 가져오세요.');
  let response;
  try{
    response=await fetch(`${String(apiBase).replace(/\/$/,'')}/${path}`,{
      ...options,
      headers:{'content-type':'application/json','authorization':`Bearer ${adminToken}`,...(options.headers||{})}
    });
  }catch(error){
    throw new Error(`씨켓몬 서버 연결 실패: ${error?.message||'네트워크 또는 CORS 오류'}`);
  }
  const data=await response.json().catch(()=>({error:'서버 응답을 읽지 못했습니다.'}));
  if(!response.ok) {const e=new Error(data.error||`요청 실패 (${response.status})`);e.data=data;throw e;}
  return data;
}


async function syncAdminTokenFromTabs(){
  const tabs=await chrome.tabs.query({url:['https://cnine-card.pages.dev/admin','https://cnine-card.pages.dev/admin/*']});
  for(const tab of tabs){
    if(!tab.id) continue;
    try{
      const out=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||''});
      const token=String(out?.[0]?.result||'').trim();
      if(token){await setStore({adminToken:token,adminTokenSavedAt:new Date().toISOString()});return true;}
    }catch(e){}
  }
  return false;
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  (async()=>{
    if(message?.type==='CNINE_SAVE_ADMIN_TOKEN'){
      const token=String(message.token||'').trim();
      if(!token) throw new Error('관리자 토큰이 없습니다.');
      await setStore({adminToken:token,adminTokenSavedAt:new Date().toISOString()});
      return {ok:true};
    }
    if(message?.type==='CNINE_STATUS'){
      await syncAdminTokenFromTabs();
      const state=await getStore(['adminToken','adminTokenSavedAt','apiBase','quickAmounts','defaultReason']);
      return {ok:true,connected:Boolean(state.adminToken),...state};
    }
    if(message?.type==='CNINE_SYNC_AUTH'){const connected=await syncAdminTokenFromTabs();return {ok:true,connected};}
    if(message?.type==='CNINE_LOGOUT'){await chrome.storage.local.remove(['adminToken','adminTokenSavedAt']);return {ok:true};}
    if(message?.type==='CNINE_RESOLVE')return api('admin/wago-extension/resolve',{method:'POST',body:JSON.stringify({wagoNickname:message.wagoNickname,sourceUrl:message.sourceUrl})});
    if(message?.type==='CNINE_GRANT')return api('admin/wago-extension/grant',{method:'POST',body:JSON.stringify(message.payload||{})});
    if(message?.type==='CNINE_SAVE_SETTINGS'){await setStore(message.settings||{});return {ok:true};}
    throw new Error('지원하지 않는 요청입니다.');
  })().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message,data:error.data||null}));
  return true;
});
