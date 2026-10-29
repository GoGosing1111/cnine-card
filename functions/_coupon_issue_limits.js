import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const COUPON_COIN_MAX=1_000_000_000_000;
export const OWNER_COUPON_DAILY_COIN_MAX=10_000_000_000_000;
// Production identity verified on 2026-10-29. Nickname changes cannot transfer the exemption.
export const COUPON_DAILY_EXEMPT_OWNER_ID=1;
const dailySumSql=`SELECT COALESCE(SUM(CASE WHEN COALESCE(reward_amount,0)>0 THEN reward_amount ELSE COALESCE(reward_coin,0) END),0) AS issued_coin
  FROM coupons WHERE created_by=? AND COALESCE(NULLIF(UPPER(TRIM(reward_type)),''),'COIN')='COIN' AND created_at>=? AND created_at<?`;
const issueError=(code,message,status=409)=>Object.assign(new Error(message),{code,status});
const sqlTime=date=>date.toISOString().slice(0,19).replace('T',' ');

export function couponIssueDay(now=new Date()){
  const date=new Date(now),dayKey=new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
  const start=new Date(dayKey+'T00:00:00+09:00');
  return {dayKey,start:sqlTime(start),end:sqlTime(new Date(start.getTime()+86400000)),createdAt:sqlTime(date)};
}
export function couponOwnerDailyLimit(admin){
  return admin?.role==='OWNER'&&Number(admin.id)!==COUPON_DAILY_EXEMPT_OWNER_ID?OWNER_COUPON_DAILY_COIN_MAX:null;
}
export async function readCouponIssueLimit(env,admin,now=new Date()){
  const day=couponIssueDay(now),dailyCoinLimit=couponOwnerDailyLimit(admin);
  const row=await env.DB.prepare(dailySumSql).bind(admin.id,day.start,day.end).first();
  const issuedCoin=Number(row?.issued_coin||0);
  return {perCouponCoin:COUPON_COIN_MAX,dailyCoinLimit,issuedCoin,remainingCoin:dailyCoinLimit===null?null:Math.max(0,dailyCoinLimit-issuedCoin),dayKey:day.dayKey,timeZone:'Asia/Seoul',countBy:'FACE_VALUE'};
}

// All three issue routes share this transaction. Deleted/disabled/redeemed coupons
// remain in the daily sum; max_uses never multiplies the face value or refunds it.
export async function createCouponWithinIssueLimit(env,admin,{code,rewardType,rewardAmount,maxUses,actionType='COUPON_CREATE_V3'},now=new Date()){
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
  if(rewardType==='COIN'&&(!Number.isSafeInteger(rewardAmount)||rewardAmount<1||rewardAmount>COUPON_COIN_MAX))throw issueError('COUPON_COIN_AMOUNT','코인 쿠폰은 1회 최대 1조 코인까지 발급할 수 있습니다.',400);
  const existing=await p('SELECT id,code,deleted_at FROM coupons WHERE code=? LIMIT 1',code).first();
  if(existing&&!existing.deleted_at)throw issueError('COUPON_CODE_EXISTS','이미 존재하는 쿠폰 코드입니다.');
  const day=couponIssueDay(now),limit=rewardType==='COIN'?couponOwnerDailyLimit(admin):null,token=crypto.randomUUID(),list=[];
  // A database row lock serializes separate tabs, Workers and API aliases. The
  // next statement reads a fresh committed sum after the lock has been acquired.
  if(limit!==null){
    if(DB.dialect==='postgres')list.push(p('SELECT id FROM users WHERE id=? FOR UPDATE',admin.id));
    list.push(jointGuard(DB,token,`(${dailySumSql})<=?`,[admin.id,day.start,day.end,limit-rewardAmount]));
  }
  if(existing){
    const archivedCode=`__DELETED_${Number(existing.id)}_${token}_${code}`;
    list.push(p('UPDATE coupons SET code=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NOT NULL AND code=?',archivedCode,existing.id,code));
    list.push(p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'COUPON_CODE_RELEASE','COUPON',existing.id,JSON.stringify({code,deletedAt:existing.deleted_at}),JSON.stringify({archivedCode,reusableCode:code})));
  }
  list.push(p('INSERT INTO coupons(code,reward_coin,reward_type,reward_amount,starts_at,ends_at,max_uses,is_active,created_by,created_at) VALUES(?,?,?,?,NULL,NULL,?,1,?,?)',code,rewardType==='COIN'?rewardAmount:0,rewardType,rewardAmount,maxUses,admin.id,day.createdAt));
  list.push(p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,actionType,'COUPON',code,null,JSON.stringify({code,rewardType,rewardAmount,maxUses,max:maxUses,permanent:true,issueDayKst:day.dayKey,coinIssueAmount:rewardType==='COIN'?rewardAmount:0})));
  if(limit!==null)list.push(jointGuardEnd(DB,token));
  try{await DB.batch(list);}catch(error){
    if(limit!==null&&/joint_atomic_guards/i.test(String(error?.message||''))){
      const issueLimit=await readCouponIssueLimit(env,admin,now);
      throw Object.assign(issueError('COUPON_OWNER_DAILY_LIMIT',`하루 코인 쿠폰 발행 한도는 10조입니다. 오늘 남은 발행 가능 금액: ${issueLimit.remainingCoin.toLocaleString('ko-KR')} 코인. (한국시간 자정 초기화 · 사용 인원 무관)`),{issueLimit});
    }
    throw error;
  }
  const coupon=await p('SELECT * FROM coupons WHERE code=? AND deleted_at IS NULL LIMIT 1',code).first();
  if(!coupon)throw issueError('COUPON_READ_FAILED','쿠폰 저장 후 조회에 실패했습니다.',500);
  return coupon;
}
