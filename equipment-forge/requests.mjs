// Bounded transport / latest-only quotes. No retries may create a new operation ID.
export const FORGE_REQUEST_TIMEOUT_MS=15000;
const lockCodes=new Set(['JOINT_LOCK_BUSY','JOINT_LOCK_UNAVAILABLE','USER_ACTION_IN_PROGRESS']);
export const isForgeLockError=error=>lockCodes.has(error?.code);
const abortError=()=>Object.assign(new Error('요청이 취소되었습니다.'),{name:'AbortError'});
export function abortableDelay(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(abortError());
  const abort=()=>{clearTimeout(timer);reject(abortError());};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
export function createForgeTransport({fetchImpl=fetch,timeoutMs=FORGE_REQUEST_TIMEOUT_MS,delay=abortableDelay,jitter=()=>crypto.getRandomValues(new Uint8Array(1))[0]}={}){
 return async function request(path,{body,signal,token='',retries=0,lockOnly=false,onRetry=()=>{}}={}){
  for(let attempt=0;;attempt++){
   const controller=new AbortController();let timedOut=false;
   const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
   let failure;
   try{
    const response=await fetchImpl('/api/character/equipment/forge/'+path,{signal:controller.signal,cache:'no-store',method:body?'POST':'GET',headers:{...(token?{authorization:`Bearer ${token}`} :{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let result;try{result=await response.json();}catch{throw Object.assign(Error('서버 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.'),{code:'FORGE_RESPONSE',status:response.status,retryable:true});}
    if(!response.ok)throw Object.assign(Error(result.error||'장비 정보를 불러오지 못했습니다.'),{status:response.status,code:result.code,retryable:result.retryable===true||response.status>=500||response.status===429});
    return result;
   }catch(error){failure=timedOut?Object.assign(Error('연결이 지연됩니다. 결과 확인 또는 다시 시도를 눌러 주세요.'),{code:'FORGE_TIMEOUT',retryable:true}):error;}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
   if(signal?.aborted)throw abortError();
   const retryable=lockOnly?isForgeLockError(failure):isForgeLockError(failure)||failure.retryable||failure instanceof TypeError;
   if(attempt>=retries||!retryable)throw failure;
   const waitMs=[500,1500][attempt]??3000;onRetry(failure,attempt+1);
   await delay(waitMs+jitter(),signal);
  }
 };
}
export function createForgeQuoteQueue(request,{debounceMs=180,now=Date.now}={}){
 let active=null,pending=null,timer=null,epoch=0;const cache=new Map();
 function schedule(){if(!active&&pending&&!timer)timer=setTimeout(()=>{timer=null;void run();},debounceMs);}
 async function run(){
  if(active||!pending)return;const job=pending;pending=null;active=job;
  try{
   const result=await request(job.body,job.options);
   if(job.epoch===epoch){cache.set(job.key,{value:result,until:Math.min(now()+8000,Date.parse(result.expiresAt)-3000)});while(cache.size>12)cache.delete(cache.keys().next().value);}
   job.resolve(job.epoch===epoch&&!pending?result:null);
  }catch(error){if(job.epoch!==epoch||pending)job.resolve(null);else job.reject(error);}
  finally{active=null;schedule();}
 }
 return {
  select(key,body,options){
   if(active?.key===key&&active.epoch===epoch&&!pending)return active.promise;
   if(pending?.key===key)return pending.promise;
   pending?.resolve(null);pending=null;
   const cached=cache.get(key);if(cached&&cached.until>now())return Promise.resolve(cached.value);
   let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
   pending={key,body,options,resolve,reject,promise,epoch};schedule();return promise;
  },
  invalidate(){epoch++;cache.clear();pending?.resolve(null);pending=null;clearTimeout(timer);timer=null;}
 };
}
export const terminalForgeErrors=new Set(['JOINT_OPERATION_SUPERSEDED','FORGE_RECORD','FORGE_QUOTE_EXPIRED','FORGE_STALE','FORGE_FUNDS','FORGE_MATERIAL','FORGE_QUOTE','FORGE_NOT_OWNED','FORGE_MAX_LEVEL','FORGE_QUOTE_CONFLICT']);
export function readForgePending(storage,key){
 const raw=storage.getItem(key);if(!raw)return null;
 try{const p=JSON.parse(raw);if(p&&/^[A-Za-z0-9_-]{16,100}$/.test(p.requestId)&&/^[A-Za-z0-9_-]{16,100}$/.test(p.quoteId)&&['ENHANCE','RESTORE'].includes(p.kind))return p;}catch{}
 // Never erase an unrecognized request automatically: a charge may have committed.
 throw Object.assign(Error('이 브라우저의 미확인 요청 정보가 손상됐습니다. 운영자에게 확인을 요청해 주세요.'),{code:'FORGE_PENDING_INVALID'});
}
