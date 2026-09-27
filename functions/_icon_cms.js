import {ICON_CMS_CATALOG} from '../shared/icon-cms-catalog-v1.mjs';
import {ICON_CMS_KEY,ICON_CMS_MAX_BYTES,ICON_CMS_LOCKS,emptyIconCmsDocument,validateIconCmsDocument,validateIconCmsSave} from '../shared/icon-cms-model-v1.mjs';

const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
async function boundedJson(request){
  if(Number(request.headers.get('content-length'))>ICON_CMS_MAX_BYTES)throw Error('설정 요청이 너무 큽니다.');
  const reader=request.body?.getReader();if(!reader)throw Error('저장할 설정이 필요합니다.');
  const decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>ICON_CMS_MAX_BYTES){await reader.cancel();throw Error('설정 요청이 너무 큽니다.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}
  finally{reader.releaseLock();}
}
function decode(row){
  const stored=JSON.parse(row.value);
  if(!Number.isSafeInteger(stored.revision)||stored.revision<1||!Array.isArray(stored.audit)||stored.audit.length>50)throw Error('Invalid ICON CMS record');
  // Revalidate stored locks too. Corrupt/old ON flags never become an enable switch.
  stored.document=validateIconCmsDocument(stored.document);
  return {raw:row.value,state:stored};
}
async function read(env,admin){
  const query=()=>env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ICON_CMS_KEY).first();
  let row=await query();
  if(!row){
    const seed={revision:1,document:emptyIconCmsDocument(),updatedAt:new Date().toISOString(),updatedBy:admin.id,audit:[]};
    await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(ICON_CMS_KEY,JSON.stringify(seed)).run();
    row=await query();
  }
  return decode(row);
}
export async function handleIconCms({path,request,env,deps}){
  if(path!=='admin/icons')return null;
  const reply=(body,status=200)=>{const response=deps.json(body,status);response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Authorization');return response;};
  const admin=await deps.requirePermission(request,env,'BATTLE_MANAGE');
  if(!admin||admin.role!=='OWNER')return reply({error:'아이콘 CMS는 OWNER만 관리할 수 있습니다.'},403);
  if(!['GET','PATCH'].includes(request.method))return reply({error:'지원하지 않는 요청입니다.'},405);
  let body;
  if(request.method==='PATCH')try{body=validateIconCmsSave(await boundedJson(request));}catch(error){return reply({error:error instanceof SyntaxError?'올바른 JSON 요청이 필요합니다.':error.message},400);}
  const output=state=>({...state,catalog:ICON_CMS_CATALOG,locks:ICON_CMS_LOCKS});
  try{
    const current=await read(env,admin);
    if(request.method==='GET')return reply(output(current.state));
    const payloadHash=await hash(JSON.stringify([String(admin.id),body.expectedRevision,body.document]));
    const replay=state=>{
      const receipt=state.audit.find(a=>a.requestId===body.requestId);
      if(!receipt)return null;
      return String(receipt.actorId)!==String(admin.id)||receipt.payloadHash!==payloadHash
        ?reply({error:'같은 요청 ID에 다른 내용이 포함되었습니다.',code:'REQUEST_ID_CONFLICT'},409)
        :reply({...output(state),savedRevision:receipt.revision,replayed:true});
    };
    const prior=replay(current.state);if(prior)return prior;
    const conflict=()=>reply({error:'다른 창에서 먼저 저장했습니다. 편집본을 내려받고 최신 내용을 다시 불러와 주세요.',code:'REVISION_CONFLICT'},409);
    if(current.state.revision!==body.expectedRevision)return conflict();
    const revision=body.expectedRevision+1,now=new Date().toISOString();
    const next={revision,document:body.document,updatedAt:now,updatedBy:admin.id,
      audit:[{requestId:body.requestId,payloadHash,actorId:admin.id,revision,createdAt:now},...current.state.audit].slice(0,50)};
    // One bounded row, one atomic compare-and-swap; config and receipt commit together.
    const saved=await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),ICON_CMS_KEY,current.raw).run();
    if(saved.meta?.changes===1)return reply({...output(next),savedRevision:revision,replayed:false});
    // Only a concurrent writer needs a second read. No retry loop or global scan.
    const latest=await read(env,admin);return replay(latest.state)||conflict();
  }catch(error){console.error('[icon-cms] unavailable',error?.name||'Error');return reply({error:'아이콘 CMS 저장소를 확인하지 못했습니다. 다시 불러오거나 같은 요청으로 재시도해 주세요.',code:'ICON_CMS_UNAVAILABLE'},503);}
}
