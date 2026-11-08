// Fixed event bundles. CMS issuance limits do not apply to these definitions and are unchanged.
export const NOVEMBER_GIFT_COUPON=Object.freeze({
 code:'CNINE1101GIFT100',type:'NOVEMBER_GIFT_20261101',maxUses:100,coin:30000000000000,
 label:'11월 선물 묶음',message:'계급 경험치 3배 물약 (60분) 2개, 코인 30조, 마스터의 별 2,000만 개를 받았습니다. 물약은 인벤토리에서 사용하세요.',
 items:Object.freeze([
  Object.freeze({code:'RANK_EXP_POTION_3X_60M',name:'계급 경험치 3배 물약 (60분)',amount:2}),
  Object.freeze({code:'MASTER_STAR',name:'마스터의 별',amount:20000000})
 ])
});
export const LUCKY_SEVEN_COUPON=Object.freeze({
 code:'CNINE7LUCK',type:'NOVEMBER_GIFT_20261107',maxUses:100,coin:250_000_000_000_000,
 label:'7일의 행운',message:'코인 250조, 마스터의 별 1억 개, 계급 경험치 3배 물약 (60분) 1개를 받았습니다. 물약은 인벤토리에서 사용하세요.',
 items:Object.freeze([
  Object.freeze({code:'MASTER_STAR',name:'마스터의 별',amount:100_000_000}),
  Object.freeze({code:'RANK_EXP_POTION_3X_60M',name:'계급 경험치 3배 물약 (60분)',amount:1})
 ])
});
export const SUWON_K1_COUPON=Object.freeze({
 ...LUCKY_SEVEN_COUPON,
 code:'SUWONK1UP',type:'NOVEMBER_GIFT_SUWON_K1_20261108',label:'수원삼성 K1 승격 기념'
});
const gifts=new Map([NOVEMBER_GIFT_COUPON,LUCKY_SEVEN_COUPON,SUWON_K1_COUPON].map(gift=>[gift.code,gift]));
class GiftCouponError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const fail=(message,status)=>{throw new GiftCouponError(message,status);};
const changed=(rows,message)=>{if(rows.length!==1)fail(message);return rows[0];};

export async function redeemNovemberGiftCoupon({env,user,coupon,body,deps}){
 const gift=gifts.get(coupon?.code);
 if(!gift||gift.type!==coupon.reward_type)return deps.json({error:'선물 쿠폰 설정을 확인하세요.'},409);
 try{
  const requestedKey=String(body.operationKey||'').trim();
  const operationKey=/^[A-Za-z0-9:_-]{8,120}$/.test(requestedKey)?requestedKey:`COUPON:${coupon.id}:${user.id}:${crypto.randomUUID()}`;
  const result=await env.DB.enqueue(async()=>{
   const q=async(text,values=[])=>(await env.DB.client.query({text,values})).rows;
   await q('BEGIN');
   try{
    await q("SELECT set_config('lock_timeout','4s',true),set_config('statement_timeout','15s',true)");
    const [account]=await q("SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND (banned_until IS NULL OR banned_until<=sqlite_now()) FOR UPDATE",[user.id]);
    if(!account)fail('사용 가능한 계정이 아닙니다.',403);
    const [current]=await q('SELECT * FROM coupons WHERE id=$1 AND code=$2 FOR UPDATE',[coupon.id,gift.code]);
    if(!current||current.reward_type!==gift.type)fail('존재하지 않거나 삭제된 쿠폰입니다.',404);
    const [prior]=await q('SELECT reward_type,reward_amount,reward_coin,operation_key FROM coupon_redemptions WHERE coupon_id=$1 AND user_id=$2',[current.id,user.id]);
    let replayed=false;
    if(prior){
     if(prior.operation_key!==operationKey)fail('이미 사용한 쿠폰입니다.');
     if(prior.reward_type!==gift.type||Number(prior.reward_amount)!==1||String(prior.reward_coin)!==String(gift.coin))fail('쿠폰 지급 기록을 확인해야 합니다.',500);
     replayed=true;
    }else{
     if(Number(current.is_active)!==1||current.deleted_at)fail('존재하지 않거나 중지된 쿠폰입니다.',404);
     if(Number(current.used_count)>=Number(current.max_uses))fail('쿠폰 사용 한도가 모두 소진되었습니다.');
     if(Number(current.reward_amount)!==1||String(current.reward_coin)!==String(gift.coin)||Number(current.max_uses)!==gift.maxUses||Number(current.used_count)<0||current.starts_at||current.ends_at)fail('선물 쿠폰 설정을 확인하세요.',409);
     const catalog=await q('SELECT code,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[gift.items.map(item=>item.code)]);
     if(catalog.length!==gift.items.length||catalog.some(item=>Number(item.is_active)!==1))fail('보상 아이템 지급이 중지되어 있습니다. 쿠폰은 사용되지 않았습니다.');
     const balance=changed(await q('UPDATE users SET coin=coin+$1::bigint WHERE id=$2 AND coin BETWEEN 0 AND $3::bigint RETURNING CAST(coin AS TEXT) AS coin',[String(gift.coin),user.id,(9223372036854775807n-BigInt(gift.coin)).toString()]),'코인 보유량을 확인하세요. 쿠폰은 사용되지 않았습니다.');
     changed(await q("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,$2,$3,'COUPON') RETURNING user_id",[user.id,String(gift.coin),String(balance.coin)]),'코인 지급 기록 저장에 실패했습니다.');
     for(const item of gift.items){
      const inventory=changed(await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
       VALUES($1,$2,$3,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE
       SET quantity=cnine_user_inventory.quantity+EXCLUDED.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+EXCLUDED.unseen_quantity,updated_at=CURRENT_TIMESTAMP
       WHERE cnine_user_inventory.quantity BETWEEN 0 AND $4 AND cnine_user_inventory.unseen_quantity BETWEEN 0 AND $4 RETURNING quantity`,
       [user.id,item.code,item.amount,Number.MAX_SAFE_INTEGER-item.amount]),'보상 보유 수량을 확인하세요. 쿠폰은 사용되지 않았습니다.');
      changed(await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'COUPON','COUPON',$5) RETURNING user_id",[user.id,item.code,item.amount,inventory.quantity,String(current.id)]),'아이템 지급 기록 저장에 실패했습니다.');
     }
     changed(await q('UPDATE coupons SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_active=1 AND deleted_at IS NULL AND used_count<max_uses RETURNING id',[current.id]),'쿠폰 사용 한도가 모두 소진되었거나 쿠폰이 중지되었습니다.');
     changed(await q('INSERT INTO coupon_redemptions(coupon_id,user_id,reward_coin,reward_type,reward_amount,operation_key) VALUES($1,$2,$3,$4,1,$5) RETURNING user_id',[current.id,user.id,String(gift.coin),gift.type,operationKey]),'쿠폰 사용 기록 저장에 실패했습니다.');
    }
    await q('COMMIT');
    return {ok:true,replayed,rewardType:gift.type,rewardAmount:1,rewardCoin:gift.coin,rewardLabel:gift.label,
     rewards:[{type:'COIN',amount:gift.coin},...gift.items.map(item=>({type:item.code,amount:item.amount}))],
     message:gift.message};
   }catch(error){try{await q('ROLLBACK');}catch{}throw error;}
  });
  const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  return deps.json({...result,user:await deps.profile(env,fresh)});
 }catch(error){if(error instanceof GiftCouponError)return deps.json({error:error.message},error.status);throw error;}
}
