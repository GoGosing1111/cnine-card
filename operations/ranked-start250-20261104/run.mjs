import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {OP,correct,fence,state,validate,hash,verify,readReceipt} from './correct.mjs';
const mode=process.argv[2];assert(['rehearse','apply','verify','replay'].includes(mode));
const plan=JSON.parse(await fs.readFile(new URL('./plan.json',import.meta.url),'utf8'));validate(plan);
const out=new URL('./evidence/',import.meta.url);await fs.mkdir(out,{recursive:true});
const save=(name,data)=>fs.writeFile(new URL(name+'.json',out),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
await assert.rejects(fs.access(new URL(mode+'.json',out)),/ENOENT/,'Reconcile existing evidence first');
const digest=createHash('sha256');for(const f of ['run.mjs','correct.mjs','correct.test.mjs','plan.json','runtime-sources.json'])digest.update(await fs.readFile(new URL(f,import.meta.url)));const sourceHash=digest.digest('hex');
const db=connect(),peer=['rehearse'].includes(mode)?connect():null;let committed=false,report,selectQueries=0;
const readonly={query:(sql,args)=>{assert.match(sql,/^SELECT\b/);assert(!/FOR UPDATE|FOR SHARE|pg_advisory/i.test(sql));selectQueries++;return db.query(sql,args);}};
const allowed=['pvp_profiles','ranked_reform_profile_archive_v1','admin_logs','app_meta'],writes=new Set();
const checked={query:(sql,args)=>{const m=sql.match(/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)/i);if(m){assert(allowed.includes(m[1]),'Unexpected write table');writes.add(m[1]);}else assert.match(sql,/^SELECT\b/);return db.query(sql,args);}};
const stats=async()=>{const rows=(await db.query("SELECT relname,n_tup_ins::text,n_tup_upd::text,n_tup_del::text FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0 ORDER BY relname")).rows;assert(rows.every(r=>[...allowed,'account_sync_versions_v1'].includes(r.relname)),'Unexpected transaction writes');return rows;};
try{
 db.connectionParameters.application_name='ranked-start250-'+mode;await db.connect();if(peer){peer.connectionParameters.application_name='ranked-start250-lock-proof';await peer.connect();}
 if(['verify','replay'].includes(mode)){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal((await db.query("SELECT current_setting('transaction_read_only') ro")).rows[0].ro,'on');
  const result=mode==='replay'?await correct(readonly,plan):await verify(readonly,plan);assert.deepEqual(await stats(),[]);await db.query('ROLLBACK');report={mode,sourceHash,planHash:hash(plan),verified:true,correctedCount:result.receipt.correctedCount,auditId:result.receipt.auditId,readOnly:true,selectOnlyQueries:selectQueries,additionalWrites:0,checkedAt:new Date().toISOString()};
 }else{
  const tests=JSON.parse(await fs.readFile(new URL('tests.json',out),'utf8'));assert.equal(tests.exitCode,0);assert.equal(tests.passed,5);assert.equal(tests.correctSha256,createHash('sha256').update(await fs.readFile(new URL('./correct.mjs',import.meta.url))).digest('hex'));
  if(mode==='apply'){const dry=JSON.parse(await fs.readFile(new URL('rehearse.json',out),'utf8'));assert.equal(dry.sourceHash,sourceHash);for(const key of ['failureRollback','normalRollback','concurrentFightBlocked','concurrentProfileWriterBlocked','concurrentSeasonLifecycleBlocked','selectOnlyReplay'])assert.equal(dry[key],true,key);}
  assert.equal(await readReceipt(db),null,'Already completed; use verify');await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='35s'");await fence(db,plan);
  if(peer){for(const sql of ["SELECT key FROM app_meta WHERE key='pvp_settings_v1' FOR SHARE NOWAIT",'LOCK TABLE pvp_profiles IN ROW EXCLUSIVE MODE NOWAIT','LOCK TABLE pvp_season_lifecycle_lock_v1671 IN ROW EXCLUSIVE MODE NOWAIT']){await peer.query('BEGIN');await assert.rejects(peer.query(sql),e=>e.code==='55P03');await peer.query('ROLLBACK');}console.log(JSON.stringify({stage:'CONCURRENT_WRITES_FENCED',scopes:['fight','profileCreation','seasonLifecycle']}));}
  const before=await state(db,plan);await db.query('SAVEPOINT original_state');
  if(mode==='rehearse'){
   await assert.rejects(correct({query:(sql,args)=>sql.startsWith('INSERT INTO app_meta(')?db.query('SELECT 1/0'):checked.query(sql,args)},plan),/division by zero/);
   await db.query('ROLLBACK TO SAVEPOINT original_state');assert.deepEqual(await state(db,plan),before);console.log(JSON.stringify({stage:'LATE_FAILURE_ROLLED_BACK'}));
  }
  const result=await correct(checked,plan);assert.equal(result.replayed,false);const replay=await correct(readonly,plan);assert(replay.replayed);assert.deepEqual(replay.receipt,result.receipt);assert.deepEqual([...writes].sort(),allowed.toSorted());
  const after=await state(db,plan),writeStats=await stats();
  if(mode==='rehearse'){
   await db.query('ROLLBACK TO SAVEPOINT original_state');assert.deepEqual(await state(db,plan),before);await db.query('ROLLBACK');assert.equal(await readReceipt(db),null);
   report={mode,sourceHash,planHash:hash(plan),correctedCount:result.receipt.correctedCount,failureRollback:true,normalRollback:true,concurrentFightBlocked:true,concurrentProfileWriterBlocked:true,concurrentSeasonLifecycleBlocked:true,selectOnlyReplay:true,writeStats,checkedAt:new Date().toISOString()};
  }else{
   await save('commit-candidate',{sourceHash,planHash:hash(plan),before,after,receipt:result.receipt});await db.query('COMMIT');committed=true;
   report={mode,sourceHash,planHash:hash(plan),receipt:result.receipt,correctedCount:result.receipt.correctedCount,auditId:result.receipt.auditId,committed:true,selectOnlyReplay:true,writeStats,checkedAt:new Date().toISOString()};
  }
 }
 await save(mode,report);console.log(JSON.stringify({...report,receipt:undefined}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});if(peer)await peer.query('ROLLBACK').catch(()=>{});await save('failure-'+mode+'-'+Date.now(),{committed,error:safe(e),checkedAt:new Date().toISOString()});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,5).join('\n'));process.exitCode=1;}finally{if(peer)await peer.end().catch(()=>{});await db.end().catch(()=>{});}
