import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

export const JOINT_TRANSACTION_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS joint_operations_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,kind TEXT NOT NULL,input_hash TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('PENDING','COMPLETED','CANCELLED')),created_at TEXT NOT NULL,completed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS joint_operations_user_v1 ON joint_operations_v1(user_id,kind,created_at)`
];
// Run only from the explicit release schema preparation, never from HTTP handlers.
export async function ensureJointTransactionSchema(env){
  await ensureJointAtomicSchema(env);
  if(env.DB.execSchema)await env.DB.execSchema(JOINT_TRANSACTION_SCHEMA);else for(const sql of JOINT_TRANSACTION_SCHEMA)await env.DB.prepare(sql).run();
}
export function jointRequestId(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(value))throw jointError('JOINT_REQUEST_ID','요청 번호를 확인하세요.');return value;}
export const jointHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
export async function readJointOperation(env,userId,requestId,kind){
  jointRequestId(requestId);const row=await env.DB.prepare('SELECT * FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND kind=?').bind(requestId,userId,kind).first();
  if(!row)throw jointError('JOINT_NOT_FOUND','내 요청 기록을 찾을 수 없습니다.',404);
  if(row.status==='CANCELLED')throw jointError('JOINT_OPERATION_SUPERSEDED','대상이 변경되어 요청을 취소했습니다. 최신 상태에서 다시 시도하세요.',409);
  return {...row,plan:JSON.parse(row.plan_json)};
}

// Caller holds the shared user mutation lock. The durable plan fixes randomness
// and policy before any payment; retries use it even after CMS settings change.
export async function runJointOperation(env,user,{requestId,kind,input,prepare,statements}){
  jointRequestId(requestId);const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),hash=await jointHash({kind,input});
  let row=await p('SELECT * FROM joint_operations_v1 WHERE request_id=?',requestId).first();
  const check=()=>{if(Number(row.user_id)!==Number(user.id)||row.kind!==kind||row.input_hash!==hash)throw jointError('JOINT_REQUEST_CONFLICT','같은 요청 번호에 다른 내용이 있습니다.',409);};
  if(!row){
    const plan=await prepare(),encoded=JSON.stringify(plan);if(encoded.length>250000)throw jointError('JOINT_PLAN_SIZE','요청 기록이 너무 큽니다.');
    await p("INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES(?,?,?,?,?,'PENDING',?) ON CONFLICT(request_id) DO NOTHING",requestId,user.id,kind,hash,encoded,new Date().toISOString()).run();
    row=await p('SELECT * FROM joint_operations_v1 WHERE request_id=?',requestId).first();
  }
  check();if(row.status==='CANCELLED')throw jointError('JOINT_OPERATION_SUPERSEDED','대상이 변경되어 요청을 취소했습니다. 최신 상태에서 다시 시도하세요.',409);const plan=JSON.parse(row.plan_json);if(row.status==='COMPLETED')return {requestId,plan,replayed:true,status:'COMPLETED'};
  const token=crypto.randomUUID(),list=[];
  if(DB.dialect==='postgres')list.push(p('SELECT id FROM users WHERE id=? FOR UPDATE',user.id));
  list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND input_hash=? AND status='PENDING')",[requestId,user.id,hash]));
  try{list.push(...await statements(plan));}catch(error){if(error.terminal===true)await p("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'",new Date().toISOString(),requestId,user.id).run();throw error;}
  list.push(p("UPDATE joint_operations_v1 SET status='COMPLETED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'",new Date().toISOString(),requestId,user.id));
  list.push(p("UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM joint_operations_v1 WHERE request_id=? AND status='COMPLETED') THEN 1 ELSE 0 END WHERE token=?",requestId,token),jointGuardEnd(DB,token));
  try{await DB.batch(list);}catch(error){
    // A commit followed by a lost acknowledgement is success, not another roll.
    const latest=await p('SELECT status FROM joint_operations_v1 WHERE request_id=? AND user_id=?',requestId,user.id).first();
    if(latest?.status!=='COMPLETED')throw error;
  }
  return {requestId,plan,replayed:false,status:'COMPLETED'};
}

export function jointCoinDebit(DB,userId,amount,reason){
  if(!Number.isSafeInteger(amount)||amount<0||amount>1e14)throw jointError('JOINT_COST','코인 비용 설정을 확인하세요.');
  const p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
  return [jointGuard(DB,token,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)',[userId,amount]),
    p('UPDATE users SET coin=coin-? WHERE id=? AND coin>=?',amount,userId,amount),
    ...(amount?[p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',-amount,reason,userId)]:[]),jointGuardEnd(DB,token)];
}
export function jointInventoryChange(DB,userId,itemCode,change,reason,referenceId){
  if(!/^[A-Z0-9_]{1,80}$/.test(itemCode)||!Number.isSafeInteger(change)||!change||Math.abs(change)>1e10)throw jointError('JOINT_ITEM','재료 설정을 확인하세요.');
  const p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID(),list=[jointGuard(DB,token,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[itemCode])];
  if(change<0){list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?) THEN 1 ELSE 0 END WHERE token=?',userId,itemCode,-change,token));
    list.push(p('UPDATE cnine_user_inventory SET quantity=quantity+?,unseen_quantity=MIN(unseen_quantity,quantity+?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=?',change,change,userId,itemCode,-change));
  }else{list.push(p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',userId,itemCode,change,change));}
  list.push(p('INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,?,?,? FROM cnine_user_inventory WHERE user_id=? AND item_code=?',change,reason,'V3_JOINT',referenceId,userId,itemCode),jointGuardEnd(DB,token));return list;
}
export async function saveJointPolicyDraft(env,user,key,before,next){
 const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),encoded=JSON.stringify(next),token=crypto.randomUUID();
 const same=before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
 try{await DB.batch([jointGuard(DB,token,same,before===null?[key]:[key,before]),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',key,encoded),
  p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'V3_JOINT_POLICY_DRAFT','APP_META',key,before,encoded),jointGuardEnd(DB,token)]);}
 catch(error){const current=await p('SELECT value FROM app_meta WHERE key=?',key).first();if(current?.value===encoded)return next;if((current?.value??null)!==before)throw jointError('JOINT_POLICY_CONFLICT','다른 창에서 정책을 변경했습니다. 최신 설정을 불러오세요.',409);throw error;}
 return next;
}
