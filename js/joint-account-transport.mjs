const TOKEN_KEY='cnine_card_api_token',CLIENT_KEY='cnine_player_client_id_v1552';
export async function jointAccountRequest(path,{method='GET',body,signal,timeoutMs=30000,credential='player'}={}){
  const tokenKey=credential==='admin'?'cnine_admin_token':TOKEN_KEY;
  let token='',client='';try{token=localStorage.getItem(tokenKey)||sessionStorage.getItem(tokenKey)||'';client=localStorage.getItem(CLIENT_KEY)||'';
    if(!/^[a-zA-Z0-9:_-]{12,120}$/.test(client)){client=crypto.randomUUID();localStorage.setItem(CLIENT_KEY,client);}}catch{}
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(abort,timeoutMs);
  try{
    const response=await fetch('/api/'+path,{method,cache:'no-store',credentials:'same-origin',signal:controller.signal,
      headers:{'content-type':'application/json',authorization:token?`Bearer ${token}`:'','x-cnine-client-id':client},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let value;
    try{value=await response.json();}
    catch(error){
      if(error?.name==='AbortError')throw error;
      // Empty/truncated proxy responses are not a completed transaction or a
      // confirmed missing receipt. Keep the HTTP status without exposing HTML.
      throw Object.assign(new Error('서버 응답이 비어 있거나 중간에 끊겼습니다. 잠시 후 다시 확인해 주세요.'),{
        code:'JOINT_RESPONSE_INVALID',status:response.status,
        retryable:response.ok||response.status===408||response.status===429||response.status>=500
      });
    }
    if(!response.ok)throw Object.assign(new Error(value?.error||'요청을 처리하지 못했습니다.'),{...value,status:response.status});
    if(String(method).toUpperCase()!=='GET')window.dispatchEvent(new Event('cnine:account-mutation'));
    return value;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export const jointAdminRequest=(path,options={})=>jointAccountRequest(path,{...options,credential:'admin'});
