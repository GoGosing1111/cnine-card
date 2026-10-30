import {BLACKCROWN_PACK,validateBlackcrownOpeningBody,blackcrownReceiptResults} from './mercenary-blackcrown-pack-v1.mjs?v=20261027-v1';
const fail=(message,code)=>Object.assign(Error(message),{code});
const terminal=new Set(['MERCENARY_BLACKCROWN_CLOSED','MERCENARY_BLACKCROWN_CHANGED','MERCENARY_BLACKCROWN_NOT_READY','MERCENARY_BLACKCROWN_FUNDS','MERCENARY_BLACKCROWN_INPUT','MERCENARY_BLACKCROWN_SOLD_OUT','MERCENARY_BLACKCROWN_NORMAL_POOL','JOINT_OPERATION_SUPERSEDED']);
export class BlackcrownOpeningSession{
 constructor({api,accountId,getAccountId,storage,present,lock=async(_key,work)=>work(),onConfirmed=()=>{},onPending=()=>{},beforeOpen=async()=>{},makeId=()=>crypto.randomUUID()}){
  Object.assign(this,{api,accountId,getAccountId,storage,present,lock,onConfirmed,onPending,beforeOpen,makeId});this.busy=false;
  this.pendingKey='cnine.blackcrown-pack.pending:'+accountId;this.receiptKey='cnine.blackcrown-pack.receipt:'+accountId;
 }
 assertAccount(){if(!this.accountId||Number(this.getAccountId())!==this.accountId)throw fail('계정이 변경됐습니다. 블랙크라운팩을 다시 열어 주세요.','BLACKCROWN_ACCOUNT_CHANGED');}
 read(key){const raw=this.storage.getItem(key);if(!raw)return null;try{return JSON.parse(raw);}catch{throw fail('이전 요청 기록을 확인해야 합니다.','BLACKCROWN_STORAGE_INVALID');}}
 async exclusive(work){if(this.busy)throw fail('현재 결과를 먼저 확인해 주세요.','BLACKCROWN_BUSY');this.assertAccount();this.busy=true;try{return await this.lock('cnine-blackcrown-pack:'+this.accountId,work);}finally{this.busy=false;}}
 async accept(receipt,onReceipt=()=>{}){
  this.assertAccount();blackcrownReceiptResults(receipt);
  if(Number(receipt.accountId)!==this.accountId)throw fail('계정의 개봉 영수증이 일치하지 않습니다.','BLACKCROWN_RECEIPT_INVALID');
  const pending=this.read(this.pendingKey);
  if(pending&&(pending.accountId!==this.accountId||pending.body.requestId!==receipt.requestId||pending.body.count!==receipt.count||pending.body.budget!==receipt.budget))throw fail('요청과 개봉 결과가 일치하지 않습니다.','BLACKCROWN_RECEIPT_INVALID');
  // The server has confirmed this exact request. Optional history storage must
  // not leave it pending when a large receipt exceeds the browser's quota.
  this.storage.removeItem(this.pendingKey);
  this.lastReceipt={requestId:receipt.requestId,accountId:this.accountId,count:receipt.count,revision:receipt.revision};
  try{this.storage.setItem(this.receiptKey,JSON.stringify(this.lastReceipt));}catch{}
  this.onConfirmed(receipt);onReceipt(receipt);await this.present(receipt);return receipt;
 }
 async submit(body){
  try{return await this.api(BLACKCROWN_PACK.openPath,{method:'POST',body});}
  catch(error){
   if(terminal.has(error.code)){this.storage.removeItem(this.pendingKey);throw error;}
   try{const receipt=await this.api(BLACKCROWN_PACK.receiptPath+'?requestId='+encodeURIComponent(body.requestId));if(receipt.status==='COMPLETED')return receipt;}
   catch(readError){if(readError.code==='JOINT_OPERATION_SUPERSEDED'){this.storage.removeItem(this.pendingKey);throw readError;}}
   throw fail('이전 결과 확인으로 같은 개봉 요청을 복구해 주세요.','BLACKCROWN_RECOVERY_REQUIRED');
  }
 }
 start(config,count){return this.exclusive(()=>this.#start(config,count));}
 startBulk(config,quote){return this.exclusive(()=>this.#start(config,quote.count,undefined,quote.budget));}
 // Keep the same account/tab lock through the whole automatic run, including
 // result videos and pauses. Every batch still gets its own durable receipt.
 sequence(work){return this.exclusive(()=>work((config,count,onReceipt)=>this.#start(config,count,onReceipt)));}
 async #start(config,count,onReceipt,budget){
  this.assertAccount();
  if(!config.userOpeningEnabled)throw fail('블랙크라운팩은 출시 준비 중입니다.','MERCENARY_BLACKCROWN_CLOSED');
  if(this.read(this.pendingKey))throw fail('이전 개봉 결과부터 확인해 주세요.','BLACKCROWN_RECOVERY_REQUIRED');
  const body=validateBlackcrownOpeningBody({requestId:this.makeId(),count,expectedRevision:config.revision,...(budget?{budget}:{})});
  // Hold the account/tab lock through the opening film. Closing it cancels
  // before any durable request, debit or limited-stock claim is created.
  await this.beforeOpen(body);this.assertAccount();
  const pending=JSON.stringify({accountId:this.accountId,body});
  try{this.storage.setItem(this.pendingKey,pending);}
  catch(error){
   const unavailable=()=>fail('브라우저에 개봉 요청을 저장할 수 없습니다. 저장 공간과 브라우저 설정을 확인해 주세요.','BLACKCROWN_STORAGE_UNAVAILABLE');
   if(error?.name!=='QuotaExceededError')throw unavailable();
   // Reclaim only this pack's optional history pointer. A durable request is
   // still mandatory before any purchase; never clear other browser data.
   try{
    this.lastReceipt??=this.read(this.receiptKey);
    this.storage.removeItem(this.receiptKey);this.storage.setItem(this.pendingKey,pending);
   }catch{throw unavailable();}
  }
  this.onPending();return this.accept(await this.submit(body),onReceipt);
 }
 // On entry, reconcile only the saved request. Never POST or resume automation
 // without the player's explicit recovery/opening action.
 reconcilePending(options){return this.exclusive(()=>this.#recover(true,options));}
 recover(){return this.exclusive(()=>this.#recover(false));}
 async #recover(readOnly,options){
  const assertCurrent=()=>{this.assertAccount();if(options?.signal?.aborted)throw Object.assign(Error('결과 확인을 잠시 중지했습니다.'),{name:'AbortError'});};
  assertCurrent();
  const pending=this.read(this.pendingKey);if(readOnly&&!pending)return null;
  const saved=pending?null:this.lastReceipt??this.read(this.receiptKey),requestId=pending?.body.requestId??saved?.requestId;
  if(!requestId)throw fail('이 계정의 이전 개봉 기록이 없습니다.','BLACKCROWN_NO_RECEIPT');
  if(pending&&pending.accountId!==this.accountId)throw fail('저장된 요청의 계정이 다릅니다.','BLACKCROWN_ACCOUNT_CHANGED');
  let receipt;try{receipt=await this.api(BLACKCROWN_PACK.receiptPath+'?requestId='+encodeURIComponent(requestId),options);}catch(error){
   assertCurrent();
   if(error.code==='JOINT_OPERATION_SUPERSEDED'&&pending){this.assertAccount();this.storage.removeItem(this.pendingKey);return {requestId,status:'CANCELLED'};}
   if(error.code!=='JOINT_NOT_FOUND'||!pending)throw error;
  }
  assertCurrent();
  if(readOnly&&receipt?.status!=='COMPLETED')return {requestId,status:receipt?.status||'UNCONFIRMED',retryable:true};
  if(receipt?.status!=='COMPLETED'){if(!pending)throw fail('결과 확인이 필요합니다.','BLACKCROWN_RECOVERY_REQUIRED');receipt=await this.submit(pending.body);}
  return this.accept(receipt);
 }
}
