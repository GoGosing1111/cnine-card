import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {activePredictionSubsidy} from './_administration_treasury.js';

export const CMS_PREDICTION_SUBSIDY_LIMIT=5000000000000;
export const CMS_PREDICTION_SUBSIDY_PREFIX='coin_prediction_cms_subsidy_v1:';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const allowed=role=>['ADMIN','OWNER'].includes(String(role||'').trim().toUpperCase());
export async function readCmsPredictionSubsidy(env,eventId){
  const key=CMS_PREDICTION_SUBSIDY_PREFIX+eventId,row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),raw=row?.value??null,amount=raw===null?0:Number(raw);
  if(!Number.isSafeInteger(amount)||amount<0||amount>CMS_PREDICTION_SUBSIDY_LIMIT)fail('저장된 지원금 정보를 확인해야 합니다.',409);
  return {key,raw,amount};
}
// Exact integer division keeps trillion-coin support from rounding up a payout.
export function predictionShare(total,stake,pool){
  if(![total,stake,pool].every(Number.isSafeInteger)||total<0||stake<0||pool<=0||stake>pool)fail('정산 금액을 확인해야 합니다.',409);
  return Number(BigInt(total)*BigInt(stake)/BigInt(pool));
}
export async function addCmsPredictionSubsidy(env,admin,body,eventLock){
  if(!allowed(admin?.role))fail('ADMIN 이상만 지원금을 추가할 수 있습니다.',403);
  const {eventId,amount,expectedTotal,requestId}=body||{},note=typeof body?.note==='string'?body.note.trim():'';
  if(!Number.isSafeInteger(eventId)||eventId<1||!Number.isSafeInteger(amount)||amount<1||amount>CMS_PREDICTION_SUBSIDY_LIMIT||!Number.isSafeInteger(expectedTotal)||expectedTotal<0||expectedTotal>CMS_PREDICTION_SUBSIDY_LIMIT)fail('지원금은 경기당 합계 최대 5조 코인까지 추가할 수 있습니다.');
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)||!note||note.length>200)fail('요청 번호와 200자 이내의 지급 사유를 확인하세요.');
  const receiptKey=`coin_prediction_cms_subsidy_receipt_v1:${admin.id}:${requestId}`,payload=JSON.stringify([eventId,amount,expectedTotal,note]);
  const receipt=async()=>{const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();if(!row)return null;const saved=JSON.parse(row.value);if(saved.payload!==payload)fail('같은 요청 번호에 다른 지원금 내용이 포함되었습니다.',409);return {...saved.result,replayed:true};};
  const prior=await receipt();if(prior)return prior;
  const event=await env.DB.prepare('SELECT id,title,status FROM coin_prediction_events WHERE id=?').bind(eventId).first();
  if(!event)fail('존재하지 않는 경기입니다.',404);
  if(!['OPEN','CLOSED'].includes(event.status))fail('정산 전 경기만 지원금을 추가할 수 있습니다.',409);
  if(await env.DB.prepare("SELECT user_id FROM coin_prediction_bets WHERE event_id=? AND status<>'ACTIVE' LIMIT 1").bind(eventId).first())fail('정산 또는 환불이 시작된 경기에는 지원금을 추가할 수 없습니다.',409);
  const [record,treasury]=await Promise.all([readCmsPredictionSubsidy(env,eventId),activePredictionSubsidy(env,eventId)]),beforeTotal=record.amount+treasury,afterTotal=beforeTotal+amount,next=String(record.amount+amount);
  if(beforeTotal!==expectedTotal)fail('지원금이 변경되었습니다. 최신 금액을 확인하고 다시 입력하세요.',409);
  if(!Number.isSafeInteger(afterTotal)||afterTotal>CMS_PREDICTION_SUBSIDY_LIMIT)fail('기존 지원금을 포함한 경기당 지원금 합계는 5조를 넘을 수 없습니다.');
  const result={ok:true,eventId,requestId,added:amount,cmsSubsidy:record.amount+amount,treasurySubsidy:treasury,totalSubsidy:afterTotal,limit:CMS_PREDICTION_SUBSIDY_LIMIT,processedAt:new Date().toISOString(),replayed:false};
  const DB=env.DB,token=crypto.randomUUID(),p=(sql,...values)=>DB.prepare(sql).bind(...values);
  await ensureJointAtomicSchema(env);
  const guards=[
    [record.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',record.raw===null?[record.key]:[record.key,record.raw]],
    ['NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[receiptKey]],
    ["EXISTS(SELECT 1 FROM coin_prediction_events WHERE id=? AND status IN ('OPEN','CLOSED')) AND NOT EXISTS(SELECT 1 FROM coin_prediction_bets WHERE event_id=? AND status<>'ACTIVE')",[eventId,eventId]],
    ["EXISTS(SELECT 1 FROM users WHERE id=? AND role IN ('ADMIN','OWNER') AND status='ACTIVE')",[admin.id]],
    ["EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value LIKE ? AND CAST(substr(value,instr(value,'|')+1) AS BIGINT)>?)",[eventLock.name,eventLock.token+'|%',Date.now()]]
  ];
  try{await DB.batch([
    ...guards.map(([sql,values],i)=>jointGuard(DB,token+i,sql,values)),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',record.key,next),
    p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'COIN_PREDICTION_SUBSIDY','COIN_PREDICTION',String(eventId),JSON.stringify({cmsSubsidy:record.amount,treasurySubsidy:treasury,totalSubsidy:beforeTotal}),JSON.stringify({...result,note,title:event.title})),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',receiptKey,JSON.stringify({payload,result})),
    ...guards.map((_,i)=>jointGuardEnd(DB,token+i))
  ]);}catch(error){const replay=await receipt();if(replay)return replay;throw error;}
  return result;
}
