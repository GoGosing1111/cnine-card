import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {KEY,PLAN,HASH,IDS,send,verify} from './grant.mjs';
const mode=process.argv[2];assert(['dry-run','apply','verify','replay'].includes(mode));
assert(!existsSync(new URL('./'+mode+'.json',import.meta.url)),'Existing result must be inspected before rerunning');
const digest=createHash('sha256');
for(const file of ['common.mjs','grant.mjs','run.mjs','plan.json','claim-test-result.json','claim-source-verification.json','claim.test.mjs'])digest.update(readFileSync(new URL('./'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const sourceHash=digest.digest('hex');
const save=(name,v)=>writeFileSync(new URL('./'+name+'.json',import.meta.url),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const db=connect();let committed=false;let messageSyncChanged=0;
try{
 db.connectionParameters.application_name='support-package-buyer-service-20261102-'+mode;await db.connect();
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const empty=async()=>{
  assert.equal((await q('SELECT COUNT(*)::int n FROM user_messages WHERE campaign_key=$1',[KEY]))[0].n,0);
  assert.equal((await q('SELECT key FROM app_meta WHERE key=$1',[KEY])).length,0);
  assert.equal((await q('SELECT id FROM admin_logs WHERE target_id=$1',[KEY])).length,0);
 };
 const sync=async()=>q('SELECT * FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[IDS]);
 const writes=new Set();let selectOnlyQueries=0;
 const checked={query(sql,args){
  const match=sql.match(/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)/i);
  if(match){assert(['user_messages','user_message_rewards','admin_logs','app_meta'].includes(match[1]),'Unexpected write '+match[1]);writes.add(match[1]);}
  else assert(/^SELECT\b/.test(sql),'Only intended SELECT and writes are allowed');
  return db.query(sql,args);
 }};
 const readonly={query(sql,args){assert(/^SELECT\b/i.test(sql)&&!/FOR UPDATE|FOR SHARE|pg_advisory/i.test(sql),'Replay must only SELECT');selectOnlyQueries++;return db.query(sql,args);}};
 const noAssetWrites=async()=>{
  const rows=await q(`SELECT relname,n_tup_ins::text,n_tup_upd::text,n_tup_del::text FROM pg_stat_xact_user_tables
   WHERE (n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0) AND relname<>ALL($1::text[])`,[['user_messages','user_message_rewards','admin_logs','app_meta','account_sync_versions_v1']]);
  assert.deepEqual(rows,[],'Unexpected transactional writes');
 };
 const begin=async()=>{await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30s'");};
 let result,checks;
 if(mode==='dry-run'){
  await begin();await empty();
  await db.query('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS]);
  const before=await sync();
  await assert.rejects(send(checked,'0'.repeat(64)),/Inspected frozen plan hash required/);
  await db.query('SAVEPOINT injected_failure');
  const broken={query(sql,args){if(sql.includes('INSERT INTO user_message_rewards'))return checked.query('SELECT 1/0');return checked.query(sql,args);}};
  await assert.rejects(send(broken,HASH),/division by zero/);
  await db.query('ROLLBACK TO SAVEPOINT injected_failure');await empty();assert.deepEqual(await sync(),before);
  result=await send(checked,HASH);
  const after=await sync();messageSyncChanged=before.filter((r,i)=>JSON.stringify(r)!==JSON.stringify(after[i])).length;assert.equal(messageSyncChanged,IDS.length);
  const replay=await send(readonly);assert.equal(replay.replayed,true);assert.deepEqual(replay.verification,result.verification);
  await noAssetWrites();assert.deepEqual([...writes].sort(),['admin_logs','app_meta','user_message_rewards','user_messages'].sort());
  await db.query('ROLLBACK TO SAVEPOINT injected_failure');await empty();assert.deepEqual(await sync(),before);
  await db.query('ROLLBACK');await db.query('BEGIN READ ONLY');await empty();
  assert.equal((await q('SELECT COUNT(*)::int n FROM user_message_rewards WHERE id=ANY($1::bigint[])',[result.receipt.rewardIds]))[0].n,0);
  await db.query('ROLLBACK');checks={wrongPlanRejected:true,actualSqlFailureRolledBack:true,successRolledBack:true,messageSyncRolledBack:true,onlyMessageAuditReceiptAndSyncWrites:true,noWalletInventoryWrites:true,selectOnlyReplay:true,noDeliveryAfterRollback:true,allMessageSyncChanged:true};
 }else if(mode==='apply'){
  const dry=JSON.parse(readFileSync(new URL('./dry-run.json',import.meta.url),'utf8'));assert.equal(dry.planHash,HASH);assert.equal(dry.sourceHash,sourceHash);assert(Object.values(dry.checks).every(v=>v===true));
  const tests=JSON.parse(readFileSync(new URL('./claim-test-result.json',import.meta.url),'utf8'));assert.equal(tests.exitCode,0);assert.equal(tests.passed,3);assert.equal(tests.failed,0);
  await begin();
  assert.equal((await q('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS])).length,IDS.length);
  const before=await sync();result=await send(checked,HASH);assert.equal(result.replayed,false);
  const after=await sync();messageSyncChanged=before.filter((r,i)=>JSON.stringify(r)!==JSON.stringify(after[i])).length;assert.equal(messageSyncChanged,IDS.length);
  await noAssetWrites();await db.query('COMMIT');committed=true;save('receipt',result.receipt);checks=dry.checks;
 }else{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(mode==='replay')result=await send(readonly);
  else{const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);assert(saved);const receipt=JSON.parse(saved.value);result={receipt,replayed:true,verification:await verify(readonly,receipt)};}
  await noAssetWrites();assert.equal(writes.size,0);await db.query('ROLLBACK');checks={readOnlyTransaction:true,selectOnly:true,additionalWrites:0};
 }
 const report={operationKey:KEY,planHash:HASH,sourceHash,mode,status:mode==='dry-run'?'DRY_RUN_ROLLED_BACK':result.receipt.status,
  auditId:mode==='dry-run'?null:result.receipt.auditId,completedAt:mode==='dry-run'?null:result.receipt.completedAt,
  verification:result.verification,replayed:result.replayed,messageSyncChanged,checks,selectOnlyQueries,checkedAt:new Date().toISOString()};
 save(mode,report);console.log(JSON.stringify(report,null,2));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({error:safe(e),committed}));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,4).join('\n'));process.exitCode=1;}finally{await db.end().catch(()=>{});}
