import {ICON_ROLES,ICON_ROLES_KEY,ICON_ROLES_VERSION,defaultIconRoles,validateIconRoles,iconDefinition,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';

export async function readIconRoleState(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ICON_ROLES_KEY).first();
 if(!row)return {raw:null,state:{revision:1,document:defaultIconRoles(),audit:[],updatedAt:null,updatedBy:null}};
 const state=JSON.parse(row.value);
 if(!Number.isSafeInteger(state.revision)||state.revision<1||!Array.isArray(state.audit)||state.audit.length>50)throw Error('INVALID_ICON_ROLE_RECORD');
 state.document=validateIconRoles(state.document);return {raw:row.value,state};
}
export async function iconRoleDeckSettings(env,entries){
 return entries.some(e=>(e.cards||[]).some(c=>iconDefinition(c)&&String(c.rarity??c.grade??'').toUpperCase()==='ICON'))?(await readIconRoleState(env)).state:null;
}
export function applyIconRoleDeckState(state,settings,scope){
 if(!settings)return state;
 return {...state,cards:state.cards.map(card=>{
  if(!iconDefinition(card)||String(card.rarity??card.grade??'').toUpperCase()!=='ICON')return card;
  // A role replaces the old stat/advancement layer; neither multiplies ICON HP.
  return {...card,power:card.baseBattlePower,uniqueAbility:null,uniqueAdvancement:null,uniqueDefensePercent:0,uniqueSpeedPercent:0,power_type:'NONE',powerType:'NONE',iconRole:iconRoleSnapshot(card,settings.document,scope,settings.revision)};
 })};
}
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
async function readBody(request){
 const reader=request.body?.getReader();if(!reader)throw Error('설정이 필요합니다.');let size=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw Error('설정 요청이 너무 큽니다.');}text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{reader.releaseLock();}
}
export async function handleIconRoles({path,request,env,deps}){
 if(!['icons/roles','admin/icon-roles'].includes(path))return null;
 const reply=(data,status=200)=>{const r=deps.json(data,status);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization');return r;};
 const adminPath=path==='admin/icon-roles';let admin=null;
 if(adminPath){admin=await deps.requirePermission(request,env,'BATTLE_MANAGE');if(admin?.role!=='OWNER')return reply({error:'ICON 역할 설정은 OWNER만 변경할 수 있습니다.'},403);}
 if(request.method!=='GET'&&!(adminPath&&request.method==='PATCH'))return reply({error:'지원하지 않는 요청입니다.'},405);
 let body;
 if(request.method==='PATCH')try{
  body=await readBody(request);
  if(Object.keys(body||{}).sort().join(',')!=='document,expectedRevision,requestId'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId))throw Error('설정 버전과 저장 요청 ID를 확인해 주세요.');
  body.document=validateIconRoles(body.document);
 }catch(e){return reply({error:e instanceof SyntaxError?'올바른 JSON 요청이 필요합니다.':e.message},400);}
 try{
  let current=await readIconRoleState(env);
  const output=state=>({revision:state.revision,document:state.document,catalog:ICON_ROLES,version:ICON_ROLES_VERSION,...(adminPath?{updatedAt:state.updatedAt,updatedBy:state.updatedBy,audit:state.audit}:{})});
  if(request.method==='GET')return reply(output(current.state));
  const payloadHash=await digest(JSON.stringify([String(admin.id),body.expectedRevision,body.document]));
  const replay=state=>{const a=state.audit.find(a=>a.requestId===body.requestId);return !a?null:a.payloadHash!==payloadHash||String(a.actorId)!==String(admin.id)?reply({error:'같은 요청 ID에 다른 내용이 포함되었습니다.',code:'REQUEST_ID_CONFLICT'},409):reply({...output(state),savedRevision:a.revision,replayed:true});};
  const prior=replay(current.state);if(prior)return prior;
  const conflict=()=>reply({error:'다른 창에서 먼저 저장했습니다. 편집본을 보존한 후 다시 불러와 주세요.',code:'REVISION_CONFLICT'},409);
  if(current.state.revision!==body.expectedRevision)return conflict();
  const revision=body.expectedRevision+1,now=new Date().toISOString();
  const next={revision,document:body.document,updatedAt:now,updatedBy:admin.id,audit:[{requestId:body.requestId,payloadHash,actorId:admin.id,revision,createdAt:now},...current.state.audit].slice(0,50)};
  const result=current.raw===null
   ?await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(ICON_ROLES_KEY,JSON.stringify(next)).run()
   :await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),ICON_ROLES_KEY,current.raw).run();
  if(result.meta?.changes===1)return reply({...output(next),savedRevision:revision,replayed:false});
  current=await readIconRoleState(env);return replay(current.state)||conflict();
 }catch(e){console.error('[icon-roles] unavailable',e?.name||'Error');return reply({error:'ICON 역할 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',code:'ICON_ROLES_UNAVAILABLE'},503);}
}
