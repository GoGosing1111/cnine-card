import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),parse=v=>typeof v==='string'?JSON.parse(v):v,one=rows=>(assert.equal(rows.length,1),rows[0]);
const db=connect(),ids=plan.recipients.map(t=>t.userId),op=plan.operationKey,code='CNINE_STREAMER_BOX';
try{
 db.connectionParameters.application_name='cnine-streamer-box-independent-readonly';await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='25s'");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;assert.equal(one(await q("SELECT current_setting('transaction_read_only') mode")).mode,'on');
 const r=parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[op])).value);assert.equal(r.status,'COMPLETED');assert.equal(r.planHash,hash(plan));assert.deepEqual(r.plan,plan);assert.equal(r.grants.length,37);assert.equal(r.totalBoxes,222);
 const logs=await q('SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reference_type,reference_id,admin_id::text,reason,created_at FROM inventory_logs WHERE id>$1::bigint AND reference_id=$2 ORDER BY id',[plan.logFloor.inventory,op]);
 assert.equal(logs.length,37);assert.equal(new Set(logs.map(l=>l.user_id)).size,37);assert.equal(logs.reduce((n,l)=>n+Number(l.change_amount),0),222);
 const audits=await q('SELECT id::text,admin_id::text,action_type,target_id,after_data,created_at FROM admin_logs WHERE id>$1::bigint AND target_id=$2',[plan.logFloor.audit,op]),audit=one(audits);assert.equal(audit.id,r.auditId);assert.equal(audit.action_type,'OPS_CNINE_STREAMER_BOX_NAMED_20261103');assert.equal(audit.admin_id,'1');const {auditId,...body}=r;assert.deepEqual(parse(audit.after_data),body);
 const users=await q('SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[ids]);assert.equal(users.length,37);
 const inventory=await q('SELECT user_id::text,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[ids,code]);assert.equal(inventory.length,37);
 const minLog=logs.reduce((min,l)=>BigInt(l.id)<min?BigInt(l.id):min,BigInt(logs[0].id)).toString();
 const later=await q('SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,created_at FROM inventory_logs WHERE id>$1::bigint AND user_id=ANY($2::bigint[]) AND item_code=$3 AND reference_id IS DISTINCT FROM $4 ORDER BY id',[minLog,ids,code,op]);
 const sync=await q('SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);assert.equal(sync.length,37);
 const recipients=plan.recipients.map(t=>{
  const g=one(r.grants.filter(g=>g.userId===t.userId)),log=one(logs.filter(l=>l.user_id===t.userId)),u=one(users.filter(u=>u.id===t.userId)),current=one(inventory.filter(i=>i.user_id===t.userId));
  assert.equal(u.nickname,t.nickname);assert.equal(u.status,'ACTIVE');assert.equal(hash({provider:u.provider,providerId:u.provider_user_id}),t.identityHash);assert.equal(g.amount,t.amount);assert.equal(g.nickname,t.nickname);assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(t.amount));assert.equal(BigInt(g.unseenAfter)-BigInt(g.unseenBefore),BigInt(t.amount));
  assert.equal(log.id,g.logId);assert.equal(log.item_code,code);assert.equal(log.change_amount,String(t.amount));assert.equal(log.balance_after,g.after);assert.equal(log.reference_type,audit.action_type);assert.equal(log.admin_id,'1');assert.equal(log.created_at,r.completedAt);
  const subsequent=later.filter(l=>l.user_id===t.userId&&BigInt(l.id)>BigInt(g.logId)),delta=subsequent.reduce((n,l)=>n+BigInt(l.change_amount),0n);assert.equal(BigInt(current.quantity),BigInt(g.after)+delta,'Current quantity must reconcile with subsequent usage');
  const beforeSync=one(r.syncBefore.filter(s=>s.user_id===t.userId)),afterSync=one(r.syncAfter.filter(s=>s.user_id===t.userId)),nowSync=one(sync.filter(s=>s.user_id===t.userId));assert.equal(BigInt(afterSync.revision),BigInt(beforeSync.revision)+1n);assert.equal(BigInt(afterSync.domains.inventory),BigInt(afterSync.revision));assert(BigInt(nowSync.domains.inventory)>=BigInt(afterSync.domains.inventory));
  return {inputNickname:t.inputNickname,nickname:t.nickname,userId:t.userId,marker:t.marker,amount:t.amount,before:g.before,after:g.after,logId:g.logId,currentQuantity:current.quantity,subsequentLedgerEntries:subsequent.length,subsequentChange:delta.toString()};
 });
 assert.equal(one(recipients.filter(t=>t.inputNickname==='쟁이')).amount,7);for(const [amount,count] of [[7,23],[5,11],[2,3]])assert.equal(recipients.filter(t=>t.amount===amount).length,count);
 const locks=await q('SELECT user_id FROM user_mutation_locks_v1520 WHERE action_path=$1',[op]);assert.equal(locks.length,0);
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);
 const report={checkedAt:new Date().toISOString(),independentReadOnly:true,productionWrites:0,operationKey:op,itemCode:code,recipientCount:37,totalBoxes:222,auditId:r.auditId,inventoryLogs:37,missing:0,duplicates:0,operationLocksRemaining:0,inventorySyncVerified:37,recipients};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./evidence/independent.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,recipients:undefined}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,4).join('\n'));process.exitCode=1;}finally{await db.end().catch(()=>{});}
