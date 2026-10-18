import {MARTIAL_LAW_KEY,MARTIAL_LAW_DURATIONS,cleanMartialLaw,publicMartialLaw,canManageMartialLaw} from '../shared/martial-law-v1.mjs';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';
const cache=new WeakMap();
export async function readMartialLaw(env,{fresh=false,now=Date.now()}={}){
 const saved=cache.get(env.DB);if(!fresh&&saved&&now-saved.at<1000)return cleanMartialLaw(saved.value,now);
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MARTIAL_LAW_KEY).first();
 let raw={};if(row?.value)raw=JSON.parse(row.value);cache.set(env.DB,{at:now,value:raw});return cleanMartialLaw(raw,now);
}
export async function handleMartialLawAdmin({request,env,deps}){
 const user=await deps.authenticate(request,env),json=deps.json;
 if(!user)return json({error:'관리자 로그인이 필요합니다.'},401);
 if(!canManageMartialLaw(user))return json({error:'계엄령은 OWNER 핑크빛유두만 선포·해제할 수 있습니다.',code:'MARTIAL_OPERATOR_ONLY'},403);
 if(!['GET','PATCH'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
 const now=Math.floor((deps.now?.()??Date.now())/1000)*1000,row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MARTIAL_LAW_KEY).first(),before=cleanMartialLaw(row?JSON.parse(row.value):{},now);
 const response=state=>({settings:publicMartialLaw(state,now),allowedDurations:MARTIAL_LAW_DURATIONS,serverNow:new Date(now).toISOString()});
 if(request.method==='GET')return json(response(before));
 const body=await deps.readBody(request);
 if(!body||Object.keys(body).some(k=>!['enabled','durationMinutes','revision','requestId'].includes(k))||typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.revision)||typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId)||!MARTIAL_LAW_DURATIONS.includes(body.durationMinutes))return json({error:'상태·진행 시간·요청 정보를 확인하세요.',code:'MARTIAL_FIELDS'},400);
 const fingerprint=JSON.stringify({enabled:body.enabled,durationMinutes:body.durationMinutes,revision:body.revision});
 if(body.requestId===before.lastRequestId)return before.lastFingerprint===fingerprint?json({ok:true,replayed:true,...response(before)}):json({error:'같은 요청 번호로 다른 계엄령을 저장할 수 없습니다.'},409);
 if(body.revision!==before.revision)return json({error:'계엄령 상태가 변경되었습니다. 새로고침 후 확인하세요.',code:'MARTIAL_STALE'},409);
 const windows=before.windows.map(([start,end])=>[start,Math.min(end,now)]).filter(([start,end])=>end>start),at=new Date(now).toISOString(),endsAt=body.enabled?new Date(now+body.durationMinutes*60000).toISOString():null;
 if(body.enabled)windows.push([now,Date.parse(endsAt)]);
 const next=cleanMartialLaw({...before,enabled:body.enabled,durationMinutes:body.durationMinutes,activatedAt:body.enabled?at:before.activatedAt,endsAt,updatedAt:at,windows,revision:before.revision+1,generation:before.generation+(body.enabled?1:0),lastRequestId:body.requestId,lastFingerprint:fingerprint},now);
 const token='martial:'+crypto.randomUUID(),p=(sql,...args)=>env.DB.prepare(sql).bind(...args),raw=JSON.stringify({...next,commitToken:token});
 await ensureJointAtomicSchema(env);
 try{
  await env.DB.batch([
   ...(env.DB.dialect==='postgres'?[p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',MARTIAL_LAW_KEY)]:[]),
   jointGuard(env.DB,token,row?'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)':'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',row?[MARTIAL_LAW_KEY,row.value]:[MARTIAL_LAW_KEY]),
   row?p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,MARTIAL_LAW_KEY,row.value):p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',MARTIAL_LAW_KEY,raw),
   jointGuard(env.DB,token+':saved','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[MARTIAL_LAW_KEY,raw]),
   p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,body.enabled?'MARTIAL_LAW_DECLARE':'MARTIAL_LAW_REVOKE','APP_META',MARTIAL_LAW_KEY,JSON.stringify(publicMartialLaw(before,now)),JSON.stringify(publicMartialLaw(next,now))),jointGuardEnd(env.DB,token+':saved'),jointGuardEnd(env.DB,token)
  ]);
 }catch(error){
  cache.delete(env.DB);const saved=await readMartialLaw(env,{fresh:true,now});
  if(saved.lastRequestId===body.requestId&&saved.lastFingerprint===fingerprint)return json({ok:true,replayed:true,...response(saved)});
  if(saved.revision!==before.revision)return json({error:'계엄령 상태가 변경되었습니다. 새로고침 후 확인하세요.',code:'MARTIAL_STALE'},409);
  throw error;
 }
 cache.delete(env.DB);return json({ok:true,...response(next)});
}
