import assert from 'node:assert/strict';
import {RETIRED_HYPER_TICKET as ITEM,withoutHyperTickets} from '../../functions/_hyper_ticket_retirement.js';
export const OP='ops:hyper-ticket-retirement:20261117:v1';
export const POLICY='legion_hunt_settings_v1';
export const CONSTRAINTS=['cnine_inventory_hyper_ticket_retired_v1','inventory_catalog_hyper_ticket_retired_v1'];
const rows=async(db,sql,args=[])=> (await db.query(sql,args)).rows;
export async function retirementSnapshot(db,{lock=false}={}){
 const suffix=lock?' FOR UPDATE':'';
 return {
  item:await rows(db,'SELECT * FROM inventory_items WHERE code=$1'+suffix,[ITEM]),
  inventory:await rows(db,'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE item_code=$1 ORDER BY cnine_user_inventory.user_id'+suffix,[ITEM]),
  policy:await rows(db,'SELECT key,value,updated_at FROM app_meta WHERE key=$1'+suffix,[POLICY])
 };
}
// The caller owns BEGIN/COMMIT and account leases; rollback also removes DDL.
// Keeping inactive catalog/zero balances preserves acquisition history and FKs.
export async function retireHyperTickets(db,{backup,expectedUserIds,failAfterInventory=false}={}){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const prior=await rows(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
 if(prior.length)return {...JSON.parse(prior[0].value),replayed:true};
 assert.equal(typeof backup,'function');
 assert.equal((await rows(db,"SELECT id FROM users WHERE id=1 AND status='ACTIVE' AND role='OWNER'")).length,1);
 const before=await retirementSnapshot(db,{lock:true});assert.equal(before.item.length,1);assert.equal(before.policy.length,1);
 const ids=before.inventory.map(r=>r.user_id);if(expectedUserIds)assert.deepEqual(ids,expectedUserIds);
 assert(before.inventory.every(r=>BigInt(r.quantity)>=0n&&BigInt(r.unseen_quantity)>=0n));
 const current=JSON.parse(before.policy[0].value),items=withoutHyperTickets(current.items);
 const stamp=(await rows(db,"SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') at,to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') kst"))[0];
 const next=items.length===current.items.length?current:{...current,revision:current.revision+1,items,updatedBy:1,updatedAt:stamp.at};
 await backup({operationKey:OP,at:stamp.at,before,policyAfter:next});
 await db.query('UPDATE inventory_items SET is_active=0,updated_at=$2 WHERE code=$1',[ITEM,stamp.at]);
 if(next!==current)assert.equal((await db.query('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4',[JSON.stringify(next),stamp.at,POLICY,before.policy[0].value])).rowCount,1);
 const changed=await rows(db,`WITH previous AS MATERIALIZED (SELECT user_id,quantity FROM cnine_user_inventory WHERE item_code=$1 AND (quantity<>0 OR unseen_quantity<>0)),
 updated AS (UPDATE cnine_user_inventory i SET quantity=0,unseen_quantity=0,updated_at=$2 FROM previous p WHERE i.user_id=p.user_id AND i.item_code=$1 RETURNING i.user_id)
 INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
 SELECT p.user_id,$1,-p.quantity,0,'하이퍼버닝 발동권 삭제 · 전체 회수','ITEM_RETIREMENT',$3,1 FROM previous p JOIN updated u ON u.user_id=p.user_id WHERE p.quantity>0 RETURNING id::text,user_id::text,change_amount::text`,[ITEM,stamp.at,OP]);
 if(failAfterInventory)throw Error('INJECTED_AFTER_INVENTORY');
 // No future source (including a stale process or manual grant) can reintroduce it.
 await db.query(`ALTER TABLE cnine_user_inventory ADD CONSTRAINT ${CONSTRAINTS[0]} CHECK (item_code<>'${ITEM}' OR (quantity=0 AND unseen_quantity=0)) NOT VALID`);
 await db.query(`ALTER TABLE inventory_items ADD CONSTRAINT ${CONSTRAINTS[1]} CHECK (code<>'${ITEM}' OR is_active=0) NOT VALID`);
 await db.query(`ALTER TABLE cnine_user_inventory VALIDATE CONSTRAINT ${CONSTRAINTS[0]}`);
 await db.query(`ALTER TABLE inventory_items VALIDATE CONSTRAINT ${CONSTRAINTS[1]}`);
 const positive=before.inventory.filter(r=>BigInt(r.quantity)>0n),total=positive.reduce((n,r)=>n+BigInt(r.quantity),0n).toString();
 assert.equal(changed.length,positive.length);
 const result={operationKey:OP,at:stamp.at,kst:stamp.kst,itemCode:ITEM,inventoryRows:before.inventory.length,accounts:positive.length,quantity:total,dropEntriesRemoved:current.items.length-items.length,policyRevisionBefore:current.revision,policyRevisionAfter:next.revision,constraints:CONSTRAINTS,ledger:changed,users:positive.map(r=>({userId:r.user_id,before:r.quantity,after:'0'})),messagesSent:0};
 const audit=(await rows(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'HYPER_TICKET_RETIREMENT','INVENTORY_ITEM',$1,$2,$3) RETURNING id::text`,[ITEM,JSON.stringify(before),JSON.stringify(result)]))[0];result.auditId=audit.id;
 await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(result),stamp.at]);
 const leftovers=await rows(db,'SELECT user_id FROM cnine_user_inventory WHERE item_code=$1 AND (quantity<>0 OR unseen_quantity<>0)',[ITEM]);assert.equal(leftovers.length,0);
 return result;
}
