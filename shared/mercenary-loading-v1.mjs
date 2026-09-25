// A deadline includes response bodies/decoding, and closing a screen releases its waiter.
export function withMercenaryDeadline(task, {timeoutMs=12000, signal, message='불러오기가 지연됩니다. 다시 시도해 주세요.'}={}) {
  return new Promise((resolve,reject)=>{
    let timer,settled=false;
    const finish=(callback,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);callback(value);
    };
    const abort=()=>finish(reject,new DOMException('화면을 닫았습니다.','AbortError'));
    if(signal?.aborted)abort();
    else {
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>finish(reject,Object.assign(Error(message),{name:'TimeoutError',code:'MERCENARY_LOAD_TIMEOUT'})),timeoutMs);
    }
    const pending=typeof task==='function'?Promise.resolve().then(()=>settled?undefined:task()):Promise.resolve(task);
    pending.then(value=>finish(resolve,value),error=>finish(reject,error));
  });
}
