import {SUPPORT_PLAN,SUPPORT_NOTICE,SUPPORT_DURATION_MS,canManageSupport,supportAccountEligible,supportBenefits} from '../shared/server-support-v1.mjs';
import {readSupportRecord} from './_supporter_benefits.js';
import {readPetCollection,readPetPotentials} from './_pet_account.js';
import {readPetCms} from './_pet_companion_cms.js';
import {PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {readJointBody,jointError} from './_joint_request.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';

const fail=(code,message,status=400)=>{throw jointError('SUPPORT_'+code,message,status);};
const validId=id=>Number.isSafeInteger(id)&&id>0;
async function account(env,id){return env.DB.prepare('SELECT u.id,u.nickname,u.status,u.created_at,s.verified_at FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=?').bind(id).first();}
const targetOf=row=>({id:Number(row.id),nickname:row.nickname});
async function priorReceipt(env,key,payload){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();if(!row)return null;
  const saved=JSON.parse(row.value);if(saved.payload!==payload)fail('REQUEST_CONFLICT','같은 요청 번호에 다른 내용이 포함되었습니다.',409);
  return {...saved.result,replayed:true};
}
async function commit(env,{record,next,key,payload,result,admin,guard=[]}){
  const DB=env.DB,token=crypto.randomUUID(),raw=JSON.stringify(next),p=(sql,...args)=>DB.prepare(sql).bind(...args);
  await ensureJointAtomicSchema(env);
  try{await DB.batch([
    jointGuard(DB,token,record.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',record.raw===null?[record.key]:[record.key,record.raw]),
    jointGuard(DB,token+'r','NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[key]),
    ...guard.map((g,i)=>jointGuard(DB,token+'g'+i,g[0],g[1])),
    record.raw===null?p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',record.key,raw):p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,record.key,record.raw),
    jointGuard(DB,token+'w','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[record.key,raw]),
    ...(admin?[p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'SERVER_SUPPORT_'+result.action,'USER',String(result.target.id),record.raw,JSON.stringify(result))]:[]),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify({payload,result})),
    ...[token,token+'r',token+'w',...guard.map((_,i)=>token+'g'+i)].map(t=>jointGuardEnd(DB,t))
  ]);}catch(error){
    const replay=await priorReceipt(env,key,payload);if(replay)return replay;
    if((await readSupportRecord(env,result.target.id)).raw!==record.raw)fail('REVISION','다른 창에서 후원 정보를 변경했습니다. 다시 확인하세요.',409);
    throw error;
  }
  return result;
}
function mutationBody(body){
  if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('INPUT','대상과 요청 정보를 다시 확인하세요.');
}
export async function changeSupport(env,admin,body,now=Date.now()){
  if(!canManageSupport(admin))fail('ADMIN','후원 관리는 핑크빛유두 전용입니다.',403);
  mutationBody(body);
  if(!validId(body.userId)||!['GRANT','REVOKE'].includes(body.action)||typeof body.note!=='string'||!body.note.trim()||body.note.trim().length>200)fail('INPUT','대상 계정, 처리 종류와 확인 메모를 입력하세요.');
  const key='server_support_receipt_v1:'+body.requestId,payload=JSON.stringify([Number(admin.id),body.userId,body.action,body.expectedRevision,body.note.trim()]);
  const prior=await priorReceipt(env,key,payload);if(prior)return prior;
  const [row,record]=await Promise.all([account(env,body.userId),readSupportRecord(env,body.userId)]);
  if(!row)fail('TARGET','계정을 찾지 못했습니다.',404);
  if(record.state.revision!==body.expectedRevision)fail('REVISION','후원 정보가 변경됐습니다. 대상을 다시 확인하세요.',409);
  const active=supportBenefits(record.state,now).active,grant=body.action==='GRANT';
  if(grant&&!supportAccountEligible(row,now))fail('ELIGIBILITY','가입 3일 경과와 2차 인증 완료가 필요합니다.',403);
  if(!grant&&!active)fail('INACTIVE','현재 이용 중인 후원 혜택이 없습니다.',409);
  const next={...record.state,revision:record.state.revision+1,...(grant?{startsAt:active?record.state.startsAt:now,endsAt:Math.max(active?record.state.endsAt:0,now)+SUPPORT_DURATION_MS,revokedAt:null,magnetPetCode:active?record.state.magnetPetCode:null}:{revokedAt:now})};
  if(!Number.isSafeInteger(next.revision)||!Number.isSafeInteger(next.endsAt))fail('LIMIT','이용 기간 한도를 초과했습니다.',409);
  const target=targetOf(row),result={ok:true,requestId:body.requestId,action:body.action,target,amountWon:grant?SUPPORT_PLAN.priceWon:0,note:body.note.trim(),processedAt:now,subscription:supportBenefits(next,now),replayed:false};
  const guard=grant?[['EXISTS(SELECT 1 FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=? AND u.status=? AND u.created_at=? AND s.verified_at=?)',[target.id,'ACTIVE',row.created_at,row.verified_at]]]:[];
  return commit(env,{record,next,key,payload,result,admin,guard});
}
export async function selectSupportPet(env,user,body,now=Date.now()){
  mutationBody(body);if(typeof body.petCode!=='string'||!/^PET-[A-Z0-9-]{1,28}$/.test(body.petCode))fail('PET','보유한 펫을 선택하세요.');
  const key='server_support_pet_receipt_v1:'+Number(user.id)+':'+body.requestId,payload=JSON.stringify([Number(user.id),body.petCode,body.expectedRevision]);
  const prior=await priorReceipt(env,key,payload);if(prior)return prior;
  const [record,owned,cms]=await Promise.all([readSupportRecord(env,user.id),readPetCollection(env,user.id),readPetCms(env)]);
  if(!supportBenefits(record.state,now).active)fail('EXPIRED','후원 이용 기간이 종료되었습니다.',403);
  if(record.state.revision!==body.expectedRevision)fail('REVISION','후원 정보가 변경됐습니다. 다시 불러와 주세요.',409);
  if(!(owned.state.pets[body.petCode]>0)||!cms.state.document.pets.some(p=>p.code===body.petCode))fail('NOT_OWNED','현재 보유한 펫만 선택할 수 있습니다.',403);
  const next={...record.state,revision:record.state.revision+1,magnetPetCode:body.petCode};
  if(!Number.isSafeInteger(next.revision))fail('LIMIT','변경 기록 한도에 도달했습니다.',409);
  const result={ok:true,requestId:body.requestId,target:{id:Number(user.id)},subscription:supportBenefits(next,now),replayed:false};
  return commit(env,{record,next,key,payload,result,guard:[['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[owned.key,owned.raw]],['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[PET_CMS_KEY,cms.raw]]]});
}
async function supporterPage(env,user,now){
  const [record,owned,potentials,cms]=await Promise.all([readSupportRecord(env,user.id),readPetCollection(env,user.id),readPetPotentials(env,user.id),readPetCms(env)]);
  return {plan:SUPPORT_PLAN,notice:SUPPORT_NOTICE,serverNow:now,subscription:supportBenefits(record.state,now),pets:cms.state.document.pets.filter(p=>owned.state.pets[p.code]>0).map(p=>({code:p.code,name:p.name,sourceArt:p.sourceArt,permanentMagnet:potentials.state.pets[p.code]?.potential==='MAGNET'}))};
}
export async function handleServerSupport({path,request,env,deps}){
  const admin=path.startsWith('admin/server-support');
  if(!admin&&!path.startsWith('server-support/'))return null;
  const reply=(body,status=200)=>{const r=deps.json(body,status);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization');return r;};
  try{
    const user=await (admin?deps.requirePermission(request,env,'USER_MANAGE'):deps.authenticate(request,env));
    if(!user)return reply({error:'로그인이 필요합니다.'},401);
    const now=(deps.now||Date.now)();
    if(admin){
      if(!canManageSupport(user))return reply({error:'후원 관리는 핑크빛유두 전용입니다.'},403);
      if(path==='admin/server-support'&&request.method==='GET'){
        const [rows,logs]=await Promise.all([
          env.DB.prepare("SELECT u.id,u.nickname,m.value FROM app_meta m JOIN users u ON m.key='server_support_v1:'||u.id WHERE m.key LIKE 'server_support_v1:%' ORDER BY m.updated_at DESC LIMIT 200").all(),
          env.DB.prepare("SELECT after_data FROM admin_logs WHERE action_type IN ('SERVER_SUPPORT_GRANT','SERVER_SUPPORT_REVOKE') ORDER BY id DESC LIMIT 30").all()
        ]);
        return reply({adminId:Number(user.id),plan:SUPPORT_PLAN,notice:SUPPORT_NOTICE,pageAccess:'PINGDU_ONLY',serverNow:now,subscribers:rows.results.map(r=>({target:targetOf(r),subscription:supportBenefits(JSON.parse(r.value),now)})),history:logs.results.map(r=>JSON.parse(r.after_data))});
      }
      if(path==='admin/server-support/preview'&&request.method==='POST'){
        const body=await readJointBody(request,{fields:['recipientType','recipient']});
        if(!['NICKNAME','ID'].includes(body.recipientType)||typeof body.recipient!=='string'||!body.recipient.trim()||body.recipient.length>80)fail('TARGET','정확한 닉네임 또는 계정 ID를 입력하세요.');
        if(body.recipientType==='ID'&&!validId(Number(body.recipient)))fail('TARGET','계정 ID는 양의 정수로 입력하세요.');
        const rows=await env.DB.prepare(body.recipientType==='ID'?'SELECT id FROM users WHERE id=?':'SELECT id FROM users WHERE nickname=? LIMIT 2').bind(body.recipientType==='ID'?Number(body.recipient):body.recipient.trim()).all();
        if(rows.results.length!==1)fail('TARGET',rows.results.length?'계정 ID로 다시 확인하세요.':'계정을 찾지 못했습니다.',404);
        const row=await account(env,rows.results[0].id),record=await readSupportRecord(env,row.id);
        return reply({target:targetOf(row),eligible:supportAccountEligible(row,now),subscription:supportBenefits(record.state,now),plan:SUPPORT_PLAN});
      }
      if(path==='admin/server-support'&&request.method==='POST'){
        const body=await readJointBody(request,{fields:['userId','action','note','expectedRevision','requestId']});
        if(!validId(body.userId))fail('TARGET','계정 ID를 확인하세요.');
        return reply(await deps.withUserMutationLock(env,body.userId,path,()=>changeSupport(env,user,body,(deps.now||Date.now)())));
      }
    }else{
      // The first release is visible only to the verified operator account.
      // Keep the age + verification gate when public access is opened later.
      const visible=canManageSupport(user)&&supportAccountEligible(await account(env,user.id),now);
      if(path==='server-support/status'&&request.method==='GET')return reply({visible});
      if(!visible)return reply({error:'페이지를 찾을 수 없습니다.'},404);
      if(path==='server-support/info'&&request.method==='GET')return reply(await supporterPage(env,user,now));
      if(path==='server-support/pet'&&request.method==='POST'){
        const body=await readJointBody(request,{fields:['petCode','expectedRevision','requestId']});
        return reply(await deps.withUserMutationLock(env,user.id,path,()=>selectSupportPet(env,user,body,(deps.now||Date.now)())));
      }
    }
    return reply({error:'지원하지 않는 요청입니다.'},405);
  }catch(error){
    const known=/^(SUPPORT_|JOINT_)/.test(String(error.code||''));
    return reply({error:known?error.message:'후원 정보를 확인하지 못했습니다. 잠시 후 같은 요청으로 다시 확인하세요.',code:known?error.code:'SUPPORT_UNAVAILABLE',retryable:!known||error.status>=500},known?error.status||400:503);
  }
}
