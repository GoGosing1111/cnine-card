import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {OP,PLAN,HASH,state,receipt,artifacts,grant as performGrant,verify} from '../../../scripts/ops/c9-gasi-jokro-grant-20261026.mjs';

const mode=process.argv[2],directory=path.dirname(fileURLToPath(import.meta.url)),output=path.resolve(process.argv[3]||directory);
await fs.mkdir(output,{recursive:true});
const TARGET={id:4866,nickname:'[C9]가시'};
const inspect=async c=>{const s=await state(c);return {...s,operation:await receipt(c),holding:s.cards.filter(x=>x.mercenary_code==='V-979'),policy:s.settings,recipe:s.recipes};};
const grant=(c,options)=>performGrant(c,HASH,options);
assert(['read','dry-run','apply','verify'].includes(mode),'Expected read|dry-run|apply|verify');
const files=[import.meta.filename,path.join(directory,'lock-worker.mjs'),path.join(directory,'wrangler.jsonc'),path.resolve(directory,'../../../scripts/ops/c9-gasi-jokro-grant-20261026.mjs'),path.resolve(directory,'../../../scripts/ops/c9-gasi-jokro-grant-20261026.json')];
const digest=createHash('sha256');for(const file of files)digest.update((await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n'));const sourceSha256=digest.digest('hex');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'c9-gasi-jokro-grant-20261026',connectionTimeoutMillis:15000}),token=randomBytes(32).toString('hex');
let server,lockDeadline=0,report,failed=false;
const safeError=e=>String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]');
const remote=async action=>{const response=await fetch(`http://127.0.0.1:${server.port}/${action}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(45000)});const result=await response.json();assert(response.ok,result.error||'Account lock unavailable');return result;};
const snapshot=async()=>({state:await inspect(db),artifacts:await artifacts(db)});
try{
 await db.connect();
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const current=await inspect(db);assert.equal(current.users.length,1);assert.equal(Number(current.users[0].id),TARGET.id);assert.equal(current.users[0].nickname,TARGET.nickname);assert.equal(current.users[0].status,'ACTIVE');
  report={mode,sourceSha256,checkedAt:new Date().toISOString(),readOnly:true,...(mode==='read'?{account:current.users[0],holding:current.holding,stock:current.stock,craft:current.craft,recipeStored:current.recipe.length>0,operationExists:!!current.operation}:{receipt:current.operation,verification:await verify(db,current.operation),independentConnection:true})};
  await db.query('ROLLBACK');
 }else{
  if(mode==='apply'){const dry=JSON.parse(await fs.readFile(path.join(output,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true,key);}
  const require=createRequire(import.meta.url),{unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
  server=await unstable_dev(path.join(directory,'lock-worker.mjs'),{config:path.join(directory,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const acquired=await remote('acquire');assert.equal(acquired.acquired,true);lockDeadline=acquired.leaseUntil;
  const lease=await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP)
   ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[TARGET.id,token,OP,lockDeadline,Date.now()]);assert.equal(lease.rowCount,1,'Account fallback lease busy');
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");await db.query("SET LOCAL statement_timeout='15s'");
  const before=await snapshot(),options={leaseToken:token,lockDeadline};
  if(mode==='dry-run'){
   assert.equal(before.state.operation,null,'Operation already completed');await db.query('SAVEPOINT fault_check');
   await assert.rejects(grant({query:async(sql,args)=>{if((typeof sql==='string'?sql:sql.text).startsWith('INSERT INTO app_meta(key,value,updated_at)'))throw Error('INJECTED_RECEIPT_FAILURE');return db.query(sql,args);}},options),/INJECTED_RECEIPT_FAILURE/);
   await db.query('ROLLBACK TO SAVEPOINT fault_check');assert.deepEqual(await snapshot(),before,'Failure rollback changed state');
  }
  const result=await grant(db,options);
  const noWrites={query:(sql,args)=>{assert(!/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(typeof sql==='string'?sql:sql.text),'Replay must be read only');return db.query(sql,args);}};
  const replay=await grant(noWrites);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
  if(mode==='dry-run'){await db.query('ROLLBACK');assert.deepEqual(await snapshot(),before,'Dry-run changed persistent state');report={mode,sourceSha256,...result,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true};}
  else{
   assert(lockDeadline>Date.now()+5000);assert.equal((await remote('state')).owned,true);
   assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND lease_until_ms>$3 FOR UPDATE',[TARGET.id,token,Date.now()+3000])).rowCount,1);
   await db.query('COMMIT');report={mode,sourceSha256,...result,noWriteReplayVerified:true};
  }
 }
}catch(error){failed=true;await db.query('ROLLBACK').catch(()=>{});console.error(safeError(error));process.exitCode=1;}
finally{
 try{if(server){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[TARGET.id,token]);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[TARGET.id,token])).rowCount,0);await remote('release');assert.equal((await remote('state')).owned,false);if(report)report.leasesReleased=true;}}
 catch(error){failed=true;console.error(safeError(error));process.exitCode=1;}
 if(server)await server.stop();await db.end();
}
if(report&&!failed){await fs.writeFile(path.join(output,mode+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(mode==='read'?report:{mode,sourceSha256,replayed:report.replayed??null,verification:report.verification,completedAt:report.receipt?.completedAt,rollbackVerified:report.rollbackVerified??null,injectedFailureRollback:report.injectedFailureRollback??null,noWriteReplayVerified:report.noWriteReplayVerified??null,independentConnection:report.independentConnection??false,leasesReleased:report.leasesReleased??null}));}
