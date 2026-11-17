// Retry only a confirmed lock/CAS refusal. The caller retains the exact input
// and receipt ID; network failures and gameplay errors are never auto-replayed.
const delays=[120,240,400,640];
const contention=new Set(['JOINT_LOCK_BUSY','USER_ACTION_IN_PROGRESS','LICH_BUSY']);
export const isLichRequestBusy=error=>error?.status===409&&contention.has(error.code);
// A status read can start from an older committed room while an action commits.
// Its later wall clock does not make its consumed tokens or HP newer.
export function acceptLichSnapshot(current,next){
  if(!current||current.id!==next.id)return true;
  if(next.revision<current.revision||next.eventSeq<current.eventSeq)return false;
  return next.revision>current.revision||next.eventSeq>current.eventSeq||next.serverNow>=current.serverNow;
}
// The final attack window is only 12s. Bound the UI wait and contention retries,
// retain the receipt, and let the player retry the same intent safely.
// Polls continue independently; a timeout never implies server-side failure.
export async function withLichInputDeadline(send,{signal,timeoutMs=2500,onLateResult}={}){
  signal?.throwIfAborted();
  const controller=new AbortController();let timer,abort,timedOut=false;
  const stopped=new Promise((_,reject)=>{
    const stop=reason=>{controller.abort(reason);reject(reason);};
    abort=()=>stop(signal.reason||new DOMException('Aborted','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{timedOut=true;stop(Object.assign(new Error('입력 응답이 늦어지고 있습니다. 전황을 확인한 뒤 같은 버튼으로 다시 시도하세요.'),{code:'LICH_INPUT_TIMEOUT',status:408,retryable:true}));},timeoutMs);
  });
  const task=Promise.resolve().then(()=>send(controller.signal));
  // The caller may keep an already-sent request alive with its screen lifetime.
  // Its late authoritative result remains useful after the short UI deadline.
  task.then(result=>{if(timedOut&&!signal?.aborted)onLateResult?.(result);},()=>{}).catch(()=>{});
  try{return await Promise.race([task,stopped]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
const superseded=()=>Object.assign(new Error('현재 전황으로 갱신되었습니다.'),{code:'LICH_INPUT_SUPERSEDED',status:409});
function pause(ms,signal){
  return new Promise((resolve,reject)=>{
    const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    const abort=()=>finish(signal.reason||new DOMException('Aborted','AbortError'));
    const timer=setTimeout(()=>finish(),ms);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
export async function retryLichRequest(send,{signal,canRetry=()=>true}={}){
  for(let attempt=0;;attempt++){
    signal?.throwIfAborted();
    try{return await send();}
    catch(error){
      if(!isLichRequestBusy(error))throw error;
      // Keep the receipt ID even when an older server omitted this hint.
      error.retryable=true;
      if(!canRetry())throw superseded();
      if(attempt===delays.length)throw error;
      await pause(Math.max(delays[attempt],Math.min(640,Number(error.retryAfterMs)||0)),signal);
      if(!canRetry())throw superseded();
    }
  }
}
