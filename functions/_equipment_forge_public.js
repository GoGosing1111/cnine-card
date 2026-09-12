import {readForgePreparationInventory} from './_equipment_forge_preparation.js';

export const FORGE_SETTINGS_KEY='equipment_forge_public_settings_v1';
export const FORGE_EXECUTION_IMPLEMENTED=false;
const defaults=()=>({schemaVersion:1,revision:0,publicVisible:true,executionMode:'OFF',notice:'무기와 방어구의 강화 센터가 공개되었습니다. 강화 오픈 일정은 추후 안내됩니다.'});
const pending=['운영 확률·최대 단계·비용·전투력 확정','보호권·복구 정책 확정','강화·파괴·복구 원자 처리 및 전투력 연결 검수','V3·용병·장비 공동 활성화'];
export async function readForgeSettings(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FORGE_SETTINGS_KEY).first();
  if(!row)return {settings:defaults(),raw:null};
  try{
    const s=JSON.parse(row.value);
    if(s.schemaVersion!==1||!Number.isSafeInteger(s.revision)||s.revision<1||typeof s.publicVisible!=='boolean'||!['OFF','ON'].includes(s.executionMode)||typeof s.notice!=='string'||s.notice.length>500)throw Error('invalid');
    return {settings:s,raw:row.value};
  }catch{return {settings:{...defaults(),publicVisible:false},raw:row.value,invalid:true};}
}
function publicState(settings){
  return {schemaVersion:1,publicVisible:settings.publicVisible,executionMode:settings.executionMode,
    canEnhance:false,canRestore:false,status:settings.publicVisible?'OPENING_SOON':'UNAVAILABLE',notice:settings.notice,
    supportedSlots:['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'],
    rules:{minimumSuccessPercent:10,outcomes:['success','maintain','destroy'],protectionAcquisition:'GAMEPLAY_ONLY',protectionRarity:'EXTREMELY_RARE',boxAcquisition:false},
    policy:{rates:null,costs:null,maxLevel:null,powerScaling:null,restoration:null}};
}
export async function saveForgeSettings(env,admin,body){
  if(!body||Object.keys(body).sort().join(',')!=='expectedRevision,settings'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>1000000000)return {error:'설정 버전을 확인하세요.',status:400};
  const s=body.settings;
  if(!s||Object.keys(s).sort().join(',')!=='executionMode,notice,publicVisible'||typeof s.publicVisible!=='boolean'||!['OFF','ON'].includes(s.executionMode)||typeof s.notice!=='string'||s.notice.length>500)return {error:'공개·실행 설정과 500자 이내 안내를 확인하세요.',status:400};
  // This public-only release must not mistake a saved ON flag for a working mutation engine.
  if(s.executionMode==='ON')return {error:'운영 정책 확정과 강화·복구 서버 연결 검수, 공동 출시 준비가 끝난 뒤 ON으로 전환할 수 있습니다.',code:'FORGE_NOT_READY',status:409};
  const previous=await readForgeSettings(env);
  if(previous.invalid)return {error:'운영 설정이 손상되어 복구가 필요합니다.',status:409};
  if(previous.settings.revision!==body.expectedRevision)return {error:'다른 창에서 설정이 변경되었습니다. 다시 불러오세요.',status:409};
  const now=new Date().toISOString(), settings={schemaVersion:1,revision:body.expectedRevision+1,...s,updatedAt:now,updatedBy:Number(admin.id),requestId:crypto.randomUUID()},raw=JSON.stringify(settings);
  const change=previous.raw===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO NOTHING').bind(FORGE_SETTINGS_KEY,raw,now):
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=? WHERE key=? AND value=?').bind(raw,now,FORGE_SETTINGS_KEY,previous.raw);
  await env.DB.batch([change,env.DB.prepare(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    SELECT ?,'EQUIPMENT_FORGE_PUBLIC_SETTINGS','EQUIPMENT_FORGE',?,?,? WHERE EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)`)
    .bind(admin.id,FORGE_SETTINGS_KEY,JSON.stringify(previous.settings),raw,FORGE_SETTINGS_KEY,raw)]);
  const current=await readForgeSettings(env);
  if(current.raw!==raw)return {error:'다른 창의 설정이 먼저 저장됐습니다. 다시 불러오세요.',status:409};
  return {settings,executionReady:FORGE_EXECUTION_IMPLEMENTED,pending};
}
export async function handleEquipmentForgePublic({path,request,env,deps}){
  const prefix='character/equipment/forge/';
  if(path!=='admin/equipment-forge'&&!path.startsWith(prefix))return null;
  const {authenticate,requirePermission,json}=deps;
  if(path==='admin/equipment-forge'){
    const admin=await requirePermission(request,env,'SETTINGS');if(!admin||admin.role!=='OWNER')return json({error:'OWNER만 장비 강화 설정을 변경할 수 있습니다.'},403);
    if(request.method==='GET')return json({...await readForgeSettings(env),executionReady:FORGE_EXECUTION_IMPLEMENTED,pending});
    if(request.method!=='PATCH')return json({error:'지원하지 않는 요청입니다.'},405);
    if(Number(request.headers.get('content-length'))>4096)return json({error:'요청이 너무 큽니다.'},413);
    let body;try{const reader=request.body?.getReader();if(!reader)throw Error('body');const chunks=[];let size=0;try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4096){await reader.cancel();throw Error('size');}chunks.push(r.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'올바른 설정 요청이 필요합니다.'},400);}
    const result=await saveForgeSettings(env,admin,body);return json(result,result.status||200);
  }
  const action=path.slice(prefix.length);
  if(!['status','state','quote','enhance','restore','receipt'].includes(action))return json({error:'강화 경로를 찾을 수 없습니다.'},404);
  if(action==='status'){
    if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405);
    return json(publicState((await readForgeSettings(env)).settings));
  }
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  const settings=(await readForgeSettings(env)).settings,release=publicState(settings);
  if(!settings.publicVisible)return json({error:'강화 센터를 준비하고 있습니다.',code:'FORGE_NOT_PUBLIC'},403);
  if(action!=='state'){
    if(settings.executionMode!=='ON')return json({error:'아직 강화가 오픈되지 않았습니다.',code:'FORGE_OFF',executionMode:'OFF'},423);
    // A corrupt/manual DB ON must fail closed too. No inventory/currency writes occur here.
    return json({error:'강화 서비스를 준비하고 있습니다.',code:'FORGE_NOT_READY'},503);
  }
  if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405);
  const url=new URL(request.url);let inventory;
  try{inventory=await readForgePreparationInventory(env.DB,user.id,{beforeId:url.searchParams.get('beforeId'),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):40,group:url.searchParams.get('group')||'all'});}catch(error){if(/ID|페이지당|종류/.test(error.message))return json({error:error.message},400);throw error;}
  const wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
  return json({...release,...inventory,canEnhance:false,canRestore:false,wallet:{coins:String(wallet?.coin??0),protection:null,restoration:null},records:[],history:[]});
}
