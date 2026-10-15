import {ICON_TECHNIQUES,ICON_TECHNIQUES_KEY,ICON_TECHNIQUES_VERSION,defaultIconTechniques,validateIconTechniques,applyPreparedIconTechniqueDefaults} from '../shared/icon-techniques-v1.mjs';
import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';

export async function readIconTechniqueState(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ICON_TECHNIQUES_KEY).first();
 if(!row)return{raw:null,state:{revision:1,document:defaultIconTechniques(),audit:[],updatedAt:null,updatedBy:null}};
 const state=JSON.parse(row.value);
 if(!Number.isSafeInteger(state.revision)||state.revision<1||state.revision>=2147483647||!Array.isArray(state.audit)||state.audit.length>50)throw Error('INVALID_ICON_TECHNIQUE_RECORD');
 state.document=applyPreparedIconTechniqueDefaults(validateIconTechniques(state.document));
 return{raw:row.value,state};
}
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
async function readBody(request){
 const reader=request.body?.getReader();if(!reader)throw Error('기술 초안이 필요합니다.');
 let size=0,text='';const decoder=new TextDecoder();
 try{
  for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw Error('기술 초안 요청이 너무 큽니다.');}text+=decoder.decode(value,{stream:true});}
  return JSON.parse(text+decoder.decode());
 }finally{reader.releaseLock();}
}
export async function handleIconTechniques({path,request,env,deps}){
 if(path!=='admin/icon-techniques')return null;
 const reply=(data,status=200)=>{const response=deps.json(data,status);response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Authorization');return response;};
 const admin=await deps.requirePermission(request,env,'BATTLE_MANAGE');
 if(admin?.role!=='OWNER')return reply({error:'신규 ICON 기술 준비 설정은 OWNER만 사용할 수 있습니다.'},403);
 if(!['GET','PATCH'].includes(request.method))return reply({error:'지원하지 않는 요청입니다.'},405);
 let body;
 if(request.method==='PATCH')try{
  body=await readBody(request);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='document,expectedRevision,requestId'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId))throw Error('초안 버전과 저장 요청 ID를 확인해 주세요.');
  body.document=validateIconTechniques(body.document);
 }catch(error){return reply({error:error instanceof SyntaxError?'올바른 JSON 요청이 필요합니다.':error.message},400);}
 try{
  let current=await readIconTechniqueState(env);
  const output=state=>({revision:state.revision,document:state.document,catalog:ICON_TECHNIQUES,preparedCards:ICON_EXPANSION_CARDS,version:ICON_TECHNIQUES_VERSION,locks:{releaseEnabled:false,cardAssignmentEnabled:false,tuningApproved:false},updatedAt:state.updatedAt,updatedBy:state.updatedBy,audit:state.audit});
  if(request.method==='GET')return reply(output(current.state));
  const payloadHash=await digest(JSON.stringify([String(admin.id),body.expectedRevision,body.document]));
  const replay=state=>{
   const receipt=state.audit.find(row=>row.requestId===body.requestId);
   return !receipt?null:receipt.payloadHash!==payloadHash||String(receipt.actorId)!==String(admin.id)
    ?reply({error:'같은 요청 ID에 다른 내용 또는 관리자가 포함되었습니다.',code:'REQUEST_ID_CONFLICT'},409)
    :reply({...output(state),savedRevision:receipt.revision,replayed:true});
  };
  const previous=replay(current.state);if(previous)return previous;
  const conflict=()=>reply({error:'다른 창에서 먼저 저장했습니다. 편집본을 내려받은 뒤 다시 불러와 주세요.',code:'REVISION_CONFLICT'},409);
  if(current.state.revision!==body.expectedRevision)return conflict();
  const revision=body.expectedRevision+1,now=new Date().toISOString();
  const next={revision,document:body.document,updatedAt:now,updatedBy:admin.id,audit:[{requestId:body.requestId,payloadHash,actorId:admin.id,revision,createdAt:now},...current.state.audit].slice(0,50)};
  const saved=current.raw===null
   ?await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(ICON_TECHNIQUES_KEY,JSON.stringify(next)).run()
   :await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),ICON_TECHNIQUES_KEY,current.raw).run();
  if(saved.meta?.changes===1)return reply({...output(next),savedRevision:revision,replayed:false});
  current=await readIconTechniqueState(env);return replay(current.state)||conflict();
 }catch(error){
  console.error('[icon-techniques] unavailable',error?.name||'Error');
  return reply({error:'신규 ICON 기술 초안을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',code:'ICON_TECHNIQUES_UNAVAILABLE'},503);
 }
}
