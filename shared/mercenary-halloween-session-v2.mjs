import {HALLOWEEN_PACK,validateHalloweenOpeningBody,halloweenReceiptResults} from './mercenary-halloween-pack-v1.mjs?v=20261017-staged';
const fail=(message,code)=>Object.assign(Error(message),{code});
const terminal=new Set(['MERCENARY_HALLOWEEN_CLOSED','MERCENARY_HALLOWEEN_CHANGED','MERCENARY_HALLOWEEN_NOT_READY','MERCENARY_HALLOWEEN_FUNDS','MERCENARY_HALLOWEEN_INPUT','MERCENARY_HALLOWEEN_SOLD_OUT','MERCENARY_HALLOWEEN_NORMAL_POOL','JOINT_OPERATION_SUPERSEDED']);
export class HalloweenOpeningSession{
 constructor({api,accountId,getAccountId,storage,present,lock=async(_key,work)=>work(),onConfirmed=()=>{},makeId=()=>crypto.randomUUID()}){
  Object.assign(this,{api,accountId,getAccountId,storage,present,lock,onConfirmed,makeId});this.busy=false;
  this.pendingKey='cnine.halloween-pack.pending:'+accountId;this.receiptKey='cnine.halloween-pack.receipt:'+accountId;
 }
 assertAccount(){if(!this.accountId||Number(this.getAccountId())!==this.accountId)throw fail('계정이 변경됐습니다. 할로윈팩을 다시 열어 주세요.','HALLOWEEN_ACCOUNT_CHANGED');}
 read(key){const raw=this.storage.getItem(key);if(!raw)return null;try{return JSON.parse(raw);}catch{throw fail('이전 요청 기록을 확인해야 합니다.','HALLOWEEN_STORAGE_INVALID');}}
 async exclusive(work){if(this.busy)throw fail('현재 결과를 먼저 확인해 주세요.','HALLOWEEN_BUSY');this.assertAccount();this.busy=true;try{return await this.lock('cnine-halloween-pack:'+this.accountId,work);}finally{this.busy=false;}}
 async accept(receipt){
  this.assertAccount();halloweenReceiptResults(receipt);
  if(Number(receipt.accountId)!==this.accountId)throw fail('계정의 개봉 영수증이 일치하지 않습니다.','HALLOWEEN_RECEIPT_INVALID');
  const pending=this.read(this.pendingKey);
  if(pending&&(pending.accountId!==this.accountId||pending.body.requestId!==receipt.requestId||pending.body.count!==receipt.count))throw fail('요청과 개봉 결과가 일치하지 않습니다.','HALLOWEEN_RECEIPT_INVALID');
  this.storage.setItem(this.receiptKey,JSON.stringify(receipt));this.storage.removeItem(this.pendingKey);this.onConfirmed(receipt);await this.present(receipt);return receipt;
 }
 async submit(body){
  try{return await this.api(HALLOWEEN_PACK.openPath,{method:'POST',body});}
  catch(error){
   if(terminal.has(error.code)){this.storage.removeItem(this.pendingKey);throw error;}
   try{const receipt=await this.api(HALLOWEEN_PACK.receiptPath+'?requestId='+encodeURIComponent(body.requestId));if(receipt.status==='COMPLETED')return receipt;}
   catch(readError){if(readError.code==='JOINT_OPERATION_SUPERSEDED'){this.storage.removeItem(this.pendingKey);throw readError;}}
   throw fail('이전 결과 확인으로 같은 개봉 요청을 복구해 주세요.','HALLOWEEN_RECOVERY_REQUIRED');
  }
 }
 start(config,count){return this.exclusive(async()=>{
  if(!config.userOpeningEnabled)throw fail('할로윈팩은 출시 준비 중입니다.','MERCENARY_HALLOWEEN_CLOSED');
  if(this.read(this.pendingKey))throw fail('이전 개봉 결과부터 확인해 주세요.','HALLOWEEN_RECOVERY_REQUIRED');
  const body=validateHalloweenOpeningBody({requestId:this.makeId(),count,expectedRevision:config.revision});
  this.storage.setItem(this.pendingKey,JSON.stringify({accountId:this.accountId,body}));return this.accept(await this.submit(body));
 });}
 recover(){return this.exclusive(async()=>{
  const pending=this.read(this.pendingKey),saved=this.read(this.receiptKey),requestId=pending?.body.requestId??saved?.requestId;
  if(!requestId)throw fail('이 계정의 이전 개봉 기록이 없습니다.','HALLOWEEN_NO_RECEIPT');
  if(pending&&pending.accountId!==this.accountId)throw fail('저장된 요청의 계정이 다릅니다.','HALLOWEEN_ACCOUNT_CHANGED');
  let receipt;try{receipt=await this.api(HALLOWEEN_PACK.receiptPath+'?requestId='+encodeURIComponent(requestId));}catch(error){if(error.code!=='JOINT_NOT_FOUND'||!pending)throw error;}
  if(receipt?.status!=='COMPLETED'){if(!pending)throw fail('결과 확인이 필요합니다.','HALLOWEEN_RECOVERY_REQUIRED');receipt=await this.submit(pending.body);}
  return this.accept(receipt);
 });}
}
