import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {FORGE_REPAIR_ITEM,ensureForgeRepairCatalog} from './_forge_repair_catalog.js';
import {ensureBattleSuitCoreCatalog} from './_battle_suit_materials.js';
import {REVERSECALL_STREAMER_GIFT,REVERSECALL_STREAMER_GIFT_REWARDS} from '../shared/reversecall-streamer-gift-v1.mjs';
export {REVERSECALL_STREAMER_GIFT};

export const REVERSECALL_STREAMER_GIFT_CATALOG_KEY='reversecall_streamer_gift_catalog_20261021_v1';
const MAX=Number.MAX_SAFE_INTEGER;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};

export async function ensureReversecallStreamerGiftCatalog(env){
  if(readRuntimeData(env,REVERSECALL_STREAMER_GIFT_CATALOG_KEY))return;
  await ensureForgeRepairCatalog(env);
  await ensureBattleSuitCoreCatalog(env);
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(REVERSECALL_STREAMER_GIFT_CATALOG_KEY).first();
  if(marker?.value!=='1'){
    const gift=REVERSECALL_STREAMER_GIFT;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
        VALUES(?,?,'REVERSECALL STREAMER GIFT',?,'GIFT_BOX','SPECIAL',?,43,1) ON CONFLICT(code) DO NOTHING`)
        .bind(gift.code,gift.name,gift.description,gift.image),
      env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(REVERSECALL_STREAMER_GIFT_CATALOG_KEY)
    ]);
  }
  cacheRuntimeData(env,REVERSECALL_STREAMER_GIFT_CATALOG_KEY,true,1800000);
}

export async function openReversecallStreamerGift(env,user,{requestId,count=1}){
  if(count!==1)fail('리버스콜 스트리머 선물은 한 번에 1개씩 개봉할 수 있습니다.',400);
  await ensureReversecallStreamerGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),gift=REVERSECALL_STREAMER_GIFT;
  const result=await runJointOperation(env,user,{requestId,kind:'REVERSECALL_STREAMER_GIFT_OPEN',input:{itemCode:gift.code,count:1},
    prepare:async()=>{
      const owned=await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,gift.code).first();
      if(Number(owned?.quantity||0)<1)fail('보유한 리버스콜 스트리머 선물이 없습니다.');
      return {itemCode:gift.code,count:1,...REVERSECALL_STREAMER_GIFT_REWARDS};
    },
    statements:async plan=>{
      const token=crypto.randomUUID();
      return [
        jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)
          AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND
            ((item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))
            OR (item_code='SUIT_CORE_6' AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))))`,
          [user.id,MAX-plan.coin,user.id,FORGE_REPAIR_ITEM.code,MAX-plan.repairCoupon,MAX-plan.repairCoupon,MAX-plan.suitCore6,MAX-plan.suitCore6]),
        ...jointInventoryChange(DB,user.id,gift.code,-1,'REVERSECALL_STREAMER_GIFT_OPEN',requestId),
        ...jointInventoryChange(DB,user.id,FORGE_REPAIR_ITEM.code,plan.repairCoupon,'REVERSECALL_STREAMER_GIFT_REWARD',requestId),
        ...jointInventoryChange(DB,user.id,'SUIT_CORE_6',plan.suitCore6,'REVERSECALL_STREAMER_GIFT_REWARD',requestId),
        p('UPDATE users SET coin=coin+? WHERE id=?',plan.coin,user.id),
        p(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
          SELECT id,?,coin,? FROM users WHERE id=?`,plan.coin,`REVERSECALL_STREAMER_GIFT:${requestId}`,user.id),
        jointGuardEnd(DB,token)
      ];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:gift.code,count:1,
    rewards:{coin:result.plan.coin,repairCoupon:result.plan.repairCoupon,suitCore6:result.plan.suitCore6}};
}

// The existing OWNER user-management route performs permission checks and holds
// the target user's mutation lock before calling this transaction.
export async function grantReversecallStreamerGift(env,admin,{userId,amount,reason='',requestId}){
  if(!Number.isSafeInteger(userId)||userId<1||!Number.isInteger(amount)||amount<1||amount>9999)fail('지급할 계정과 수량(1~9,999개)을 확인하세요.',400);
  const memo=String(reason||'관리자 리버스콜 스트리머 선물 지급').trim().slice(0,100);
  await ensureReversecallStreamerGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),gift=REVERSECALL_STREAMER_GIFT;
  const result=await runJointOperation(env,{id:userId},{requestId,kind:'REVERSECALL_STREAMER_GIFT_GRANT',
    input:{adminId:admin.id,amount,reason:memo},prepare:async()=>({amount,reason:memo,adminId:admin.id}),
    statements:async plan=>{
      const token=crypto.randomUUID();
      return [
        jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=?)
          AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=?
            AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))`,
          [userId,userId,gift.code,MAX-plan.amount,MAX-plan.amount]),
        ...jointInventoryChange(DB,userId,gift.code,plan.amount,plan.reason,requestId),
        p(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
          VALUES(?,'REVERSECALL_STREAMER_GIFT_GRANT','USER',?,NULL,?)`,plan.adminId,String(userId),JSON.stringify({requestId,itemCode:gift.code,amount:plan.amount,reason:plan.reason})),
        jointGuardEnd(DB,token)
      ];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:gift.code,amount:result.plan.amount};
}
