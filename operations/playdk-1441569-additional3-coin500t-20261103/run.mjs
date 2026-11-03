import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {OP,IDS,HASH,PLAN,snapshot,receipt,artifacts,grant,verify,validate} from './grant.mjs';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {accountLocks} from './locks.mjs';
const mode=process.argv[2],directory=path.dirname(fileURLToPath(import.meta.url)),out=path.join(directory,'evidence');
assert(['dry-run','apply','verify','replay'].includes(mode));validate();await fs.mkdir(out,{recursive:true});
await assert.rejects(fs.access(path.join(out,mode+'.json')),/ENOENT/,'Existing evidence must be reconciled before rerun');
const digest=createHash('sha256');
for(const file of ['run.mjs','grant.mjs','grant.test.mjs','plan.json','source.json','preflight.mjs','locks.mjs','lock-worker.mjs','wrangler.jsonc','../rap-contest-rewards-20261027/preflight.mjs'])digest.update((await fs.readFile(path.join(directory,file),'utf8')).replace(/\r\n/g,'\n'));
const sourceSha256=digest.digest('hex'),db=connect();
let lease,report,failed=false,committed=false,selectOnlyQueries=0;
const save=(name,value)=>fs.writeFile(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const full=async()=>({state:await snapshot(db),artifacts:await artifacts(db)});
const readonly={query:(sql,args)=>{assert.match(sql,/^SELECT\b/i);assert(!/FOR UPDATE|FOR SHARE|pg_advisory/i.test(sql));selectOnlyQueries++;return db.query(sql,args);}};
const writes=new Set();
const checked={query:(sql,args)=>{
 lease?.check();const m=sql.match(/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)/i);
 if(m){assert(['users','coin_logs','admin_logs','app_meta'].includes(m[1]));writes.add(m[1]);}
 else assert.match(sql,/^SELECT\b/i);
 return db.query(sql,args);
}};
const transactionWrites=async()=>{
 const rows=(await db.query("SELECT relname,n_tup_ins::text,n_tup_upd::text,n_tup_del::text FROM pg_stat_xact_user_tables WHERE (n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0) AND relname<>ALL($1::text[])",[['users','coin_logs','admin_logs','app_meta','account_sync_versions_v1']])).rows;
 assert.deepEqual(rows,[],'Unexpected write outside coin grant and synchronization');
};
try{
 db.connectionParameters.application_name='playdk-1441569-additional3-coin500t-'+mode;await db.connect();
 if(['verify','replay'].includes(mode)){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='25s'");
  assert.equal((await db.query("SELECT current_setting('transaction_read_only') mode")).rows[0].mode,'on');
  const result=mode==='replay'?await grant(readonly):{verification:await verify(readonly),receipt:await receipt(readonly)};
  await transactionWrites();assert.equal(writes.size,0);await db.query('ROLLBACK');
  report={mode,sourceSha256,planHash:HASH,verification:result.verification,receipt:result.receipt,independentReadOnlyConnection:true,noWriteReplayVerified:mode==='replay',additionalWrites:0,selectOnlyQueries,checkedAt:new Date().toISOString()};
 }else{
  const tests=JSON.parse(await fs.readFile(path.join(out,'tests.json'),'utf8'));assert.equal(tests.exitCode,0);assert.equal(tests.passed,5);assert.equal(tests.failed,0);
  assert.equal(tests.grantSha256,createHash('sha256').update(await fs.readFile(path.join(directory,'grant.mjs'))).digest('hex'));
  if(mode==='apply'){
   const dry=JSON.parse(await fs.readFile(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);assert.equal(dry.planHash,HASH);
   for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased','onlyExpectedWrites'])assert.equal(dry[key],true,key);
  }
  assert.equal(await receipt(db),null,'Operation already completed; use SELECT-only verification');
  lease=await accountLocks(db,IDS,OP);
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='25s'");
  assert.equal((await db.query('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS])).rows.length,IDS.length);
  assert.equal((await db.query('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).rows.length,IDS.length);
  const before=await full(),options={leaseToken:lease.token,lockDeadline:lease.lockDeadline};assert.equal(before.artifacts.receipt,null);
  await db.query('SAVEPOINT original_state');
  if(mode==='dry-run'){
   await assert.rejects(grant(checked,'wrong',options));await db.query('SAVEPOINT injected');
   await assert.rejects(grant({query:(sql,args)=>sql.startsWith('INSERT INTO app_meta(')?db.query('SELECT 1/0'):checked.query(sql,args)},HASH,options),/division by zero/);
   await db.query('ROLLBACK TO SAVEPOINT injected');assert.deepEqual(await full(),before);
   console.log(JSON.stringify({stage:'FAILURE_ROLLBACK_VERIFIED',recipients:IDS.length}));
  }
  const result=await grant(checked,HASH,options);assert.equal(result.replayed,false);
  const replay=await grant(readonly);assert(replay.replayed);assert.deepEqual(replay.receipt,result.receipt);
  const after=await full();await transactionWrites();assert.deepEqual([...writes].sort(),['users','coin_logs','admin_logs','app_meta'].sort());
  await lease.assertOwned();
  if(mode==='dry-run'){
   await db.query('ROLLBACK TO SAVEPOINT original_state');assert.deepEqual(await full(),before);await db.query('ROLLBACK');
   await db.query('BEGIN READ ONLY');const empty=await artifacts(db);assert.deepEqual(empty,{receipt:null,coins:[],audits:[]});await db.query('ROLLBACK');
   report={mode,sourceSha256,planHash:HASH,verification:result.verification,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true,onlyExpectedWrites:true,selectOnlyQueries};
  }else{
   await save('commit-candidate',{sourceSha256,planHash:HASH,before,after,receipt:result.receipt});
   await lease.assertOwned();await db.query('COMMIT');committed=true;
   await save('commit-confirmed',{operationKey:OP,auditId:result.receipt.auditId,completedAt:result.receipt.completedAt,sourceSha256,planHash:HASH});
   report={mode,sourceSha256,planHash:HASH,...result,noWriteReplayVerified:true,onlyExpectedWrites:true,selectOnlyQueries};
   console.log(JSON.stringify({stage:'COMMITTED',recipients:IDS.length,totalAmount:PLAN.totalAmount,auditId:result.receipt.auditId}));
  }
 }
}catch(e){
 failed=true;await db.query('ROLLBACK').catch(()=>{});await save('failure-'+mode+'-'+Date.now(),{mode,committed,error:safe(e),checkedAt:new Date().toISOString()});
 console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,5).join('\n'));process.exitCode=1;
}finally{
 try{if(lease){await lease.release();if(report)report.leasesReleased=true;}}
 catch(e){failed=true;console.error(safe(e));process.exitCode=1;}
 await db.end().catch(()=>{});
}
if(report&&!failed){await save(mode,report);console.log(JSON.stringify({...report,receipt:undefined,verification:{...report.verification,grants:undefined}}));}
