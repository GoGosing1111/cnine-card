import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {withMercenaryDeadline} from '../../shared/mercenary-loading-v1.mjs?v=20260925';
import {MATERIAL_COUNT,RANKS,nextRank} from './model.mjs?v=20260925-on';

export const fusionToken=()=>{try{return localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{return '';}};
const fail=(code,message)=>Object.assign(Error(message),{code});
const terminal=new Set(['JOINT_OPERATION_SUPERSEDED','MERCENARY_FUSION_INVENTORY_CHANGED','MERCENARY_FUSION_MATERIALS','MERCENARY_FUSION_RANK','MERCENARY_FUSION_DUPLICATES','MERCENARY_FUSION_MAX_RANK','MERCENARY_FUSION_CONFIG','MERCENARY_FUSION_POOL_EMPTY']);
export const fusionPendingKey=id=>'cnine.mercenary.fusion.pending:'+id;
const validMaterials=items=>Array.isArray(items)&&items.length===MATERIAL_COUNT&&items.every(code=>/^V-\d{3}$/.test(code));
export function readFusionPending(storage,key){
  const raw=storage.getItem(key);if(!raw)return null;
  try{const p=JSON.parse(raw);if(/^[A-Za-z0-9_-]{16,100}$/.test(p?.requestId)&&validMaterials(p.materials))return {requestId:p.requestId,materials:p.materials};}catch{}
  throw fail('FUSION_PENDING_INVALID','미확인 합성 요청 정보가 손상됐습니다. 운영자에게 확인을 요청해 주세요.');
}
export function validateFusionReceipt(value,requestId){
  const invalid=()=>fail('FUSION_RESPONSE_INVALID','합성 결과를 확인하지 못했습니다. 이전 결과 확인을 눌러 주세요.');
  if(value?.requestId!==requestId||!['PENDING','COMPLETED'].includes(value?.status))throw invalid();
  if(value.status==='PENDING')return value;
  const r=value.result,consumed=value.consumed;
  if(!r||!/^V-\d{3}$/.test(r.mercenaryCode)||!RANKS.includes(r.inputRank)||!nextRank(r.inputRank)||typeof r.promoted!=='boolean'||
    r.resultRank!==(r.promoted?nextRank(r.inputRank):r.inputRank)||r.quantity!==1||typeof r.name!=='string'||
    !Number.isSafeInteger(r.totalCopiesAfter)||r.totalCopiesAfter<1||r.duplicatesAfter!==r.totalCopiesAfter-1||
    !Array.isArray(consumed)||new Set(consumed.map(c=>c?.code)).size!==consumed.length||
    consumed.some(c=>!c||!/^V-\d{3}$/.test(c.code)||!Number.isSafeInteger(c.quantity)||c.quantity<1||
      !Number.isSafeInteger(c.totalBefore)||c.duplicatesBefore!==c.totalBefore-1||c.duplicatesBefore<c.quantity)||
    consumed.reduce((sum,c)=>sum+c.quantity,0)!==MATERIAL_COUNT)throw invalid();
  return value;
}

// A persisted request ID survives close, reload and uncertain transport outcomes.
// Every retry uses the same server-owned plan; viewing/replaying has no POST.
export function createFusionClient({accountId,token=fusionToken(),storage=localStorage,currentToken=fusionToken,request=jointAccountRequest,locks=globalThis.navigator?.locks,signal}={}){
  if(!Number.isSafeInteger(accountId)||accountId<1)throw fail('FUSION_AUTH','로그인 후 합성할 수 있습니다.');
  const key=fusionPendingKey(accountId);let flight=null;
  const guard=()=>{if(signal?.aborted)throw Object.assign(Error('합성 화면을 닫았습니다.'),{name:'AbortError'});if(currentToken()!==token)throw fail('FUSION_SESSION_CHANGED','로그인 계정이 변경됐습니다. 화면을 다시 열어 주세요.');};
  const pending=()=>readFusionPending(storage,key);
  const acknowledge=requestId=>{if(pending()?.requestId===requestId)storage.removeItem(key);};
  async function api(path,options={}){
    guard();
    try{const value=await withMercenaryDeadline(request(path,{...options,signal,timeoutMs:15000}),{signal,timeoutMs:16000});guard();return value;}
    catch(error){
      guard();
      if(error.name==='AbortError'||error.code==='MERCENARY_LOAD_TIMEOUT')throw fail('FUSION_TIMEOUT','서버 응답이 지연됩니다. 잠시 후 다시 확인해 주세요.');
      if(error instanceof TypeError&&!error.code)throw fail('FUSION_CONNECTION','연결이 끊겼습니다. 연결 상태를 확인하고 같은 요청을 다시 확인해 주세요.');
      throw error;
    }
  }
  async function lookup(p){
    try{return validateFusionReceipt(await api('mercenaries/v3/fusion/receipt?requestId='+encodeURIComponent(p.requestId)),p.requestId);}
    catch(error){if(error.code==='JOINT_NOT_FOUND')return null;throw error;}
  }
  async function execute(materials,{submit=true}={}){
    guard();let p=pending();
    if(p){const receipt=await lookup(p);if(receipt?.status==='COMPLETED'||!submit)return receipt;}
    else{
      if(!submit)return null;
      if(!validMaterials(materials))throw fail('FUSION_SELECTION','같은 등급의 중복 카드 8장을 선택하세요.');
      p={requestId:crypto.randomUUID(),materials:[...materials]};
      try{storage.setItem(key,JSON.stringify(p));if(pending()?.requestId!==p.requestId)throw Error();}
      catch{throw fail('FUSION_STORAGE','요청 기록을 보관하지 못해 합성을 시작하지 않았습니다. 브라우저 저장 공간을 확인하세요.');}
    }
    try{return validateFusionReceipt(await api('mercenaries/v3/fusion',{method:'POST',body:p}),p.requestId);}
    catch(error){if(terminal.has(error.code))acknowledge(p.requestId);throw error;}
  }
  function run(materials,options){
    if(flight)return flight;
    const task=async()=>{try{return await execute(materials,options);}catch(error){if(terminal.has(error.code)){const p=pending();if(p)acknowledge(p.requestId);}throw error;}};
    flight=Promise.resolve().then(()=>locks?locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw fail('FUSION_BUSY','다른 창에서 합성 결과를 확인하고 있습니다. 잠시 후 다시 확인하세요.');return task();}):task()).finally(()=>{flight=null;});
    return flight;
  }
  return {key,pending,acknowledge,run,async state(){const value=await api('mercenaries/v3/state');if(value?.accountId!==accountId||!Array.isArray(value.cards))throw fail('FUSION_STATE','보유 용병을 확인하지 못했습니다. 다시 불러와 주세요.');return value;}};
}
