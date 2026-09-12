import {MERCENARY_CMS_SEED as seed} from './_mercenary_cms_seed.js';
import {CMS_MAX_BYTES,validateMercenaryCms} from '../shared/mercenary-cms-model-v1.mjs';

const tables=[
  `CREATE TABLE IF NOT EXISTS mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT NOT NULL,revision INTEGER NOT NULL,last_request_id TEXT NOT NULL,updated_by BIGINT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS mercenary_cms_audit_v1(request_id TEXT PRIMARY KEY,actor_id BIGINT NOT NULL,payload_hash TEXT NOT NULL,revision INTEGER NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL)`
];
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export async function ensureMercenaryCms(env,adminId){
  if(env.DB.dialect==='postgres'&&env.DB.execSchema)await env.DB.execSchema(tables);
  else for(const sql of tables)await env.DB.prepare(sql).run();
  const now=new Date().toISOString(), registration=`seed-${seed.sourceHash}`;
  await env.DB.batch([
    ...[['catalog',seed.catalog],['config',seed.document]].map(([key,payload])=>env.DB.prepare(
      'INSERT INTO mercenary_cms_documents_v1(doc_key,payload_json,revision,last_request_id,updated_by,created_at,updated_at) VALUES(?,?,1,?,?,?,?) ON CONFLICT(doc_key) DO NOTHING'
    ).bind(key,JSON.stringify(payload),registration,adminId,now,now)),
    env.DB.prepare(`INSERT INTO mercenary_cms_audit_v1(request_id,actor_id,payload_hash,revision,action,created_at)
      SELECT ?,?,?,1,'REGISTER',? FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND last_request_id=? ON CONFLICT(request_id) DO NOTHING`)
      .bind(registration,adminId,seed.sourceHash,now,registration)
  ]);
}
async function readState(env){
  const rows=(await env.DB.prepare('SELECT * FROM mercenary_cms_documents_v1 ORDER BY doc_key').all()).results;
  const row=rows.find(r=>r.doc_key==='config'), catalog=JSON.parse(rows.find(r=>r.doc_key==='catalog').payload_json);
  const audit=(await env.DB.prepare('SELECT request_id,actor_id,revision,action,created_at FROM mercenary_cms_audit_v1 ORDER BY revision DESC,created_at DESC LIMIT 20').all()).results;
  return {catalog,document:JSON.parse(row.payload_json),revision:Number(row.revision),updatedAt:row.updated_at,updatedBy:Number(row.updated_by),audit};
}
async function boundedJson(request){
  if(Number(request.headers.get('content-length'))>CMS_MAX_BYTES)throw Error('CMS 요청은 512KB 이내여야 합니다.');
  const reader=request.body?.getReader();if(!reader)throw Error('저장 내용을 확인하세요.');
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>CMS_MAX_BYTES){await reader.cancel();throw Error('CMS 요청은 512KB 이내여야 합니다.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleMercenaryCms({path,request,env,deps}){
  if(path!=='admin/mercenaries')return null;
  const {requirePermission,json}=deps;
  const admin=await requirePermission(request,env,'BATTLE_MANAGE');
  if(!admin||admin.role!=='OWNER')return json({error:'용병 CMS는 OWNER만 관리할 수 있습니다.'},403);
  if(!['GET','PATCH'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
  let body;
  if(request.method==='PATCH'){
    try{
      body=await boundedJson(request);
      if(!body||Object.keys(body).sort().join(',')!=='document,expectedRevision,requestId'||
        !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||
        typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId))throw Error('저장 요청 ID와 현재 버전을 확인하세요.');
      body.document=validateMercenaryCms(body.document,seed.catalog);
    }catch(error){return json({error:error instanceof SyntaxError?'올바른 JSON 요청이 필요합니다.':error.message},400);}
  }
  await ensureMercenaryCms(env,admin.id);
  if(request.method==='GET')return json(await readState(env));
  const payload=JSON.stringify(body.document), payloadHash=await hash(`${admin.id}:${body.expectedRevision}:${payload}`);
  const prior=await env.DB.prepare('SELECT * FROM mercenary_cms_audit_v1 WHERE request_id=?').bind(body.requestId).first();
  if(prior){
    if(Number(prior.actor_id)!==Number(admin.id)||prior.payload_hash!==payloadHash)return json({error:'같은 요청 ID에 다른 내용이 포함되었습니다.',code:'REQUEST_ID_CONFLICT'},409);
    return json({...await readState(env),savedRevision:Number(prior.revision),replayed:true});
  }
  const next=body.expectedRevision+1, now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE mercenary_cms_documents_v1 SET payload_json=?,revision=?,last_request_id=?,updated_by=?,updated_at=?
      WHERE doc_key='config' AND revision=? AND NOT EXISTS(SELECT 1 FROM mercenary_cms_audit_v1 WHERE request_id=?)`)
      .bind(payload,next,body.requestId,admin.id,now,body.expectedRevision,body.requestId),
    env.DB.prepare(`INSERT INTO mercenary_cms_audit_v1(request_id,actor_id,payload_hash,revision,action,created_at)
      SELECT ?,?,?,?,'SAVE',? FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=? AND last_request_id=? ON CONFLICT(request_id) DO NOTHING`)
      .bind(body.requestId,admin.id,payloadHash,next,now,next,body.requestId)
  ]);
  const receipt=await env.DB.prepare('SELECT * FROM mercenary_cms_audit_v1 WHERE request_id=?').bind(body.requestId).first();
  if(!receipt||receipt.payload_hash!==payloadHash||Number(receipt.actor_id)!==Number(admin.id))return json({error:'다른 창에서 먼저 저장했습니다. 현재 편집을 내보낸 뒤 최신 내용을 다시 불러오세요.',code:'REVISION_CONFLICT'},409);
  return json({...await readState(env),savedRevision:Number(receipt.revision),replayed:false});
}
