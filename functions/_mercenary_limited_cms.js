import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {LIMITED_POLICY_KEY,LIMITED_RECEIPT_PREFIX,limitedPolicyDraft,validateLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const initial=()=>({revision:1,policy:limitedPolicyDraft(),updatedAt:null});
async function state(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LIMITED_POLICY_KEY).first();const saved=row?JSON.parse(row.value):initial();validateLimitedPolicy(saved.policy);return {...saved,cards:LIMITED_MERCENARIES,userOpeningEnabled:false};}
export async function handleLimitedMercenaryCms({path,request,env,deps}){
 if(path!=='admin/mercenaries/limited')return null;
 const admin=await deps.requirePermission(request,env,'BATTLE_MANAGE');
 if(!admin||admin.role!=='OWNER')return deps.json({error:'리미티드 확률은 OWNER만 관리할 수 있습니다.'},403);
 if(!['GET','PATCH'].includes(request.method))return deps.json({error:'지원하지 않는 요청입니다.'},405);
 if(request.method==='GET')return deps.json(await state(env));
 let body;
 try{
  const reader=request.body?.getReader();if(!reader)throw Error('저장 내용을 확인하세요.');let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>24000){await reader.cancel();throw Error('저장 요청은 24KB 이내여야 합니다.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}body=JSON.parse(new TextDecoder().decode(bytes));
  if(!body||Object.keys(body).sort().join(',')!=='expectedRevision,policy,reason,requestId'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[A-Za-z0-9-]{16,100}$/.test(body.requestId)||typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason))throw Error('현재 버전·요청 ID·저장 사유 4~500자를 확인하세요.');
  body.policy=validateLimitedPolicy(body.policy);body.reason=body.reason.trim();
 }catch(e){return deps.json({error:e instanceof SyntaxError?'올바른 JSON 요청이 필요합니다.':e.message},400);}
 const payloadHash=await hash(JSON.stringify({actor:Number(admin.id),...body,requestId:undefined})),receiptKey=LIMITED_RECEIPT_PREFIX+body.requestId;
 const receipt=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
 if(receipt){const prior=JSON.parse(receipt.value);if(prior.payloadHash!==payloadHash)return deps.json({error:'같은 요청 ID에 다른 내용이 포함되었습니다.',code:'REQUEST_ID_CONFLICT'},409);return deps.json({...await state(env),savedRevision:prior.revision,replayed:true});}
 const beforeRow=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LIMITED_POLICY_KEY).first(),beforeText=beforeRow?.value||JSON.stringify(initial()),before=JSON.parse(beforeText);
 if(before.revision!==body.expectedRevision)return deps.json({error:'다른 창에서 먼저 저장했습니다. 최신 설정을 불러오세요.',code:'REVISION_CONFLICT'},409);
 const next={revision:before.revision+1,policy:body.policy,updatedAt:new Date().toISOString(),updatedBy:Number(admin.id),lastRequestId:body.requestId},afterText=JSON.stringify(next),receiptText=JSON.stringify({payloadHash,revision:next.revision});
 await env.DB.batch([
  env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(LIMITED_POLICY_KEY,beforeText),
  env.DB.prepare('UPDATE app_meta SET value=? WHERE key=? AND value=?').bind(afterText,LIMITED_POLICY_KEY,beforeText),
  env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,?,?,?,?,? FROM app_meta WHERE key=? AND value=? AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)').bind(admin.id,'MERCENARY_LIMITED_POLICY_SAVE','SETTING',LIMITED_POLICY_KEY,beforeText,JSON.stringify({...next,reason:body.reason}),LIMITED_POLICY_KEY,afterText,receiptKey),
  env.DB.prepare('INSERT INTO app_meta(key,value) SELECT ?,? FROM app_meta WHERE key=? AND value=? ON CONFLICT(key) DO NOTHING').bind(receiptKey,receiptText,LIMITED_POLICY_KEY,afterText)
 ]);
 const saved=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
 if(!saved||JSON.parse(saved.value).payloadHash!==payloadHash)return deps.json({error:'다른 창에서 먼저 저장했습니다. 최신 설정을 불러오세요.',code:'REVISION_CONFLICT'},409);
 return deps.json({...await state(env),savedRevision:next.revision,replayed:false});
}
