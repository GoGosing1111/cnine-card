import {rankPotionItem} from '../shared/rank-exp-potion-v1.mjs';
import {runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

const item=rankPotionItem('RANK_EXP_POTION_2X_60M');
export const RANK_POTION_GRANT_MAX=9999;
class PotionGrantError extends Error{
 constructor(message,status=409){super(message);this.status=status;}
}
const fail=(message,status)=>{throw new PotionGrantError(message,status);};
const validAmount=value=>Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=RANK_POTION_GRANT_MAX;

// USER_MANAGE and OWNER-target checks belong to the route. The caller holds the
// account mutation lock; this receipt keeps retries from issuing another potion.
export async function grantRankExpPotion(env,admin,{userId,amount,reason='',requestId}){
 if(!Number.isSafeInteger(userId)||userId<1||!validAmount(amount))fail('계정과 물약 수량(1~9,999개)을 확인하세요.',400);
 amount=Number(amount);
 const memo=String(reason||'').trim().slice(0,100)||`관리자 ${item.name} 지급`;
 const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
 const result=await runJointOperation(env,{id:userId},{requestId,kind:'ADMIN_RANK_EXP_POTION_GRANT',
  input:{adminId:admin.id,itemCode:item.code,amount,reason:memo},
  prepare:async()=>{
   if(!await p('SELECT code FROM inventory_items WHERE code=? AND is_active=1',item.code).first())
    fail('경험치 2배 물약 지급이 중지되어 있습니다.');
   return {adminId:admin.id,itemCode:item.code,amount,reason:memo};
  },
  statements:async plan=>{
   const token=crypto.randomUUID(),limit=Number.MAX_SAFE_INTEGER-plan.amount;
   return [
    jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=?)
     AND EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)
     AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=?
      AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))`,
     [userId,item.code,userId,item.code,limit,limit]),
    ...jointInventoryChange(DB,userId,item.code,plan.amount,plan.reason,requestId),
    p(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
     VALUES(?,'INVENTORY','USER',?,NULL,?)`,plan.adminId,String(userId),
     JSON.stringify({requestId,itemCode:item.code,itemName:item.name,amount:plan.amount,reason:plan.reason})),
    jointGuardEnd(DB,token)
   ];
  }
 });
 const inventory=await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',userId,item.code).first();
 return {ok:true,requestId,replayed:result.replayed,itemCode:item.code,itemName:item.name,amount:result.plan.amount,balance:Number(inventory?.quantity||0)};
}

// Inventory, coupon usage, audit and redemption are committed together. Receipt
// delivery never starts/extends the buff; only the existing inventory-use path does.
export async function redeemRankExpPotionCoupon({env,user,coupon,body,deps}){
 if(String(coupon?.reward_type||'').toUpperCase()!==item.code)return null;
 try{
  const requestedKey=String(body.operationKey||'').trim();
  const operationKey=/^[A-Za-z0-9:_-]{8,120}$/.test(requestedKey)?requestedKey:`COUPON:${coupon.id}:${user.id}:${crypto.randomUUID()}`;
  const result=await env.DB.enqueue(async()=>{
   const q=async(text,values=[])=>(await env.DB.client.query({text,values})).rows;
   await q('BEGIN');
   try{
    await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='15s'");
    const [account]=await q("SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND (banned_until IS NULL OR banned_until<=sqlite_now()) FOR UPDATE",[user.id]);
    if(!account)fail('사용 가능한 계정이 아닙니다.',403);
    const [current]=await q('SELECT * FROM coupons WHERE id=$1 AND code=$2 FOR UPDATE',[coupon.id,coupon.code]);
    if(!current)fail('존재하지 않거나 삭제된 쿠폰입니다.',404);
    const [prior]=await q('SELECT reward_type,reward_amount,operation_key FROM coupon_redemptions WHERE coupon_id=$1 AND user_id=$2',[current.id,user.id]);
    let rewardAmount,replayed=false;
    if(prior){
     if(prior.operation_key!==operationKey)fail('이미 사용한 쿠폰입니다.');
     if(prior.reward_type!==item.code||!validAmount(prior.reward_amount))fail('쿠폰 지급 기록을 확인해야 합니다.',500);
     rewardAmount=Number(prior.reward_amount);replayed=true;
    }else{
     if(Number(current.is_active)!==1||current.deleted_at)fail('존재하지 않거나 중지된 쿠폰입니다.',404);
     if(Number(current.used_count)>=Number(current.max_uses))fail('쿠폰 사용 한도가 모두 소진되었습니다.');
     if(current.reward_type!==item.code||!validAmount(current.reward_amount))fail('경험치 2배 물약 쿠폰 보상 설정을 확인하세요.',400);
     const [catalog]=await q('SELECT is_active FROM inventory_items WHERE code=$1 FOR SHARE',[item.code]);
     if(Number(catalog?.is_active)!==1)fail('경험치 2배 물약 지급이 중지되어 있습니다. 쿠폰은 사용되지 않았습니다.');
     rewardAmount=Number(current.reward_amount);
     const inventory=await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      VALUES($1,$2,$3,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE
      SET quantity=cnine_user_inventory.quantity+EXCLUDED.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+EXCLUDED.unseen_quantity,updated_at=CURRENT_TIMESTAMP
      WHERE cnine_user_inventory.quantity BETWEEN 0 AND $4 AND cnine_user_inventory.unseen_quantity BETWEEN 0 AND $4
      RETURNING quantity`,[user.id,item.code,rewardAmount,Number.MAX_SAFE_INTEGER-rewardAmount]);
     if(inventory.length!==1)fail('물약 보유 수량을 확인하세요. 쿠폰은 사용되지 않았습니다.');
     const usage=await q('UPDATE coupons SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_active=1 AND deleted_at IS NULL AND used_count<max_uses RETURNING id',[current.id]);
     if(usage.length!==1)fail('쿠폰 사용 한도가 모두 소진되었거나 쿠폰이 중지되었습니다.');
     const log=await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'COUPON','COUPON',$5) RETURNING user_id",[user.id,item.code,rewardAmount,inventory[0].quantity,String(current.id)]);
     if(log.length!==1)fail('물약 지급 기록 저장에 실패했습니다.',500);
     const receipt=await q('INSERT INTO coupon_redemptions(coupon_id,user_id,reward_coin,reward_type,reward_amount,operation_key) VALUES($1,$2,0,$3,$4,$5) RETURNING user_id',[current.id,user.id,item.code,rewardAmount,operationKey]);
     if(receipt.length!==1)fail('쿠폰 사용 기록 저장에 실패했습니다.',500);
    }
    await q('COMMIT');
    return {ok:true,replayed,rewardType:item.code,rewardAmount,rewardLabel:`${item.name} (60분)`,rewardCoin:0,
     message:`${item.name} ${rewardAmount.toLocaleString('ko-KR')}개를 받았습니다. 인벤토리에서 사용하면 60분 동안 적용됩니다.`};
   }catch(error){try{await q('ROLLBACK');}catch{}throw error;}
  });
  const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  return deps.json({...result,user:await deps.profile(env,fresh)});
 }catch(error){if(error instanceof PotionGrantError)return deps.json({error:error.message},error.status);throw error;}
}
