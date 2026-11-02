import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const OP='ops:tmoney-master-star-10b:20261103:v1',db=connect(),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const target={userId:'5147',nickname:'T-Money™',status:'ACTIVE',role:'USER',identityHash:'35fe97106d5fff7ffeeb25a7c64196327dedda8f907ffd336af1f0baa5d75fed'};
db.connectionParameters.application_name='tmoney-master-star-10b-20261103-preflight';
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const users=await q('SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=5147 OR nickname=$1 ORDER BY id',[target.nickname]);assert.equal(users.length,1);
 const user=users[0];assert.equal(user.id,target.userId);for(const k of ['nickname','role','status'])assert.equal(user[k],target[k]);
 const identities=await q('SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=5147');assert.equal(identities.length,1);assert.equal(hash({provider:identities[0].provider,providerUserId:identities[0].provider_user_id}),target.identityHash);
 const inventory=await q("SELECT user_id::text,item_code,quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE user_id=5147 AND item_code='MASTER_STAR'");assert(inventory.length<=1);
 const item=await q("SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR'");assert.equal(item.length,1);assert.equal(item[0].name,'마스터의 별');assert.equal(Number(item[0].is_active),1);
 for(const field of ['quantity','unseen_quantity']){const value=BigInt(inventory[0]?.[field]??0);assert(value>=0n&&value+10000000000n<=BigInt(Number.MAX_SAFE_INTEGER));}
 const receipts=await q("SELECT key FROM app_meta WHERE key=$1 OR key LIKE 'ops:tmoney-master-star-10b:%'",[OP]);assert.equal(receipts.length,0);
 const logFloor=(await q("SELECT (SELECT COALESCE(MAX(id),0)::text FROM inventory_logs) inventory,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) audit"))[0];
 const recentStars=await q("SELECT id::text,change_amount::text,balance_after::text,reason,reference_type,reference_id,created_at FROM inventory_logs WHERE user_id=5147 AND item_code='MASTER_STAR' AND id>$1::bigint ORDER BY id DESC LIMIT 10",[String(BigInt(logFloor.inventory)>50000n?BigInt(logFloor.inventory)-50000n:0n)]);
 const triggers=await q("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,pg_get_functiondef(t.tgfoid) function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('cnine_user_inventory','inventory_logs','admin_logs','app_meta') ORDER BY c.relname,t.tgname");
 const columns=await q("SELECT table_name,column_name,data_type,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('cnine_user_inventory','inventory_logs') ORDER BY table_name,ordinal_position");
 const plan={operationKey:OP,itemCode:'MASTER_STAR',delivery:'DIRECT',sendMessages:false,amount:'10000000000',recipientCount:1,recipients:[target],logFloor,authorization:'T-Money™ 계정에 마스터의별 100억 넣어'};
 const report={checkedAt:new Date().toISOString(),readOnly:true,user:{...user,identityHash:target.identityHash},inventory,item,proposedAfter:String(BigInt(inventory[0]?.quantity??0)+10000000000n),recentStars,triggers,columns,operationKey:OP,priorReceipt:false,planHash:hash(plan)};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await fs.writeFile(new URL('./plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({user:target.nickname,id:target.userId,before:inventory[0]?.quantity??'0',after:report.proposedAfter,planHash:report.planHash,triggers:triggers.map(t=>({table:t.relname,name:t.tgname,definition:t.definition}))}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}
