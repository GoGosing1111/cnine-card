import {ensureEmperorEnergyCatalog} from './_emperor_energy.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {FORGE_REPAIR_ITEM,ensureForgeRepairCatalog} from './_forge_repair_catalog.js';

export const WORM_CONTEST_GIFT=Object.freeze({
  code:'WORM_CONTEST_GIFT_BOX',name:'지렁이대회 사은품',
  image:'assets/ui/packs/worm-contest-gift-box-v1.png',
  coin:500_000_000_000,masterStar:20_000_000,repairCoupon:1,emperorEnergy:20,
  description:'개봉 시 5,000억 코인, 마스터의 별 20,000,000개, 핑두 리페어권 1개, 엠퍼러 에너지 20개를 모두 받습니다. 상자 1개당 확정 지급됩니다.'
});
export const WORM_CONTEST_GIFT_CATALOG_KEY='worm_contest_gift_catalog_20261014_v1';
const MAX=Number.MAX_SAFE_INTEGER;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};

export async function ensureWormContestGiftCatalog(env){
  await ensureForgeRepairCatalog(env);
  await ensureEmperorEnergyCatalog(env);
  if(readRuntimeData(env,WORM_CONTEST_GIFT_CATALOG_KEY))return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WORM_CONTEST_GIFT_CATALOG_KEY).first();
  if(marker?.value!=='1')await env.DB.batch([
    env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
      VALUES(?,?,'WORM CONTEST GIFT',?,'GIFT_BOX','SPECIAL',?,42,1) ON CONFLICT(code) DO NOTHING`)
      .bind(WORM_CONTEST_GIFT.code,WORM_CONTEST_GIFT.name,WORM_CONTEST_GIFT.description,WORM_CONTEST_GIFT.image),
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(WORM_CONTEST_GIFT_CATALOG_KEY)
  ]);
  cacheRuntimeData(env,WORM_CONTEST_GIFT_CATALOG_KEY,true,1800000);
}

export async function openWormContestGift(env,user,{requestId,count=1}){
  if(count!==1)fail('지렁이대회 사은품은 한 번에 1개씩 개봉할 수 있습니다.',400);
  await ensureWormContestGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),gift=WORM_CONTEST_GIFT;
  const result=await runJointOperation(env,user,{requestId,kind:'WORM_CONTEST_GIFT_OPEN',input:{itemCode:gift.code,count:1},
    prepare:async()=>{
      const owned=await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,gift.code).first();
      if(Number(owned?.quantity||0)<1)fail('보유한 지렁이대회 사은품이 없습니다.');
      return {itemCode:gift.code,count:1,coin:gift.coin,masterStar:gift.masterStar,repairCoupon:gift.repairCoupon,emperorEnergy:gift.emperorEnergy};
    },
    statements:async plan=>{
      const token=crypto.randomUUID(),emperorEnergy=Number(plan.emperorEnergy||0);
      return [
        jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)
          AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND
            ((item_code='MASTER_STAR' AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))
            OR (item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))))`,
          [user.id,MAX-plan.coin,user.id,MAX-plan.masterStar,MAX-plan.masterStar,FORGE_REPAIR_ITEM.code,MAX-plan.repairCoupon,MAX-plan.repairCoupon]),
        ...jointInventoryChange(DB,user.id,gift.code,-1,'WORM_CONTEST_GIFT_OPEN',requestId),
        ...jointInventoryChange(DB,user.id,'MASTER_STAR',plan.masterStar,'WORM_CONTEST_GIFT_REWARD',requestId),
        ...jointInventoryChange(DB,user.id,FORGE_REPAIR_ITEM.code,plan.repairCoupon,'WORM_CONTEST_GIFT_REWARD',requestId),
        ...(emperorEnergy?[
          jointGuard(DB,token+'-energy',`NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='EMPEROR_ENERGY'
            AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))`,[user.id,MAX-emperorEnergy,MAX-emperorEnergy]),
          ...jointInventoryChange(DB,user.id,'EMPEROR_ENERGY',emperorEnergy,'WORM_CONTEST_GIFT_REWARD',requestId),
          jointGuardEnd(DB,token+'-energy')
        ]:[]),
        p('UPDATE users SET coin=coin+? WHERE id=?',plan.coin,user.id),
        p(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
          SELECT id,?,coin,? FROM users WHERE id=?`,plan.coin,`WORM_CONTEST_GIFT:${requestId}`,user.id),
        jointGuardEnd(DB,token)
      ];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:gift.code,count:1,
    rewards:{coin:result.plan.coin,masterStar:result.plan.masterStar,repairCoupon:result.plan.repairCoupon,emperorEnergy:Number(result.plan.emperorEnergy||0)}};
}

export async function grantWormContestGift(env,admin,{userId,amount,reason='',requestId}){
  if(!Number.isSafeInteger(userId)||userId<1||!Number.isInteger(amount)||amount<1||amount>9999)fail('지급할 계정과 수량(1~9,999개)을 확인하세요.',400);
  const memo=String(reason||'관리자 지렁이대회 사은품 지급').trim().slice(0,100);
  await ensureWormContestGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
  const result=await runJointOperation(env,{id:userId},{requestId,kind:'WORM_CONTEST_GIFT_GRANT',
    input:{adminId:admin.id,amount,reason:memo},prepare:async()=>({amount,reason:memo,adminId:admin.id}),
    statements:async plan=>{
      const token=crypto.randomUUID();
      return [jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=?)
        AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))`,
        [userId,userId,WORM_CONTEST_GIFT.code,MAX-plan.amount,MAX-plan.amount]),
        ...jointInventoryChange(DB,userId,WORM_CONTEST_GIFT.code,plan.amount,plan.reason,requestId),
        p(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
          VALUES(?,'WORM_CONTEST_GIFT_GRANT','USER',?,NULL,?)`,plan.adminId,String(userId),JSON.stringify({requestId,itemCode:WORM_CONTEST_GIFT.code,amount:plan.amount,reason:plan.reason})),
        jointGuardEnd(DB,token)];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:WORM_CONTEST_GIFT.code,amount:result.plan.amount};
}
