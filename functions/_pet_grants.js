import {readPetCms} from './_pet_companion_cms.js';
import {petCatalogFrom} from './_pet_equipment.js';
import {readPetCollection} from './_pet_account.js';
import {PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {readJointBody,jointError} from './_joint_request.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';

const fail=(code,message,status=400)=>{throw jointError('PET_GRANT_'+code,message,status);};
const receiptKey=id=>'pet_grant_receipt_v1:'+id;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const catalog=cms=>petCatalogFrom(cms.state.document).filter(p=>p.configured).map(({code,name,sourceArt})=>({code,name,sourceArt}));
function selection(body){
 if(typeof body.petCode!=='string'||!/^PET-[A-Z0-9-]{1,28}$/.test(body.petCode)||!Number.isSafeInteger(body.quantity)||body.quantity<1||body.quantity>9999||typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>200)fail('INPUT','등록된 펫, 수량 1~9,999마리, 지급 사유를 확인하세요.');
 return {petCode:body.petCode,quantity:body.quantity,reason:body.reason.trim()};
}
async function targetById(env,id){
 if(!Number.isSafeInteger(id)||id<1)fail('TARGET','계정 ID를 확인하세요.');
 const row=await env.DB.prepare('SELECT id,nickname FROM users WHERE id=?').bind(id).first();if(!row)fail('TARGET','지급할 계정을 찾지 못했습니다.',404);
 return {id:Number(row.id),nickname:row.nickname};
}
async function receipt(env,key,payloadHash){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();if(!row)return null;
 const saved=JSON.parse(row.value);if(saved.payloadHash!==payloadHash)fail('REQUEST_CONFLICT','같은 요청 번호에 다른 지급 내용이 포함되었습니다.',409);
 return {...saved.result,replayed:true};
}
export async function grantPet(env,admin,body){
 const selected=selection(body);
 if(!Number.isSafeInteger(body.userId)||body.userId<1||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!Number.isSafeInteger(body.petCmsRevision)||body.petCmsRevision<0||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))fail('INPUT','대상 확인을 다시 진행해 주세요.');
 const key=receiptKey(body.requestId),payloadHash=await hash([Number(admin.id),body.userId,selected,body.expectedRevision,body.petCmsRevision]);
 const prior=await receipt(env,key,payloadHash);if(prior)return prior;
 const [target,owned,cms]=await Promise.all([targetById(env,body.userId),readPetCollection(env,body.userId),readPetCms(env)]);
 const pet=catalog(cms).find(p=>p.code===selected.petCode);if(!pet)fail('PET','등록된 펫을 선택해 주세요.');
 if(owned.state.revision!==body.expectedRevision||cms.state.revision!==body.petCmsRevision)fail('REVISION','보유량 또는 펫 설정이 변경됐습니다. 대상을 다시 확인하세요.',409);
 const before=owned.state.pets[pet.code]||0,after=before+selected.quantity,revision=owned.state.revision+1;
 if(!Number.isSafeInteger(after)||!Number.isSafeInteger(revision))fail('LIMIT','펫 보유 한도를 초과했습니다.',409);
 const result={ok:true,requestId:body.requestId,adminId:Number(admin.id),target,pet,quantity:selected.quantity,reason:selected.reason,before,after,collectionRevision:revision,grantedAt:new Date().toISOString(),replayed:false};
 const raw=JSON.stringify({...owned.state,revision,pets:{...owned.state.pets,[pet.code]:after}}),token=crypto.randomUUID(),DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args);
 await ensureJointAtomicSchema(env);
 const unchanged=owned.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
 try{await DB.batch([
  jointGuard(DB,token,unchanged,owned.raw===null?[owned.key]:[owned.key,owned.raw]),
  jointGuard(DB,token+'c','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[PET_CMS_KEY,cms.raw]),
  jointGuard(DB,token+'u','EXISTS(SELECT 1 FROM users WHERE id=?)',[target.id]),
  jointGuard(DB,token+'r','NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[key]),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',owned.key,raw),
  p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'PET_GRANT','USER',String(target.id),JSON.stringify({petCode:pet.code,quantity:before,revision:owned.state.revision}),JSON.stringify(result)),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify({payloadHash,result})),
  ...[token,token+'c',token+'u',token+'r'].map(t=>jointGuardEnd(DB,t))
 ]);}catch(error){
  const replay=await receipt(env,key,payloadHash);if(replay)return replay;
  if((await readPetCollection(env,target.id)).raw!==owned.raw||(await readPetCms(env)).raw!==cms.raw)fail('REVISION','다른 요청으로 보유량 또는 펫 설정이 변경됐습니다. 다시 확인하세요.',409);
  throw error;
 }
 return result;
}
export async function handlePetGrants({path,request,env,deps}){
 if(!['admin/pets/grants','admin/pets/grants/preview'].includes(path))return null;
 const reply=(data,status=200)=>{const r=deps.json(data,status);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization');return r;};
 try{
  const admin=await deps.requirePermission(request,env,'USER_MANAGE');if(!admin||admin.role!=='OWNER')return reply({error:'펫 지급은 OWNER 전용입니다.'},403);
  if(!['GET','POST'].includes(request.method)||path.endsWith('/preview')&&request.method!=='POST')return reply({error:'지원하지 않는 요청입니다.'},405);
  if(request.method==='GET'){
   const [cms,logs]=await Promise.all([readPetCms(env),env.DB.prepare("SELECT after_data FROM admin_logs WHERE action_type='PET_GRANT' ORDER BY id DESC LIMIT 20").all()]);
   return reply({adminId:Number(admin.id),catalog:catalog(cms),history:logs.results.map(r=>JSON.parse(r.after_data))});
  }
  if(path.endsWith('/preview')){
   const body=await readJointBody(request,{fields:['recipientType','recipient','petCode','quantity','reason']}),selected=selection(body);
   if(!['NICKNAME','ID'].includes(body.recipientType)||typeof body.recipient!=='string'||!body.recipient.trim()||body.recipient.length>80)fail('TARGET','닉네임 또는 계정 ID를 입력하세요.');
   let target;
   if(body.recipientType==='ID')target=await targetById(env,Number(body.recipient));
   else{const rows=await env.DB.prepare('SELECT id,nickname FROM users WHERE nickname=? LIMIT 2').bind(body.recipient.trim()).all();if(rows.results.length!==1)fail('TARGET',rows.results.length?'동일한 닉네임이 있습니다. 계정 ID로 확인하세요.':'정확한 닉네임을 찾지 못했습니다.',rows.results.length?409:404);target={id:Number(rows.results[0].id),nickname:rows.results[0].nickname};}
   const [cms,owned]=await Promise.all([readPetCms(env),readPetCollection(env,target.id)]),pet=catalog(cms).find(p=>p.code===selected.petCode);if(!pet)fail('PET','등록된 펫을 선택하세요.');
   const before=owned.state.pets[pet.code]||0;if(!Number.isSafeInteger(before+selected.quantity))fail('LIMIT','펫 보유 한도를 초과했습니다.',409);
   return reply({target,pet,before,after:before+selected.quantity,grant:{userId:target.id,...selected,expectedRevision:owned.state.revision,petCmsRevision:cms.state.revision}});
  }
  const body=await readJointBody(request,{fields:['userId','petCode','quantity','reason','expectedRevision','petCmsRevision','requestId']});
  if(!Number.isSafeInteger(body.userId)||body.userId<1)fail('TARGET','계정 ID를 확인하세요.');
  return reply(await deps.withUserMutationLock(env,body.userId,path,()=>grantPet(env,admin,body)));
 }catch(error){const known=String(error.code||'').startsWith('PET_GRANT_')||String(error.code||'').startsWith('JOINT_');if(!known)console.error('[pet-grants] unavailable',error?.name||'Error');return reply({error:known?error.message:'펫 지급 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',code:known?error.code:'PET_GRANT_UNAVAILABLE',retryable:!known||error.status>=500},known?error.status||400:503);}
}
