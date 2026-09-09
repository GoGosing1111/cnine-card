import {ensureWishLamp} from './_wish_lamp.js';
import {WISH_TICKET} from '../js/wish-lamp-model-v2077.js';

export const WISH_COUPON_MAX=100000;
const label='핑두의 소원권';
class WishCouponError extends Error{
 constructor(message,status=409){super(message);this.status=status}
}
const fail=(message,status)=>{throw new WishCouponError(message,status)};
const validAmount=value=>Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=WISH_COUPON_MAX;

// Keep ordinary coupons unchanged. Wish tickets use the same inventory consumed by the event.
// Serialize the coupon row as well as the user: different users cannot take the last use twice.
export async function redeemWishTicketCoupon({env,user,coupon,body,deps}){
 if(String(coupon?.reward_type||'').toUpperCase()!==WISH_TICKET)return null;
 try{
  await ensureWishLamp(env);
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
     if(prior.reward_type!==WISH_TICKET||!validAmount(prior.reward_amount))fail('쿠폰 지급 기록을 확인해야 합니다.',500);
     rewardAmount=Number(prior.reward_amount);replayed=true;
    }else{
     if(Number(current.is_active)!==1||current.deleted_at)fail('존재하지 않거나 중지된 쿠폰입니다.',404);
     if(Number(current.used_count)>=Number(current.max_uses))fail('쿠폰 사용 한도가 모두 소진되었습니다.');
     if(current.reward_type!==WISH_TICKET||!validAmount(current.reward_amount))fail('소원권 쿠폰 보상 설정을 확인하세요.',400);
     const [item]=await q('SELECT is_active FROM inventory_items WHERE code=$1 FOR SHARE',[WISH_TICKET]);
     if(Number(item?.is_active)!==1)fail('소원권 지급이 중지되어 있습니다. 쿠폰은 사용되지 않았습니다.');
     rewardAmount=Number(current.reward_amount);
     const inventory=await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
       VALUES($1,$2,$3,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE
       SET quantity=cnine_user_inventory.quantity+EXCLUDED.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+EXCLUDED.unseen_quantity,updated_at=CURRENT_TIMESTAMP
       RETURNING quantity`,[user.id,WISH_TICKET,rewardAmount]);
     if(inventory.length!==1)fail('소원권 지급에 실패했습니다. 쿠폰은 사용되지 않았습니다.',500);
     const usage=await q('UPDATE coupons SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_active=1 AND deleted_at IS NULL AND used_count<max_uses RETURNING id',[current.id]);
     if(usage.length!==1)fail('쿠폰 사용 한도가 모두 소진되었거나 쿠폰이 중지되었습니다.');
     const log=await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'COUPON','COUPON',$5) RETURNING user_id",[user.id,WISH_TICKET,rewardAmount,inventory[0].quantity,String(current.id)]);
     if(log.length!==1)fail('소원권 지급 기록 저장에 실패했습니다.',500);
     const receipt=await q('INSERT INTO coupon_redemptions(coupon_id,user_id,reward_coin,reward_type,reward_amount,operation_key) VALUES($1,$2,0,$3,$4,$5) RETURNING user_id',[current.id,user.id,WISH_TICKET,rewardAmount,operationKey]);
     if(receipt.length!==1)fail('쿠폰 사용 기록 저장에 실패했습니다.',500);
    }
    await q('COMMIT');
    return {ok:true,replayed,rewardType:WISH_TICKET,rewardAmount,rewardLabel:label,rewardCoin:0,
     message:`${label} ${rewardAmount.toLocaleString('ko-KR')}개를 받았습니다. 핑두의 소원램프에서 사용하세요.`};
   }catch(error){try{await q('ROLLBACK')}catch{}throw error}
  });
  const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  return deps.json({...result,user:await deps.profile(env,fresh)});
 }catch(error){if(error instanceof WishCouponError)return deps.json({error:error.message},error.status);throw error}
}
