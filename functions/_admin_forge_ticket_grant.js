import {FORGE_REPAIR_ITEM,ensureForgeRepairCatalog} from './_forge_repair_catalog.js';
import {FORGE_PROTECTION_ITEM,ensureForgeProtectionCatalog} from './_forge_protection_catalog.js';
import {runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

const items=new Map([FORGE_REPAIR_ITEM,FORGE_PROTECTION_ITEM].map(item=>[item.code,item]));
export const isForgeTicketGrant=code=>items.has(code);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

// USER_MANAGE and OWNER-target protection are checked by the existing route.
// The caller holds the target account's shared mutation lock.
export async function grantForgeTickets(env,admin,{userId,itemCode,amount,reason='',requestId}){
 const item=items.get(itemCode);
 if(!item||!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(amount)||amount<1||amount>9999)
  fail('지급할 계정·아이템과 수량(1~9,999장)을 확인하세요.');
 const memo=String(reason||'').trim().slice(0,100)||`관리자 ${item.name} 지급`;
 await (itemCode===FORGE_REPAIR_ITEM.code?ensureForgeRepairCatalog(env):ensureForgeProtectionCatalog(env));
 const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
 const result=await runJointOperation(env,{id:userId},{requestId,kind:'ADMIN_FORGE_TICKET_GRANT',
  input:{adminId:admin.id,itemCode,amount,reason:memo},
  prepare:async()=>{
   const active=await p('SELECT code FROM inventory_items WHERE code=? AND is_active=1',itemCode).first();
   if(!active)fail('현재 지급할 수 없는 아이템입니다.');
   return {adminId:admin.id,itemCode,amount,reason:memo};
  },
  statements:async plan=>{
   const token=crypto.randomUUID();
   return [
    jointGuard(DB,token,`EXISTS(SELECT 1 FROM users WHERE id=?) AND NOT EXISTS(
     SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=?
     AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))`,
     [userId,userId,plan.itemCode,Number.MAX_SAFE_INTEGER-plan.amount,Number.MAX_SAFE_INTEGER-plan.amount]),
    ...jointInventoryChange(DB,userId,plan.itemCode,plan.amount,plan.reason,requestId),
    p(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
     VALUES(?,'INVENTORY','USER',?,NULL,?)`,plan.adminId,String(userId),
     JSON.stringify({requestId,itemCode:plan.itemCode,itemName:item.name,amount:plan.amount,reason:plan.reason})),
    jointGuardEnd(DB,token)
   ];
  }
 });
 const inventory=await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',userId,itemCode).first();
 return {ok:true,requestId,replayed:result.replayed,itemCode,itemName:item.name,amount:result.plan.amount,balance:Number(inventory?.quantity||0)};
}
