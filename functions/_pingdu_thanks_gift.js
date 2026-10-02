import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {FORGE_REPAIR_ITEM,ensureForgeRepairCatalog} from './_forge_repair_catalog.js';

export const PINGDU_THANKS_GIFT=Object.freeze({
  code:'PINGDU_THANKS_GIFT_BOX',name:'핑두의 감사 선물',
  image:'assets/ui/packs/pingdu-thanks-gift-box-v1.png',
  coin:300_000_000_000,masterStar:5_000_000,repairCoupon:1,mysticEnergy:1000,
  description:'개봉 시 3,000억 코인, 마스터의 별 5,000,000개, 핑두 리페어 쿠폰 1개, 미스틱 에너지 1,000개를 모두 받습니다. 상자 1개당 확정 지급됩니다.'
});
export const PINGDU_THANKS_GIFT_CATALOG_KEY='pingdu_thanks_gift_catalog_20261002_v1';
const MAX=Number.MAX_SAFE_INTEGER;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};

export async function ensurePingduThanksGiftCatalog(env){
  await ensureForgeRepairCatalog(env);
  if(readRuntimeData(env,PINGDU_THANKS_GIFT_CATALOG_KEY))return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(PINGDU_THANKS_GIFT_CATALOG_KEY).first();
  if(marker?.value!=='1')await env.DB.batch([
    env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
      VALUES(?,?,'PINGDU THANKS GIFT',?,'GIFT_BOX','SPECIAL',?,41,1) ON CONFLICT(code) DO NOTHING`)
      .bind(PINGDU_THANKS_GIFT.code,PINGDU_THANKS_GIFT.name,PINGDU_THANKS_GIFT.description,PINGDU_THANKS_GIFT.image),
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(PINGDU_THANKS_GIFT_CATALOG_KEY)
  ]);
  cacheRuntimeData(env,PINGDU_THANKS_GIFT_CATALOG_KEY,true,1800000);
}

export async function openPingduThanksGift(env,user,{requestId,count=1}){
  if(count!==1)fail('핑두의 감사 선물은 한 번에 1개씩 개봉할 수 있습니다.',400);
  await ensurePingduThanksGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),gift=PINGDU_THANKS_GIFT;
  const result=await runJointOperation(env,user,{requestId,kind:'PINGDU_THANKS_GIFT_OPEN',input:{itemCode:gift.code,count:1},
    prepare:async()=>{
      const owned=await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,gift.code).first();
      if(Number(owned?.quantity||0)<1)fail('보유한 핑두의 감사 선물이 없습니다.');
      return {itemCode:gift.code,count:1,coin:gift.coin,masterStar:gift.masterStar,repairCoupon:gift.repairCoupon,mysticEnergy:gift.mysticEnergy};
    },
    statements:async plan=>{
      const token=crypto.randomUUID(),mysticEnergy=Number(plan.mysticEnergy||0);
      return [
        jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)
          AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND
            ((item_code='MASTER_STAR' AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))
            OR (item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))))`,
          [user.id,MAX-plan.coin,user.id,MAX-plan.masterStar,MAX-plan.masterStar,FORGE_REPAIR_ITEM.code,MAX-plan.repairCoupon,MAX-plan.repairCoupon]),
        ...jointInventoryChange(DB,user.id,gift.code,-1,'PINGDU_THANKS_GIFT_OPEN',requestId),
        ...jointInventoryChange(DB,user.id,'MASTER_STAR',plan.masterStar,'PINGDU_THANKS_GIFT_REWARD',requestId),
        ...jointInventoryChange(DB,user.id,FORGE_REPAIR_ITEM.code,plan.repairCoupon,'PINGDU_THANKS_GIFT_REWARD',requestId),
        ...(mysticEnergy?[
          jointGuard(DB,token+'-energy',`NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='STARLIGHT_ARMOR_CORE'
            AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))`,[user.id,MAX-mysticEnergy,MAX-mysticEnergy]),
          ...jointInventoryChange(DB,user.id,'STARLIGHT_ARMOR_CORE',mysticEnergy,'PINGDU_THANKS_GIFT_REWARD',requestId),
          jointGuardEnd(DB,token+'-energy')
        ]:[]),
        p('UPDATE users SET coin=coin+? WHERE id=?',plan.coin,user.id),
        p(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
          SELECT id,?,coin,? FROM users WHERE id=?`,plan.coin,`PINGDU_THANKS_GIFT:${requestId}`,user.id),
        jointGuardEnd(DB,token)
      ];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:gift.code,count:1,
    rewards:{coin:result.plan.coin,masterStar:result.plan.masterStar,repairCoupon:result.plan.repairCoupon,mysticEnergy:Number(result.plan.mysticEnergy||0)}};
}

export async function grantPingduThanksGift(env,admin,{userId,amount,reason='',requestId}){
  if(!Number.isSafeInteger(userId)||userId<1||!Number.isInteger(amount)||amount<1||amount>9999)fail('지급할 계정과 수량(1~9,999개)을 확인하세요.',400);
  const memo=String(reason||'관리자 핑두의 감사 선물 지급').trim().slice(0,100);
  await ensurePingduThanksGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
  const result=await runJointOperation(env,{id:userId},{requestId,kind:'PINGDU_THANKS_GIFT_GRANT',
    input:{adminId:admin.id,amount,reason:memo},prepare:async()=>({amount,reason:memo,adminId:admin.id}),
    statements:async plan=>{
      const token=crypto.randomUUID();
      return [jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=?)
        AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))`,
        [userId,userId,PINGDU_THANKS_GIFT.code,MAX-plan.amount,MAX-plan.amount]),
        ...jointInventoryChange(DB,userId,PINGDU_THANKS_GIFT.code,plan.amount,plan.reason,requestId),
        p(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
          VALUES(?,'PINGDU_THANKS_GIFT_GRANT','USER',?,NULL,?)`,plan.adminId,String(userId),JSON.stringify({requestId,itemCode:PINGDU_THANKS_GIFT.code,amount:plan.amount,reason:plan.reason})),
        jointGuardEnd(DB,token)];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:PINGDU_THANKS_GIFT.code,amount:result.plan.amount};
}
