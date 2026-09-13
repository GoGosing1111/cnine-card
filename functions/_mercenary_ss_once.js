import {pickMercenaryDraw} from './_mercenary_draw_accounting.js';
import {DRAW_TOTAL} from '../shared/mercenary-draw-policy-v1.mjs';
import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

// A separately authorized, account-scoped one-time grant. No public request
// field can arm it, and the ordinary CMS probabilities are never modified.
export const mercenarySsOnceKey=userId=>`mercenary_pack_ss_once_v2104:${userId}`;
export function mercenarySsOnceState({userId,operationId,actorId,reason,now=new Date().toISOString()}){
  if(!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(actorId)||actorId<1||
     typeof operationId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(operationId)||
     typeof reason!=='string'||!reason.trim()||reason.length>1000||!Number.isFinite(Date.parse(now)))throw Error('Invalid one-time SS grant');
  return {version:2104,operationId,userId,actorId,reason,createdAt:now,status:'ARMED',rank:'SS',batchCount:10};
}
function validateArmed(value,userId){
  const state=JSON.parse(value);
  const expected=mercenarySsOnceState({...state,now:state.createdAt});
  if(state.userId!==Number(userId)||state.version!==2104||state.status!=='ARMED'||state.rank!=='SS'||state.batchCount!==10||
     Object.keys(state).length!==Object.keys(expected).length)throw jointError('MERCENARY_SS_ONCE_CONFIG','1회 보장 설정을 확인하세요.',409);
  return state;
}
export async function prepareMercenarySsOnce(env,user,count){
  if(count!==10)return null;
  const key=mercenarySsOnceKey(user.id),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row||JSON.parse(row.value).status==='CONSUMED')return null;
  const state=validateArmed(row.value,user.id);
  return {key,before:row.value,operationId:state.operationId,index:9};
}
export function pickMercenarySsOnce({policy,mercenaries,randomInt}){
  return {...pickMercenaryDraw({policy:{...policy,outcomes:policy.outcomes.map(row=>({...row,chancePpm:row.id==='CARD_SS'?DRAW_TOTAL:0}))},mercenaries,randomInt}),grantKind:'ONE_TIME_SS_GUARANTEE'};
}
export async function consumeMercenarySsOnce(env,user,requestId,plan,draw){
  if(!plan)return [];
  const state=validateArmed(plan.before,user.id);
  if(plan.key!==mercenarySsOnceKey(user.id)||plan.operationId!==state.operationId||plan.index!==9||draw?.rank!=='SS'||draw?.grantKind!=='ONE_TIME_SS_GUARANTEE')throw jointError('MERCENARY_SS_ONCE_CONFIG','1회 보장 결과를 확인하세요.',409);
  const current=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(plan.key).first();
  if(current?.value!==plan.before)throw Object.assign(jointError('JOINT_OPERATION_SUPERSEDED','1회 보장 상태가 변경되었습니다. 새 개봉으로 다시 시도하세요.',409),{terminal:true});
  const after=JSON.stringify({...state,status:'CONSUMED',consumedAt:new Date().toISOString(),requestId,acquisitionId:`${requestId}:${plan.index}`,mercenaryCode:draw.mercenaryCode});
  const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
  return [
    ...(DB.dialect==='postgres'?[p('SELECT value FROM app_meta WHERE key=? FOR UPDATE',plan.key)]:[]),
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[plan.key,plan.before]),
    p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',after,plan.key,plan.before),
    p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) THEN 1 ELSE 0 END WHERE token=?',plan.key,after,token),
    p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',state.actorId,'MERCENARY_SS_ONCE_CONSUMED','USER',String(user.id),plan.before,after),
    jointGuardEnd(DB,token)
  ];
}
