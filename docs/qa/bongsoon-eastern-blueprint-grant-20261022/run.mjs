import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {OPERATION_KEY,TARGET,inspectBongsoonEasternBlueprint,grantBongsoonEasternBlueprint,verifyBongsoonEasternBlueprint} from '../../../scripts/ops/bongsoon-eastern-blueprint-grant-20261022.mjs';
import {ADMIN_LOG_VISIBLE_WHERE,ADMIN_LOG_VISIBLE_PARAMS} from '../../../functions/_admin_log_visibility.js';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';

const mode=process.argv[2],directory=path.dirname(fileURLToPath(import.meta.url));
assert(['read','dry-run','apply','verify'].includes(mode),'Expected read|dry-run|apply|verify');
const implementationFiles=[import.meta.filename,path.join(directory,'lock-worker.mjs'),path.join(directory,'wrangler.jsonc'),path.resolve(directory,'../../../scripts/ops/bongsoon-eastern-blueprint-grant-20261022.mjs')];
const digest=createHash('sha256');
for(const file of implementationFiles)digest.update((await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n'));
const sourceSha256=digest.digest('hex');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);
assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine','Unexpected database destination');
const db=new pg.Client({connectionString,application_name:'bongsoon-eastern-blueprint-20261022',connectionTimeoutMillis:15000});
const token=randomBytes(32).toString('hex');
let server,lockDeadline=0,report,failed=false;
const remote=async action=>{
 const response=await fetch(`http://127.0.0.1:${server.port}/${action}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(45000)});
 const result=await response.json();assert(response.ok,result.error||'Account lock failed');return result;
};
const snapshot=async()=>({
 ...await inspectBongsoonEasternBlueprint(db),
 audits:(await db.query('SELECT id FROM admin_logs WHERE target_id=$1 ORDER BY id',[OPERATION_KEY])).rows,
 wallet:(await db.query('SELECT coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id])).rows
});
const checkExcluded=async receipt=>{
 const source=`SELECT COUNT(*) AS visible FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id WHERE l.id=? AND (${ADMIN_LOG_VISIBLE_WHERE})`;
 const bound=__postgresCompatTest.bindQuestionMarks(source).text;
 const query=__postgresCompatTest.translateDialect(bound);
 const rows=(await db.query(query,[receipt.auditId,...ADMIN_LOG_VISIBLE_PARAMS])).rows;
 assert.equal(Number(rows[0].visible),0,'Operation must be excluded from the game operating log');
 return true;
};
const safeError=error=>String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]');
try{
 await db.connect();
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='15s'");
  const current=await snapshot();
  assert.equal(current.users.length,1);assert.equal(Number(current.users[0].id),TARGET.id);
  assert.equal(current.users[0].nickname,TARGET.nickname);assert.equal(current.users[0].status,'ACTIVE');
  assert.equal(current.items.length,1);assert.equal(Number(current.items[0].is_active),1);
  if(mode==='read')report={mode,sourceSha256,checkedAt:new Date().toISOString(),user:current.users[0],items:current.items,inventory:current.inventory,operationExists:!!current.receipt};
  else{
   assert(current.receipt,'Completion receipt required');
   const verification=await verifyBongsoonEasternBlueprint(db,current.receipt);
   report={mode,sourceSha256,receipt:current.receipt,verification,independentConnection:true,gameOperationLogExcluded:await checkExcluded(current.receipt)};
  }
  await db.query('ROLLBACK');
 }else{
  if(mode==='apply'){
   const dry=JSON.parse(await fs.readFile(path.join(directory,'dry-run.json'),'utf8'));
   assert.equal(dry.sourceSha256,sourceSha256,'Reviewed source changed');
   assert.equal(dry.rollbackVerified,true);assert.equal(dry.leasesReleased,true);
  }
  const require=createRequire(import.meta.url);
  const {unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
  server=await unstable_dev(path.join(directory,'lock-worker.mjs'),{config:path.join(directory,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const acquired=await remote('acquire');assert.equal(acquired.acquired,true);lockDeadline=acquired.leaseUntil;
  const lease=await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP)
   ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[TARGET.id,token,OPERATION_KEY,lockDeadline,Date.now()]);
  assert.equal(lease.rowCount,1,'Fallback lease unavailable');
  const before=await snapshot();
  const guarded={query:async(sql,args)=>{
   if(sql==='COMMIT'){
    assert(lockDeadline>Date.now()+5000,'Live lock is expiring');assert.equal((await remote('state')).owned,true);
    const rows=(await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND lease_until_ms>$3 FOR UPDATE',[TARGET.id,token,Date.now()+3000])).rows;
    assert.equal(rows.length,1,'Fallback lease lost before commit');
   }
   return db.query(sql,args);
  }};
  const result=await grantBongsoonEasternBlueprint(guarded,{dryRun:mode==='dry-run'});
  if(mode==='dry-run'){
   assert.equal(result.replayed,false,'A completed operation must not be repeated');
   assert.deepEqual(await snapshot(),before,'Dry-run must restore inventory, wallet, receipt, and logs');
   report={mode,sourceSha256,...result,rollbackVerified:true};
  }else{
   const noWrites={query:(sql,args)=>{
    assert(!/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(sql),'Replay must not write');return db.query(sql,args);
   }};
   const replay=await grantBongsoonEasternBlueprint(noWrites);
   assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
   report={mode,sourceSha256,...result,noWriteReplayVerified:true,gameOperationLogExcluded:await checkExcluded(result.receipt)};
  }
 }
}catch(error){failed=true;await db.query('ROLLBACK').catch(()=>{});console.error(safeError(error));process.exitCode=1;}
finally{
 try{
  if(server){
   await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[TARGET.id,token]);
   assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[TARGET.id,token])).rowCount,0);
   await remote('release');assert.equal((await remote('state')).owned,false);
   if(report)report.leasesReleased=true;
  }
 }catch(error){failed=true;console.error(safeError(error));process.exitCode=1;}
 if(server)await server.stop();await db.end();
}
if(report&&!failed){
 await fs.writeFile(path.join(directory,mode+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(mode==='read'?report:{
  mode,sourceSha256,replayed:report.replayed??null,quantity:report.verification?.inventory?.[0]?.quantity,
  amount:report.receipt?.allocations[0]?.amount,completedAt:report.receipt?.completedAt,
  rollbackVerified:report.rollbackVerified??null,noWriteReplayVerified:report.noWriteReplayVerified??null,
  independentConnection:report.independentConnection??false,gameOperationLogExcluded:report.gameOperationLogExcluded??null,
  leasesReleased:report.leasesReleased??null
 }));
}
