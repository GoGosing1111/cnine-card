import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {OP,IDS,HASH,PLAN,AMOUNT,verify,hash} from './grant.mjs';
import {__postgresCompatTest} from '../../output/revan-live-20261027/release-checkout/functions/_postgres_d1_compat.js';
import {readAccountSync} from '../../output/revan-live-20261027/release-checkout/functions/_account_sync.js';
const applied=JSON.parse(fs.readFileSync(new URL('proof/apply.json',import.meta.url),'utf8')),db=connect();
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const r=applied.receipt,g=r.grants[0];assert.equal(r.planHash,HASH);assert.equal(r.operationKey,OP);assert.equal(g.amount,AMOUNT);
 const verification=await verify(db,r);
 const users=(await db.query('SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1',[IDS[0]])).rows;assert.equal(users.length,1);
 const u=users[0],target=PLAN.recipients[0];assert.equal(u.nickname,target.nickname);assert.equal(u.status,'ACTIVE');assert.equal(hash({provider:u.provider,providerUserId:u.provider_user_id}),target.identityHash);
 const inventory=(await db.query("SELECT quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=$1 AND item_code='MASTER_STAR'",[IDS[0]])).rows;assert.equal(inventory.length,1);
 const changes=(await db.query("SELECT COALESCE(SUM(change_amount),0)::text total,COUNT(*)::int count FROM inventory_logs WHERE id>$1::bigint AND user_id=$2 AND item_code='MASTER_STAR'",[g.logId,IDS[0]])).rows[0];
 assert.equal(BigInt(inventory[0].quantity),BigInt(g.after)+BigInt(changes.total),'Current balance must reconcile with subsequent legitimate activity');
 const sync=await readAccountSync({DB:new __postgresCompatTest.PostgresD1Database(db)},Number(IDS[0]));
 assert(BigInt(sync.domains.inventory)>=BigInt(r.syncAfter[0].domains.inventory));
 const locks=(await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND action_path=$2',[IDS[0],OP])).rows;assert.equal(locks.length,0);
 const writes=(await db.query('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0')).rows;assert.equal(writes.length,0);
 await db.query('ROLLBACK');
 const report={checkedAt:new Date().toISOString(),independentReadOnly:true,verification,userId:u.id,nickname:u.nickname,masterStars:inventory[0].quantity,grantBefore:g.before,grantAfter:g.after,grantAmount:AMOUNT,subsequentLedgerEntries:changes.count,subsequentLedgerAmount:changes.total,sync,operationLocksRemaining:0,productionWrites:0};
 fs.writeFileSync(new URL('proof/independent.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}
