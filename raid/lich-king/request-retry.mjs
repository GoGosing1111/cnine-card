// Retry only a confirmed lock/CAS refusal. The caller retains the exact input
// and receipt ID; network failures and gameplay errors are never auto-replayed.
const delays=[120,240,400,640];
const contention=new Set(['JOINT_LOCK_BUSY','USER_ACTION_IN_PROGRESS','LICH_BUSY']);
export const isLichRequestBusy=error=>error?.status===409&&contention.has(error.code);
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
