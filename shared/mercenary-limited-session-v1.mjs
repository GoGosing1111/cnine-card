import {LIMITED_PACK,limitedPackPrice} from './mercenary-limited-pack-v1.mjs';
const fail=(message,code)=>Object.assign(Error(message),{code});
const terminalCodes=new Set(['MERCENARY_LIMITED_SOLD_OUT','MERCENARY_LIMITED_POLICY_CHANGED','MERCENARY_LIMITED_PRICE_CHANGED','MERCENARY_LIMITED_NOT_READY','MERCENARY_LIMITED_FUNDS','MERCENARY_LIMITED_DISABLED','MERCENARY_LIMITED_INPUT','MERCENARY_LIMITED_COUNT','JOINT_OPERATION_SUPERSEDED']);
export function limitedAutoPlan(settings,total,batch){
 if(!Number.isSafeInteger(total)||total<1||total>LIMITED_PACK.maxAuto||![1,10].includes(batch))throw fail('자동 개봉은 1~1,000회, 묶음은 1회 또는 10회로 선택하세요.','LIMITED_AUTO_INPUT');
 const tens=batch===10?Math.floor(total/10):0,ones=total-tens*10;
 return {total,batch,tens,ones,cost:(BigInt(limitedPackPrice(settings,1))*BigInt(ones)+(tens?BigInt(limitedPackPrice(settings,10))*BigInt(tens):0n)).toString()};
}
export class LimitedOpeningSession{
 constructor({api,storage,accountId,getAccountId,present,onState=()=>{},lock=async(_key,fn)=>fn(),makeId=()=>crypto.randomUUID(),canContinue=()=>true}){
  Object.assign(this,{api,storage,accountId,getAccountId,present,onState,lock,makeId,canContinue});
  this.pendingKey='cnine.limited-pack.pending:'+accountId;this.receiptKey='cnine.limited-pack.receipt:'+accountId;this.busy=false;this.stopped=false;this.completed=0;
 }
 assertAccount(){if(!this.accountId||Number(this.getAccountId())!==this.accountId)throw fail('계정이 변경됐습니다. 현재 계정에서 개봉 화면을 다시 열어 주세요.','LIMITED_ACCOUNT_CHANGED');}
 read(key){const raw=this.storage.getItem(key);if(!raw)return null;try{return JSON.parse(raw);}catch{throw fail('저장된 요청을 확인할 수 없습니다. 새 개봉을 중지했습니다.','LIMITED_STORAGE_INVALID');}}
 pending(){return this.read(this.pendingKey);}
 stop(){this.stopped=true;this.onState({state:'stopping',completed:this.completed});}
 async exclusive(work){
  if(this.busy)throw fail('현재 개봉이 완료된 뒤 이용하세요.','LIMITED_BUSY');
  this.assertAccount();this.busy=true;this.stopped=false;
  try{return await this.lock('cnine-limited-pack:'+this.accountId,work);}
  finally{this.busy=false;this.onState({state:'idle',completed:this.completed});}
 }
 async accept(receipt){
  if(receipt?.status!=='COMPLETED'||Number(receipt.accountId)!==this.accountId||!Array.isArray(receipt.draws)||receipt.draws.length!==receipt.count||![1,10].includes(receipt.count))throw fail('계정과 개봉 영수증을 확인하지 못했습니다. 이전 결과 확인을 눌러 주세요.','LIMITED_RECEIPT_INVALID');
  const pending=this.pending();if(pending&&(receipt.requestId!==pending.body.requestId||receipt.count!==pending.body.count))throw fail('개봉 요청과 영수증이 다릅니다.','LIMITED_RECEIPT_INVALID');
  // Save the confirmed receipt first. A storage failure never starts another purchase.
  this.storage.setItem(this.receiptKey,JSON.stringify(receipt));
  this.storage.removeItem(this.pendingKey);
  this.completed+=receipt.count;this.onState({state:'confirmed',completed:this.completed,receipt});
  this.assertAccount();this.onState({state:'presenting',completed:this.completed});
  return await this.present(receipt);
 }
 async submit(body){
  try{return await this.api(LIMITED_PACK.openPath,{method:'POST',body});}
  catch(error){
   if(terminalCodes.has(error.code)){this.storage.removeItem(this.pendingKey);throw error;}
   // Read once after a lost acknowledgement; never spin or replace its request ID.
   try{const found=await this.api(LIMITED_PACK.receiptPath+'?requestId='+encodeURIComponent(body.requestId));if(found.status==='COMPLETED')return found;}
   catch(readError){if(readError.code==='JOINT_OPERATION_SUPERSEDED'){this.storage.removeItem(this.pendingKey);throw readError;}}
   throw fail('개봉 결과 확인이 필요합니다. 자동 진행을 멈췄습니다. 이전 결과 확인으로 같은 요청을 복구하세요.','LIMITED_RECOVERY_REQUIRED');
  }
 }
 async start(config,{total=1,batch=1}={}){
  const plan=limitedAutoPlan(config.packSettings,total,batch);
  return this.exclusive(async()=>{
   if(!config.userOpeningEnabled)throw fail('리미티드 용병팩은 출시 준비 중입니다.','MERCENARY_LIMITED_DISABLED');
   if(this.pending())throw fail('이전 개봉 결과부터 확인해 주세요.','LIMITED_RECOVERY_REQUIRED');
   this.completed=0;this.onState({state:'started',plan});
   while(this.completed<total&&!this.stopped&&this.canContinue()){
    this.assertAccount();
    const count=batch===10&&total-this.completed>=10?10:1;
    const body={requestId:this.makeId(),count,expectedRevision:config.packRevision,expectedPolicyRevision:config.revision};
    this.storage.setItem(this.pendingKey,JSON.stringify({accountId:this.accountId,body,createdAt:new Date().toISOString()}));
    this.onState({state:'requesting',completed:this.completed,count});
    const receipt=await this.submit(body);
    if(!await this.accept(receipt)){this.stopped=true;break;}
   }
   this.onState({state:this.completed===total?'complete':'stopped',completed:this.completed,total});
   return {completed:this.completed,total};
  });
 }
 async recover(){
  return this.exclusive(async()=>{
   this.completed=0;const pending=this.pending();
   if(pending){
    if(pending.accountId!==this.accountId)throw fail('저장된 요청의 계정이 다릅니다.','LIMITED_ACCOUNT_CHANGED');
    let receipt;
    try{receipt=await this.api(LIMITED_PACK.receiptPath+'?requestId='+encodeURIComponent(pending.body.requestId));}
    catch(error){if(error.code==='JOINT_OPERATION_SUPERSEDED'){this.storage.removeItem(this.pendingKey);throw error;}if(error.code!=='JOINT_NOT_FOUND')throw error;}
    if(receipt?.status!=='COMPLETED')receipt=await this.submit(pending.body);
    await this.accept(receipt);return receipt;
   }
   const receipt=this.read(this.receiptKey);
   if(!receipt)throw fail('이 계정의 이전 개봉 내역이 없습니다.','LIMITED_NO_RECEIPT');
   // The server is authoritative even for a locally cached receipt.
   const confirmed=await this.api(LIMITED_PACK.receiptPath+'?requestId='+encodeURIComponent(receipt.requestId));await this.accept(confirmed);return confirmed;
  });
 }
}
