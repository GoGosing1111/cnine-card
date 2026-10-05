import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {mercenaryLevelState} from '../../shared/mercenary-level-v1.mjs';
const base='mercenaries/v3/leveling/';
export const levelToken=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
export function validateLevelReceipt(r,id){
 if(r?.requestId!==id||!['PENDING','COMPLETED'].includes(r.status))throw Error('성장 결과를 확인하지 못했습니다. 같은 요청을 다시 확인하세요.');
 if(r.status==='COMPLETED'){
  if(!['TRAIN','BREAKTHROUGH'].includes(r.action)||!/^V-\d{3}$/.test(r.mercenaryCode)||!r.result)throw Error('성장 영수증을 확인하지 못했습니다.');
  const before=mercenaryLevelState(r.result.before),after=mercenaryLevelState(r.result.after);if(after.revision!==before.revision+1)throw Error('성장 영수증 버전을 확인하세요.');
  if(r.action==='BREAKTHROUGH'&&typeof r.result.success!=='boolean')throw Error('돌파 결과를 확인하세요.');
 }
 return r;
}
export function createLevelClient({accountId,storage=localStorage,token=levelToken(),currentToken=levelToken,request=jointAccountRequest,locks=globalThis.navigator?.locks}={}){
 if(!Number.isSafeInteger(accountId)||accountId<1)throw Error('로그인 계정을 확인하세요.');
 const key='cnine.mercenary.level.pending:'+accountId;let flight=null;
 const guard=()=>{if(currentToken()!==token)throw Error('로그인 계정이 변경되었습니다. 다시 불러오세요.');};
 const pending=()=>{const raw=storage.getItem(key);if(!raw)return null;let p;try{p=JSON.parse(raw);}catch{}if(!p||!['train','breakthrough'].includes(p.action)||!/^[A-Za-z0-9_-]{16,100}$/.test(p.body?.requestId)||!/^V-\d{3}$/.test(p.body?.mercenaryCode)||!Number.isSafeInteger(p.body?.revision))throw Error('미확인 성장 요청을 읽지 못했습니다. 운영자에게 확인해 주세요.');return p;};
 const acknowledge=id=>{guard();if(pending()?.body.requestId===id)storage.removeItem(key);};
 const api=async(path,options)=>{guard();const r=await request(base+path,{...options,timeoutMs:15000});guard();return r;};
 async function lookup(p){try{return validateLevelReceipt(await api('receipt?requestId='+encodeURIComponent(p.body.requestId)),p.body.requestId);}catch(e){if(e.code==='JOINT_NOT_FOUND')return null;throw e;}}
 const terminal=new Set(['JOINT_OPERATION_SUPERSEDED','MERCENARY_LEVEL_CONFLICT','MERCENARY_LEVEL_NOT_OWNED','MERCENARY_LEVEL_RANK','MERCENARY_LEVEL_DUPLICATES','MERCENARY_LEVEL_MATERIALS','MERCENARY_LEVEL_OVERFLOW','MERCENARY_LEVEL_MAX','MERCENARY_LEVEL_NOT_READY','MERCENARY_LEVEL_BREAKTHROUGH_REQUIRED']);
 async function execute(action,body,{submit=true}={}){
  guard();let p=pending();
  if(p){const r=await lookup(p);if(r?.status==='COMPLETED'||!submit)return r;}
  else{
   if(!submit)return null;if(!['train','breakthrough'].includes(action))throw Error('성장 동작을 확인하세요.');
   p={action,body:{...body,requestId:crypto.randomUUID()}};
   try{storage.setItem(key,JSON.stringify(p));if(pending()?.body.requestId!==p.body.requestId)throw Error();}catch{throw Error('요청을 보관하지 못해 성장을 시작하지 않았습니다. 저장 공간을 확인하세요.');}
  }
  return validateLevelReceipt(await api(p.action,{method:'POST',body:p.body}),p.body.requestId);
 }
 function run(action,body,options){if(flight)return flight;const work=async()=>{try{return await execute(action,body,options);}catch(e){if(terminal.has(e.code)){const p=pending();if(p)acknowledge(p.body.requestId);}throw e;}};flight=Promise.resolve().then(()=>locks?locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('다른 창에서 성장 결과를 확인하고 있습니다.');return work();}):work()).finally(()=>flight=null);return flight;}
 return {pending,acknowledge,run,async state(){const r=await api('state');if(r?.userId!==accountId||!Array.isArray(r.cards))throw Error('성장 계정을 확인하지 못했습니다.');return r;}};
}
