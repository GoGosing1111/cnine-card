import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {OPERATION_KEY as OP,IDS,PLAN_HASH,inspect,grant,verify} from '../../../scripts/ops/jokro-craft-three-grant-20261027.mjs';
const mode=process.argv[2],directory=path.dirname(fileURLToPath(import.meta.url)),output=path.resolve(process.argv[3]||directory);
assert(['read','dry-run','apply','verify'].includes(mode));await fs.mkdir(output,{recursive:true});
await assert.rejects(fs.access(path.join(output,mode+'.json')),/ENOENT/,'Use a fresh report destination');
const files=[import.meta.filename,path.join(directory,'lock-worker.mjs'),path.join(directory,'wrangler.jsonc'),...['mjs','plan.json'].map(ext=>path.resolve(directory,'../../../scripts/ops/jokro-craft-three-grant-20261027.'+ext))];
const digest=createHash('sha256');for(const file of files)digest.update((await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n'));const sourceSha256=digest.digest('hex');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'jokro-craft-three-grant-20261027',connectionTimeoutMillis:15000}),token=randomBytes(32).toString('hex');
const query=db.query.bind(db);db.query=async(sql,args)=>{try{return await query(sql,args);}catch(error){console.error('Failed SQL: '+String(typeof sql==='string'?sql:sql.text).slice(0,240));throw error;}};
let server,lockDeadline=0,report,failed=false;
const safeError=e=>String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]');
const remote=async action=>{const response=await fetch(`http://127.0.0.1:${server.port}/${action}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(45000)});const result=await response.json();assert(response.ok,result.error||'Account lock unavailable');return result;};
const snapshot=async()=>({state:await inspect(db),audit:(await db.query('SELECT * FROM admin_logs WHERE target_id=$1 ORDER BY id',[OP])).rows});
const noWrites={query:(sql,args)=>{assert(/^\s*SELECT\b/i.test(typeof sql==='string'?sql:sql.text),'Replay must be SELECT-only');return db.query(sql,args);}};
try{
 await db.connect();
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const current=await inspect(db);
  report={mode,sourceSha256,planHash:PLAN_HASH,checkedAt:new Date().toISOString(),readOnly:true,...(mode==='read'?{recipientCount:current.users.length,operationExists:!!current.receipt,inventory:current.inventory}:{receipt:current.receipt,verification:await verify(db,current.receipt),independentConnection:true,noWriteReplayVerified:(await grant(noWrites,{expectedPlanHash:PLAN_HASH})).replayed})};
  await db.query('ROLLBACK');
 }else{
  if(mode==='apply'){const dry=JSON.parse(await fs.readFile(path.join(output,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true,key);}
  const require=createRequire(import.meta.url),{unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
  server=await unstable_dev(path.join(directory,'lock-worker.mjs'),{config:path.join(directory,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const acquired=await remote('acquire');assert.equal(acquired.acquired,true);assert.equal(acquired.count,IDS.length);lockDeadline=acquired.leaseUntil;
  const lease=await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
   SELECT id,$2,$3,$4,CURRENT_TIMESTAMP FROM unnest($1::bigint[]) p(id) ORDER BY id
   ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP
   WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[IDS,token,OP,lockDeadline,Date.now()]);assert.equal(lease.rowCount,IDS.length,'Account fallback lease busy');
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  const before=await snapshot(),options={expectedPlanHash:PLAN_HASH,leaseToken:token,lockDeadline};
  if(mode==='dry-run'){
   assert.equal(before.state.receipt,null,'Operation already completed');await db.query('SAVEPOINT fault_check');
   await assert.rejects(grant({query:async(sql,args)=>{if((typeof sql==='string'?sql:sql.text).startsWith('INSERT INTO app_meta(key,value,updated_at)'))return db.query('SELECT 1/0');return db.query(sql,args);}},options),error=>error.code==='22012');
   await db.query('ROLLBACK TO SAVEPOINT fault_check');assert.deepEqual(await snapshot(),before,'Failure rollback changed state');
  }
  const result=await grant(db,options),replay=await grant(noWrites,{expectedPlanHash:PLAN_HASH});assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
  if(mode==='dry-run'){await db.query('ROLLBACK');assert.deepEqual(await snapshot(),before,'Dry-run changed persistent state');report={mode,sourceSha256,...result,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true};}
  else{
   assert(lockDeadline>Date.now()+5000);assert.equal((await remote('state')).owned,IDS.length);
   assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[IDS,token,OP,Date.now()+3000])).rowCount,IDS.length);
   await db.query('COMMIT');report={mode,sourceSha256,...result,noWriteReplayVerified:true};
  }
 }
}catch(error){failed=true;await db.query('ROLLBACK').catch(()=>{});console.error(safeError(error));process.exitCode=1;}
finally{
 try{if(server){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token]);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token])).rowCount,0);await remote('release');assert.equal((await remote('state')).owned,0);if(report)report.leasesReleased=true;}}
 catch(error){failed=true;console.error(safeError(error));process.exitCode=1;}
 if(server)await server.stop();await db.end();
}
if(report&&!failed){await fs.writeFile(path.join(output,mode+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode,sourceSha256,verification:report.verification,completedAt:report.receipt?.completedAt,rollbackVerified:report.rollbackVerified??null,injectedFailureRollback:report.injectedFailureRollback??null,noWriteReplayVerified:report.noWriteReplayVerified??null,independentConnection:report.independentConnection??false,leasesReleased:report.leasesReleased??null,recipientCount:report.recipientCount}));}
