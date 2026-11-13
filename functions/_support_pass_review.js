import {canManageSupport,supportBenefits} from '../shared/server-support-v1.mjs';
import {readSupportRecord} from './_supporter_benefits.js';
import {jointError} from './_joint_request.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const PASS_ORDER_PREFIX='support_pass_month2_pending_v1:';
export const secondPassOrderKey=id=>PASS_ORDER_PREFIX+Number(id);
const holdPrefix='support_pass_purchase_hold_v1:';
const holdKey=id=>holdPrefix+Number(id);
export const unpaidKey=applicationId=>'support_pass_unpaid_v1:'+applicationId;
const conflict=()=>jointError('SUPPORT_REVIEW_CHANGED','이미 처리됐거나 변경된 신청입니다. 대상을 다시 확인하세요.',409);

export function supportAccount(env,id){
  return env.DB.prepare(`SELECT u.id,u.nickname,u.status,u.created_at,s.verified_at,h.value AS pass_hold_raw
    FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id
    LEFT JOIN app_meta h ON h.key=(? || CAST(u.id AS TEXT)) WHERE u.id=?`).bind(holdPrefix,id).first();
}
export function purchaseHold(row){
  if(row.pass_hold_raw==null)return {blocked:false,revision:0};
  const {blocked,revision}=JSON.parse(row.pass_hold_raw);
  if(typeof blocked!=='boolean'||!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid pass purchase hold');
  return {blocked,revision};
}
export function requirePassPurchase(row){
  if(purchaseHold(row).blocked)throw jointError('SUPPORT_PURCHASE_HELD','이 계정의 시즌패스 구매가 임시 제한되어 있습니다.',403);
}
export function recordGuard(key,raw){
  return raw==null?['NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[key]]:
    ['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,raw]];
}
export const purchaseHoldGuard=row=>recordGuard(holdKey(row.id),row.pass_hold_raw);
export async function priorSupportReceipt(env,key,payload){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row)return null;
  const saved=JSON.parse(row.value);
  if(saved.payload!==payload)throw jointError('SUPPORT_REQUEST_CONFLICT','같은 요청 번호에 다른 내용이 포함되었습니다.',409);
  return {...saved.result,replayed:true};
}

export async function reviewPassPurchase(env,admin,body,now){
  if(!canManageSupport(admin))throw jointError('SUPPORT_ADMIN','후원 관리 권한이 필요합니다.',403);
  const {userId,action,requestId,passApplicationId,expectedHoldRevision}=body;
  const reject=action==='REJECT_UNPAID';
  const allowed=reject||action==='HOLD_PURCHASE'||action==='RELEASE_PURCHASE';
  if(!allowed||body.month!==undefined||
    (reject?typeof passApplicationId!=='string'||!passApplicationId.startsWith(userId+'_')||
      !/^[A-Za-z0-9_-]{16,100}$/.test(passApplicationId.slice(String(userId).length+1))||expectedHoldRevision!==undefined:
      passApplicationId!==undefined||!Number.isSafeInteger(expectedHoldRevision)||expectedHoldRevision<0))
    throw jointError('SUPPORT_REVIEW_INPUT','처리할 신청 또는 구매 제한 상태를 다시 확인하세요.');
  const key='server_support_receipt_v1:'+requestId,note=body.note.trim();
  const payload=JSON.stringify([Number(admin.id),userId,action,body.expectedRevision,note,passApplicationId??null,expectedHoldRevision??null]);
  const previous=await priorSupportReceipt(env,key,payload);
  if(previous)return previous;
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args);
  const orderKey=secondPassOrderKey(userId);
  const [account,support,order]=await Promise.all([supportAccount(env,userId),readSupportRecord(env,userId),
    reject?p('SELECT value FROM app_meta WHERE key=?',orderKey).first():null]);
  if(!account)throw jointError('SUPPORT_TARGET','계정을 찾지 못했습니다.',404);
  const hold=purchaseHold(account);
  const orderValue=order?JSON.parse(order.value):null;
  const blocked=action==='HOLD_PURCHASE';
  if(support.state.revision!==body.expectedRevision || (reject?orderValue?.id!==passApplicationId||orderValue.userId!==userId:
    hold.revision!==expectedHoldRevision||hold.blocked===blocked))throw conflict();

  const guard=reject?recordGuard(orderKey,order.value):purchaseHoldGuard(account);
  const nextHold=reject?hold:{blocked,revision:hold.revision+1};
  const result={ok:true,requestId,action,target:{id:userId,nickname:account.nickname},processedAt:now,amountWon:0,note,
    subscription:supportBenefits(support.state,now),purchaseHold:nextHold,replayed:false};
  if(reject)Object.assign(result,{month:2,passApplicationId,status:'REJECTED',reason:'UNPAID'});
  const writes=reject?[
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',unpaidKey(passApplicationId),
      JSON.stringify({userId,passApplicationId,month:2,status:'REJECTED',reason:'UNPAID',processedAt:now,requestId})),
    p('DELETE FROM app_meta WHERE key=? AND value=?',orderKey,order.value)
  ]:[p(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,holdKey(userId),JSON.stringify(nextHold))];
  const token=crypto.randomUUID();
  await ensureJointAtomicSchema(env);
  try{
    await DB.batch([
      ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',userId)]:[]),
      jointGuard(DB,token,...guard),
      jointGuard(DB,token+'s',...recordGuard(support.key,support.raw)),
      ...writes,
      p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',
        admin.id,'SERVER_SUPPORT_'+action,'USER',String(userId),JSON.stringify(reject?orderValue:hold),JSON.stringify(result)),
      p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify({payload,result})),
      jointGuardEnd(DB,token),jointGuardEnd(DB,token+'s')
    ]);
  }catch(error){
    const replay=await priorSupportReceipt(env,key,payload);if(replay)return replay;
    const latest=await p('SELECT value FROM app_meta WHERE key=?',reject?orderKey:holdKey(userId)).first();
    if((latest?.value??null)!==(reject?order.value:account.pass_hold_raw??null)||(await readSupportRecord(env,userId)).raw!==support.raw)throw conflict();
    throw error;
  }
  return result;
}
