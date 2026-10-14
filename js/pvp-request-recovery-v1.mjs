export function createPvpReceiptStore(storage,{uuid=()=>crypto.randomUUID(),now=()=>Date.now()}={}){
 const key=id=>'cnine:pvp-pending:20261015:'+Number(id);
 function read(id){try{const v=JSON.parse(storage.getItem(key(id))||'null');return v&&v.userId===Number(id)&&typeof v.requestId==='string'&&typeof v.matchToken==='string'?v:null;}catch{return null;}}
 function begin(id,{matchToken,opponentId}){
  const prior=read(id);if(prior)return prior;
  if(!Number.isSafeInteger(Number(id))||Number(id)<1||!matchToken)throw Error('랭크전 접속 정보를 다시 확인하세요.');
  const value={userId:Number(id),requestId:uuid(),matchToken,opponentId:Number(opponentId)||0,createdAt:now()};
  storage.setItem(key(id),JSON.stringify(value));return value;
 }
 function clear(id,requestId){if(read(id)?.requestId===requestId)storage.removeItem(key(id));}
 async function execute(id,input,request){
  const pending=begin(id,input);
  try{const result=await request('pvp/fight',{method:'POST',body:JSON.stringify({requestId:pending.requestId,matchToken:pending.matchToken})},{timeoutMs:20000});clear(id,pending.requestId);return result;}
  catch(error){
   // Validation failures cannot have committed a battle; timeouts, lock waits,
   // gateway failures and conflicts retain the exact idempotency key.
   if(([400,404,410,422].includes(error.status)||['PVP_MATCH_EXPIRED','PVP_MATCH_SCORE_CHANGED','PVP_MATCH_FORMATION_CHANGED','PVP_MATCH_CONFLICT'].includes(error.code))&&!error.retryable)clear(id,pending.requestId);
   else error.pvpReceiptPending=true;
   throw error;
  }
 }
 return {read,begin,clear,execute};
}
if(typeof window!=='undefined'&&!window.CNinePvpRecovery)window.CNinePvpRecovery=createPvpReceiptStore(sessionStorage);
