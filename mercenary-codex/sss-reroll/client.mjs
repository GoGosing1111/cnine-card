import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
export const rerollToken=()=>{try{return localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{return '';}};
const fail=(code,message)=>Object.assign(Error(message),{code});
const terminal=new Set(['JOINT_OPERATION_SUPERSEDED','SSS_REROLL_SOURCE','SSS_REROLL_CLOSED','SSS_REROLL_NOT_READY','SSS_REROLL_OWNERSHIP','SSS_REROLL_EQUIPPED','SSS_REROLL_BALANCE','SSS_REROLL_POLICY_CHANGED','SSS_REROLL_CATALOG_CHANGED','SSS_REROLL_SOURCE_CHANGED']);
export const rerollPendingKey=id=>'cnine.sss-reroll.pending:'+id;
export function readRerollPending(storage,key){
 const raw=storage.getItem(key);if(!raw)return null;
 try{const p=JSON.parse(raw);if(/^[A-Za-z0-9_-]{16,100}$/.test(p?.requestId)&&/^V-\d{3}$/.test(p.sourceCode))return{requestId:p.requestId,sourceCode:p.sourceCode};}catch{}
 throw fail('REROLL_PENDING','이전 요청 기록을 확인할 수 없습니다. 운영자에게 문의해 주세요.');
}
export function validateRerollReceipt(value,requestId,accountId){
 const invalid=()=>fail('REROLL_RECEIPT','결과를 확인하지 못했습니다. 이전 결과를 다시 확인해 주세요.');
 if(value?.requestId!==requestId||!['PENDING','COMPLETED'].includes(value.status))throw invalid();
 if(value.status==='PENDING')return value;
 const s=value.source,r=value.result;
 if(value.accountId!==accountId||value.itemCode!=='MERCENARY_SSS_REROLL_TICKET'||value.itemConsumed!==1||!s||!r||
  !/^V-\d{3}$/.test(s.code)||!/^V-\d{3}$/.test(r.mercenaryCode)||s.code===r.mercenaryCode||r.rank!=='SSS'||r.quantity!==1||
  !Number.isSafeInteger(s.totalBefore)||s.totalBefore<1||s.totalAfter!==s.totalBefore-1||
  !Number.isSafeInteger(r.totalCopiesAfter)||r.totalCopiesAfter<1||r.duplicatesAfter!==r.totalCopiesAfter-1||typeof r.name!=='string')throw invalid();
 return value;
}
// Store the request before spending. Unknown outcomes keep that same request,
// including across reloads; opening the result again never submits another draw.
export function createRerollClient({accountId,token=rerollToken(),currentToken=rerollToken,storage=localStorage,request=jointAccountRequest,locks=globalThis.navigator?.locks}={}){
 if(!Number.isSafeInteger(accountId)||accountId<1)throw fail('REROLL_AUTH','로그인이 필요합니다.');
 const key=rerollPendingKey(accountId);let flight=null;
 const guard=()=>{if(currentToken()!==token)throw fail('REROLL_SESSION','계정이 변경됐습니다. 화면을 새로 열어 주세요.');};
 const pending=()=>readRerollPending(storage,key);
 const acknowledge=requestId=>{if(pending()?.requestId===requestId)storage.removeItem(key);};
 const api=async(path,options)=>{guard();const value=await request(path,{timeoutMs:15000,...options});guard();return value;};
 const receipt=async requestId=>validateRerollReceipt(await api('mercenary-sss-reroll/receipt?requestId='+encodeURIComponent(requestId)),requestId,accountId);
 async function execute(sourceCode,{submit=true}={}){
  guard();let p=pending();
  if(p){
   let previous=null;try{previous=await receipt(p.requestId);}catch(error){if(error.code!=='JOINT_NOT_FOUND')throw error;}
   if(previous?.status==='COMPLETED'||!submit)return previous;
  }else{
   if(!submit)return null;
   if(!/^V-\d{3}$/.test(sourceCode||''))throw fail('REROLL_SELECTION','투입할 일반 SSS 용병을 선택하세요.');
   p={requestId:crypto.randomUUID(),sourceCode};
   try{storage.setItem(key,JSON.stringify(p));if(pending()?.requestId!==p.requestId)throw Error();}catch{throw fail('REROLL_STORAGE','요청을 보관하지 못해 시작하지 않았습니다. 브라우저 저장 공간을 확인하세요.');}
  }
  return validateRerollReceipt(await api('mercenary-sss-reroll/execute',{method:'POST',body:p}),p.requestId,accountId);
 }
 function run(sourceCode,options){
  if(flight)return flight;
  const task=async()=>{try{return await execute(sourceCode,options);}catch(error){if(terminal.has(error.code)){const p=pending();if(p)acknowledge(p.requestId);}throw error;}};
  flight=Promise.resolve().then(()=>locks?locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw fail('REROLL_BUSY','다른 창에서 결과를 확인 중입니다. 잠시 후 다시 확인하세요.');return task();}):task()).finally(()=>{flight=null;});return flight;
 }
 return{pending,acknowledge,run,receipt,async state(){const s=await api('mercenary-sss-reroll/state');if(s.accountId!==accountId||!Array.isArray(s.cards))throw fail('REROLL_STATE','보유 용병을 확인하지 못했습니다.');return s;}};
}
