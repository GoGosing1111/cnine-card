export const BLACKCROWN_RECEIPT_RETRY_DELAYS=Object.freeze([1000,3000,8000]);
export function blackcrownReceiptRetryable(error){
 if(!error)return true;
 if(error.retryable===false)return false;
 if(['BLACKCROWN_RECOVERY_REQUIRED','JOINT_NOT_FOUND'].includes(error.code))return true;
 if(error.code==='ACCOUNT_RESPONSE_STALE')return error.retryable===true;
 if([401,403,423].includes(error.status))return false;
 return error.retryable===true||['TypeError','AbortError'].includes(error.name)||[408,429,500,502,503,504].includes(error.status);
}

// One bounded, receipt-only burst. The caller owns account/browser locks and
// never passes a purchase callback. Lifecycle events coalesce with queued work.
export class BlackcrownReceiptRecovery{
 constructor({getPendingId,canRead,isBusy,read,onError=()=>{},schedule=(work,ms)=>setTimeout(work,ms),cancel=timer=>clearTimeout(timer),delays=BLACKCROWN_RECEIPT_RETRY_DELAYS}){
  Object.assign(this,{getPendingId,canRead,isBusy,read,onError,schedule,cancel,delays});
  this.key=null;this.attempts=0;this.timer=null;this.flight=null;this.requested=false;this.blocked=false;this.disposed=false;this.wakeAfterAbort=false;
 }
 request({resume=false}={}){
  if(this.disposed)return;
  const key=this.getPendingId();
  if(!key){this.suspend();this.key=null;this.requested=false;return;}
  if(key!==this.key){this.key=key;this.attempts=0;this.blocked=false;}
  if(this.blocked)return;
  if(this.flight?.signal.aborted)this.wakeAfterAbort=true;
  if(resume&&!this.requested&&!this.flight)this.attempts=0;
  this.requested=this.attempts<this.delays.length;
  this.queue(resume?0:this.delays[this.attempts]);
 }
 queue(delay=this.delays[this.attempts]){
  if(this.disposed||!this.requested||this.timer!==null||this.flight||!this.canRead()||this.isBusy())return;
  this.timer=this.schedule(()=>{this.timer=null;void this.run();},delay);
 }
 async run(){
  if(this.disposed||!this.requested||!this.canRead()||this.isBusy())return;
  if(this.getPendingId()!==this.key){this.request();return;}
  const controller=new AbortController();this.flight=controller;this.attempts++;
  try{await this.read({signal:controller.signal});}
  catch(error){
   if(!controller.signal.aborted&&!this.disposed){
    if(!blackcrownReceiptRetryable(error)){this.blocked=true;this.requested=false;}
    this.onError(error);
   }
  }finally{
   this.flight=null;
   if(controller.signal.aborted)this.attempts=Math.max(0,this.attempts-1);
   if(!this.getPendingId()||this.attempts>=this.delays.length)this.requested=false;
   // An interrupted read waits for an explicit online/visible wake-up.
   const wake=this.wakeAfterAbort;this.wakeAfterAbort=false;
   if(wake){this.request({resume:true});}else if(!controller.signal.aborted)this.queue();
  }
 }
 suspend(){
  if(this.timer!==null)this.cancel(this.timer);this.timer=null;
  this.flight?.abort();
 }
 stop(){this.suspend();this.requested=false;this.blocked=true;}
 destroy(){this.disposed=true;this.suspend();this.requested=false;}
}
