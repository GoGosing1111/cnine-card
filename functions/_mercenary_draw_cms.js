import {DRAW_MAX_BYTES,suggestedMercenaryDraw,validateMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_ACCOUNTING_SCHEMA} from './_mercenary_draw_accounting.js';

// Explicit user hold. Accounting schema and policy are ready; opening remains blocked.
export const MERCENARY_CARD_OPENING_RELEASE_ENABLED=false;
const registration='mercenary-draw-proposal-20260912-v1';
const tables=[...MERCENARY_ACCOUNTING_SCHEMA,
  `CREATE TABLE IF NOT EXISTS mercenary_draw_config_v1(id INTEGER PRIMARY KEY CHECK(id=1),payload_json TEXT NOT NULL,revision INTEGER NOT NULL,last_request_id TEXT NOT NULL,updated_by BIGINT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS mercenary_draw_audit_v1(request_id TEXT PRIMARY KEY,actor_id BIGINT NOT NULL,payload_hash TEXT NOT NULL,revision INTEGER NOT NULL,reason TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at TEXT NOT NULL)`
];
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export async function ensureMercenaryDrawCms(env,adminId){
  if(env.DB.dialect==='postgres'&&env.DB.execSchema)await env.DB.execSchema(tables);
  else for(const sql of tables)await env.DB.prepare(sql).run();
  const payload=JSON.stringify(validateMercenaryDraw(suggestedMercenaryDraw())),now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO mercenary_draw_config_v1(id,payload_json,revision,last_request_id,updated_by,updated_at) VALUES(1,?,1,?,?,?) ON CONFLICT(id) DO NOTHING').bind(payload,registration,adminId,now),
    env.DB.prepare(`INSERT INTO mercenary_draw_audit_v1(request_id,actor_id,payload_hash,revision,reason,before_json,after_json,created_at)
      SELECT ?,?,?,1,?,NULL,payload_json,? FROM mercenary_draw_config_v1 WHERE id=1 AND last_request_id=? ON CONFLICT(request_id) DO NOTHING`)
      .bind(registration,adminId,await hash(payload),'사용자 요청: 확률·수량 초안 제안, 유저 개봉 OFF',now,registration)
  ]);
}
async function readState(env){
  const row=await env.DB.prepare('SELECT * FROM mercenary_draw_config_v1 WHERE id=1').first();
  const audit=(await env.DB.prepare('SELECT request_id,actor_id,revision,reason,created_at FROM mercenary_draw_audit_v1 ORDER BY revision DESC,created_at DESC LIMIT 10').all()).results;
  return {policy:validateMercenaryDraw(JSON.parse(row.payload_json)),revision:Number(row.revision),updatedBy:Number(row.updated_by),updatedAt:row.updated_at,audit,userOpeningEnabled:MERCENARY_CARD_OPENING_RELEASE_ENABLED};
}
async function boundedJson(request){
  if(Number(request.headers.get('content-length'))>DRAW_MAX_BYTES)throw Error('확률 설정 요청은 24KB 이내여야 합니다.');
  const reader=request.body?.getReader();if(!reader)throw Error('저장 내용을 확인하세요.');
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>DRAW_MAX_BYTES){await reader.cancel();throw Error('확률 설정 요청은 24KB 이내여야 합니다.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleMercenaryDrawCms({path,request,env,deps}){
  const {json,requirePermission}=deps;
  if(['mercenary-cards/open','mercenary-cards/open-batch','mercenary-cards/feature'].includes(path))
    return json({userOpeningEnabled:false,code:'MERCENARY_OPENING_DISABLED',error:'용병카드 개봉은 아직 준비 중입니다.'},path.endsWith('/feature')?200:409);
  if(path!=='admin/mercenaries/draw')return null;
  const admin=await requirePermission(request,env,'BATTLE_MANAGE');
  if(!admin||admin.role!=='OWNER')return json({error:'용병 확률 설정은 OWNER만 관리할 수 있습니다.'},403);
  if(!['GET','PATCH'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
  let body;
  if(request.method==='PATCH'){
    try{
      body=await boundedJson(request);
      if(!body||Object.keys(body).sort().join(',')!=='expectedRevision,policy,reason,requestId'||
        !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||
        typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId)||
        typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason))throw Error('저장 사유 4~500자, 요청 ID와 현재 버전을 확인하세요.');
      body.policy=validateMercenaryDraw(body.policy);body.reason=body.reason.trim();
    }catch(error){return json({error:error instanceof SyntaxError?'올바른 JSON 요청이 필요합니다.':error.message},400);}
  }
  await ensureMercenaryDrawCms(env,admin.id);
  if(request.method==='GET')return json(await readState(env));
  const payload=JSON.stringify(body.policy),payloadHash=await hash(`${admin.id}:${body.expectedRevision}:${body.reason}:${payload}`);
  const prior=await env.DB.prepare('SELECT * FROM mercenary_draw_audit_v1 WHERE request_id=?').bind(body.requestId).first();
  if(prior){
    if(Number(prior.actor_id)!==Number(admin.id)||prior.payload_hash!==payloadHash)return json({error:'같은 요청 ID에 다른 내용이 포함되었습니다.',code:'REQUEST_ID_CONFLICT'},409);
    return json({...await readState(env),savedRevision:Number(prior.revision),replayed:true});
  }
  const before=await env.DB.prepare('SELECT * FROM mercenary_draw_config_v1 WHERE id=1').first();
  if(Number(before.revision)!==body.expectedRevision)return json({error:'다른 창에서 먼저 저장했습니다. 편집 내용을 내보낸 뒤 최신 설정을 불러오세요.',code:'REVISION_CONFLICT'},409);
  const next=body.expectedRevision+1,now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE mercenary_draw_config_v1 SET payload_json=?,revision=?,last_request_id=?,updated_by=?,updated_at=? WHERE id=1 AND revision=? AND NOT EXISTS(SELECT 1 FROM mercenary_draw_audit_v1 WHERE request_id=?)`)
      .bind(payload,next,body.requestId,admin.id,now,body.expectedRevision,body.requestId),
    env.DB.prepare(`INSERT INTO mercenary_draw_audit_v1(request_id,actor_id,payload_hash,revision,reason,before_json,after_json,created_at)
      SELECT ?,?,?,?,?,?,?,? FROM mercenary_draw_config_v1 WHERE id=1 AND revision=? AND last_request_id=? ON CONFLICT(request_id) DO NOTHING`)
      .bind(body.requestId,admin.id,payloadHash,next,body.reason,before.payload_json,payload,now,next,body.requestId)
  ]);
  const receipt=await env.DB.prepare('SELECT * FROM mercenary_draw_audit_v1 WHERE request_id=?').bind(body.requestId).first();
  if(!receipt||receipt.payload_hash!==payloadHash||Number(receipt.actor_id)!==Number(admin.id))return json({error:'다른 창에서 먼저 저장했습니다. 편집 내용을 내보낸 뒤 최신 설정을 불러오세요.',code:'REVISION_CONFLICT'},409);
  return json({...await readState(env),savedRevision:Number(receipt.revision),replayed:false});
}
