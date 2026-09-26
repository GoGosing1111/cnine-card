import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const TOURNAMENT_GIFT=Object.freeze({
  code:'TOURNAMENT_GIFT_BOX',name:'대회 사은품',
  image:'assets/ui/packs/tournament-gift-box-v1.png',
  masterStar:2_000_000,coin:250_000_000_000,
  description:'개봉 시 마스터의 별 2,000,000개와 2,500억 코인을 모두 받습니다. 상자 1개당 확정 지급됩니다.'
});
export const TOURNAMENT_GIFT_CATALOG_KEY='tournament_gift_catalog_20260926';
const MAX=Number.MAX_SAFE_INTEGER;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};

// Independent of the old foundation marker. Never reset an operator's later OFF.
export async function ensureTournamentGiftCatalog(env){
  if(readRuntimeData(env,TOURNAMENT_GIFT_CATALOG_KEY))return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TOURNAMENT_GIFT_CATALOG_KEY).first();
  if(marker?.value!=='1')await env.DB.batch([
    env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
      VALUES(?,?,'TOURNAMENT GIFT',?,'GIFT_BOX','SPECIAL',?,38,1) ON CONFLICT(code) DO NOTHING`)
      .bind(TOURNAMENT_GIFT.code,TOURNAMENT_GIFT.name,TOURNAMENT_GIFT.description,TOURNAMENT_GIFT.image),
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(TOURNAMENT_GIFT_CATALOG_KEY)
  ]);
  cacheRuntimeData(env,TOURNAMENT_GIFT_CATALOG_KEY,true,1800000);
}

export async function openTournamentGift(env,user,{requestId,count=1}){
  if(count!==1)fail('대회 사은품은 한 번에 1개씩 개봉할 수 있습니다.',400);
  await ensureTournamentGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),gift=TOURNAMENT_GIFT;
  const result=await runJointOperation(env,user,{requestId,kind:'TOURNAMENT_GIFT_OPEN',input:{itemCode:gift.code,count:1},
    prepare:async()=>{
      const owned=await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,gift.code).first();
      if(Number(owned?.quantity||0)<1)fail('보유한 대회 사은품이 없습니다.');
      return {itemCode:gift.code,count:1,coin:gift.coin,masterStar:gift.masterStar};
    },
    statements:async plan=>{
      const token=crypto.randomUUID();
      return [
        jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)
          AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND (quantity>? OR unseen_quantity>?))`,
          [user.id,MAX-plan.coin,user.id,MAX-plan.masterStar,MAX-plan.masterStar]),
        ...jointInventoryChange(DB,user.id,gift.code,-1,'TOURNAMENT_GIFT_OPEN',requestId),
        ...jointInventoryChange(DB,user.id,'MASTER_STAR',plan.masterStar,'TOURNAMENT_GIFT_REWARD',requestId),
        p('UPDATE users SET coin=coin+? WHERE id=?',plan.coin,user.id),
        p(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
          SELECT id,?,coin,? FROM users WHERE id=?`,plan.coin,`TOURNAMENT_GIFT:${requestId}`,user.id),
        jointGuardEnd(DB,token)
      ];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:gift.code,count:1,
    rewards:{masterStar:result.plan.masterStar,coin:result.plan.coin}};
}

export async function grantTournamentGift(env,admin,{userId,amount,reason='',requestId}){
  if(!Number.isSafeInteger(userId)||userId<1||!Number.isInteger(amount)||amount<1||amount>9999)fail('지급할 계정과 수량(1~9,999개)을 확인하세요.',400);
  const memo=String(reason||'관리자 대회 사은품 지급').trim().slice(0,100);
  await ensureTournamentGiftCatalog(env);
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
  const result=await runJointOperation(env,{id:userId},{requestId,kind:'TOURNAMENT_GIFT_GRANT',
    input:{adminId:admin.id,amount,reason:memo},prepare:async()=>({amount,reason:memo,adminId:admin.id}),
    statements:async plan=>{
      const token=crypto.randomUUID();
      return [jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=?)
        AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND (quantity>? OR unseen_quantity>?))`,
        [userId,userId,TOURNAMENT_GIFT.code,MAX-plan.amount,MAX-plan.amount]),
        ...jointInventoryChange(DB,userId,TOURNAMENT_GIFT.code,plan.amount,plan.reason,requestId),
        p(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
          VALUES(?,'TOURNAMENT_GIFT_GRANT','USER',?,NULL,?)`,plan.adminId,String(userId),JSON.stringify({requestId,itemCode:TOURNAMENT_GIFT.code,amount:plan.amount,reason:plan.reason})),
        jointGuardEnd(DB,token)];
    }
  });
  return {ok:true,requestId,replayed:result.replayed,itemCode:TOURNAMENT_GIFT.code,amount:result.plan.amount};
}
