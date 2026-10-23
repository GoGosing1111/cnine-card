// The public catalog does not depend on a player token or account-sync epoch.
export async function requestPublicCodex({fetchImpl=globalThis.fetch,timeoutMs=15000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl('/api/mercenary-codex',{cache:'no-store',credentials:'omit',signal:controller.signal});
    const value=await response.json();
    if(!response.ok)throw Object.assign(Error(value?.error||'용병 도감을 불러오지 못했습니다.'),{status:response.status});
    return value;
  }catch(error){
    if(error.name==='AbortError')throw Object.assign(Error('용병 도감 연결이 지연되고 있습니다. 다시 불러와 주세요.'),{code:'MERCENARY_LOAD_TIMEOUT'});
    throw error;
  }finally{clearTimeout(timer);}
}

// Each panel receives its own result immediately. A slow account response must
// not hold the public collection behind a Promise.allSettled rendering barrier.
export async function loadCodexPanels({catalog,account,onCatalog,onAccount,onCatalogError,onAccountError}){
  await Promise.allSettled([
    Promise.resolve().then(catalog).then(onCatalog).catch(onCatalogError),
    Promise.resolve().then(account).then(onAccount).catch(onAccountError)
  ]);
}
