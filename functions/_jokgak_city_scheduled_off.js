import {CITY_OFF_SCHEDULE_KEY as KEY,emptyCityOffSchedule} from '../shared/jokgak-city-schedule-off-v1.mjs';
import {CITY_SETTINGS_KEY} from '../shared/jokgak-city-settings-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {readCitySettings} from './_jokgak_city_settings.js';
import {settleCityRound} from './_jokgak_city_round.js';
import {CITY_TOP_CURSOR} from './_jokgak_city_top.js';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
import {readJointBody} from './_joint_request.js';
import {ensureCitySchema} from './_jokgak_city_schema.js';

const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const fail=(message,status=400,code='CITY_OFF_SCHEDULE')=>{throw Object.assign(Error(message),{status,code});};
const receiptKey=id=>'jokgak_city_scheduled_off_receipt_v1:'+id;
export async function readCityOffSchedule(env){
 const raw=(await p(env,'SELECT value FROM app_meta WHERE key=?',KEY).first())?.value??null;
 if(raw===null)return {raw,state:emptyCityOffSchedule()};
 try{
  const state=JSON.parse(raw),pending=state.pending;
  if(!Number.isSafeInteger(state.revision)||state.revision<0||pending!==null&&(!pending||typeof pending.id!=='string'||!Number.isSafeInteger(pending.offAt)||!Number.isSafeInteger(pending.createdBy)))throw Error('Invalid schedule');
  return {raw,state};
 }catch{fail('예약 OFF 정보를 읽을 수 없습니다. 다시 확인해 주세요.',503,'CITY_OFF_SCHEDULE_UNAVAILABLE');}
}
const stateGuard=(env,tag,raw)=>[
 cityGuard(env,tag,raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',raw===null?[KEY]:[KEY,raw]),cityGuardEnd(env,tag)
];
export async function saveCityOffSchedule(env,user,body,now=Date.now()){
 if(user?.role!=='OWNER')fail('예약 OFF는 OWNER만 변경할 수 있습니다.',403,'CITY_PERMISSION');
 const {revision,offAt,requestId}=body||{};
 if(!Number.isSafeInteger(revision)||revision<0||typeof requestId!=='string'||! /^[a-zA-Z0-9:_-]{8,80}$/.test(requestId)||offAt!==null&&(!Number.isSafeInteger(offAt)||offAt<0||offAt>253402300799999))fail('예약 날짜·시간과 버전을 확인하세요.');
 const changeKey=KEY+':change:'+user.id+':'+requestId,fingerprint=JSON.stringify({revision,offAt});
 const replay=async()=>{const row=await p(env,'SELECT value FROM app_meta WHERE key=?',changeKey).first();if(!row)return null;const receipt=JSON.parse(row.value);if(receipt.fingerprint!==fingerprint)fail('같은 요청 번호로 다른 예약을 저장할 수 없습니다.',409);return {...(await readCityOffSchedule(env)).state,replayed:true};};
 const prior=await replay();if(prior)return prior;
 if(offAt!==null&&offAt<=now)fail('현재보다 나중인 한국시간으로 예약하세요.');
 const current=await readCityOffSchedule(env);if(current.state.revision!==revision)fail('예약이 다른 창에서 변경됐습니다. 다시 불러오세요.',409,'CITY_OFF_SCHEDULE_CONFLICT');
 const next={...current.state,revision:revision+1,pending:offAt===null?null:{id:user.id+':'+requestId,offAt,createdAt:now,createdBy:Number(user.id)}};
 const raw=JSON.stringify(next),tag='city-off-save:'+crypto.randomUUID(),statements=[];
 // Materialize the initial key inside this transaction so concurrent first
 // saves also have a row to lock and cannot both pass an absence check.
 const expected=current.raw??JSON.stringify(emptyCityOffSchedule());
 if(current.raw===null)statements.push(p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',KEY,expected));
 if(env.DB.dialect==='postgres')statements.push(p(env,'SELECT key FROM app_meta WHERE key=? FOR UPDATE',KEY));
 statements.push(...stateGuard(env,tag,expected),p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',KEY,raw),
  p(env,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'JOKGAK_CITY_OFF_SCHEDULE_SAVE','JOKGAK_CITY',?,?,?)",user.id,KEY,current.raw,raw),
  p(env,'INSERT INTO app_meta(key,value) VALUES(?,?)',changeKey,JSON.stringify({fingerprint,revision:next.revision,actorId:Number(user.id),at:now})));
 try{await env.DB.batch(statements);}catch(error){const recovered=await replay();if(recovered)return recovered;if(/guard|constraint|deadlock|serializ|unique/i.test(error.message))fail('예약이 변경됐습니다. 다시 불러오세요.',409,'CITY_OFF_SCHEDULE_CONFLICT');throw error;}
 return next;
}
export async function processCityScheduledOff(env,now=Date.now(),{settle=settleCityRound}={}){
 const current=await readCityOffSchedule(env),pending=current.state.pending;
 if(!pending||now<pending.offAt)return {status:pending?'NOT_DUE':'NONE',pending};
 const existing=await p(env,'SELECT value FROM app_meta WHERE key=?',receiptKey(pending.id)).first();if(existing)return {...JSON.parse(existing.value),replayed:true};
 const initial=await readCitySettings(env);
 // Settle only rounds ending at or before the requested time, while ON rewards
 // are still available. Mid-round OFF never invents an early round payout.
 if(initial.policy.mode!=='OFF')await settle(env,pending.offAt);
 const fresh=await readCityOffSchedule(env);if(fresh.raw!==current.raw)return {status:'SCHEDULE_CHANGED'};
 const policy=await readCitySettings(env),shift=cityShift(pending.offAt),changed=policy.policy.mode!=='OFF';
 if(changed){
  const rows=(await p(env,'SELECT key,value FROM app_meta WHERE key IN (?,?)',CITY_TOP_CURSOR,'jokgak_city_rotation_cleanup_v1').all()).results||[];
  if(rows.length!==2||rows.some(row=>!Number.isSafeInteger(Number(row.value))||Number(row.value)<shift.id))fail('회차 정산 완료를 기다리고 있습니다.',503,'CITY_ROUND_SETTLING');
 }
 const at=new Date(now).toISOString(),before=policy.raw===null?policy.policy:JSON.parse(policy.raw),after=changed?{...before,mode:'OFF',enabled:false,revision:policy.policy.revision+1,updatedBy:pending.createdBy,updatedAt:at,writeToken:crypto.randomUUID()}:before;
 const result={id:pending.id,offAt:pending.offAt,completedAt:now,status:'COMPLETED',outcome:changed?'TURNED_OFF':'ALREADY_OFF',mode:'OFF',policyRevisionBefore:policy.policy.revision,policyRevisionAfter:after.revision,settledThroughEpoch:changed?shift.id:null};
 const next={revision:current.state.revision+1,pending:null,lastRun:result},tag='city-off-run:'+crypto.randomUUID(),statements=[];
 if(env.DB.dialect==='postgres')for(const key of [KEY,CITY_SETTINGS_KEY])statements.push(p(env,'SELECT key FROM app_meta WHERE key=? FOR UPDATE',key));
 statements.push(...stateGuard(env,tag,current.raw),cityGuard(env,tag+':policy',policy.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',policy.raw===null?[CITY_SETTINGS_KEY]:[CITY_SETTINGS_KEY,policy.raw]),cityGuardEnd(env,tag+':policy'));
 if(changed)statements.push(p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',CITY_SETTINGS_KEY,JSON.stringify(after)));
 statements.push(p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(next),KEY),p(env,'INSERT INTO app_meta(key,value) VALUES(?,?)',receiptKey(pending.id),JSON.stringify(result)),
  p(env,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'JOKGAK_CITY_SCHEDULED_CLOSE','JOKGAK_CITY',?,?,?)",pending.createdBy,pending.id,policy.raw,JSON.stringify(after)));
 try{await env.DB.batch(statements);}catch(error){const done=await p(env,'SELECT value FROM app_meta WHERE key=?',receiptKey(pending.id)).first();if(done)return {...JSON.parse(done.value),replayed:true};if((await readCityOffSchedule(env)).raw!==current.raw)return {status:'SCHEDULE_CHANGED'};throw error;}
 return result;
}
// A request started before the deadline cannot commit a new action after it.
export function cityOffScheduleWriteGuards(env,now,token){
 const at=env.DB.dialect==='postgres'?"CAST(value::jsonb->'pending'->>'offAt' AS BIGINT)":"json_extract(value,'$.pending.offAt')",tag=token+':off-deadline',rows=[];
 if(env.DB.dialect==='postgres')rows.push(p(env,'SELECT key FROM app_meta WHERE key=? FOR SHARE',KEY));
 rows.push(cityGuard(env,tag,`NOT EXISTS(SELECT 1 FROM app_meta WHERE key=? AND ${at}<=?)`,[KEY,now]),cityGuardEnd(env,tag));return rows;
}
export async function handleCityOffSchedule({path,request,env,deps,user}){
 if(path!=='admin/jokgak-city/schedule-off')return null;
 if(user?.role!=='OWNER')fail('예약 OFF는 OWNER 전용입니다.',403,'CITY_PERMISSION');
 if(request.method==='GET')return deps.json({ok:true,...(await readCityOffSchedule(env)).state,serverNow:(deps.now||Date.now)(),timeZone:'Asia/Seoul'});
 if(request.method!=='PATCH')fail('지원하지 않는 요청입니다.',405);
 const body=await readJointBody(request,{fields:['revision','offAt','requestId'],maxBytes:2048});
 await ensureCitySchema(env);
 return deps.json({ok:true,...await deps.withUserMutationLock(env,user.id,path,()=>saveCityOffSchedule(env,user,body,(deps.now||Date.now)())),serverNow:(deps.now||Date.now)(),timeZone:'Asia/Seoul'});
}
