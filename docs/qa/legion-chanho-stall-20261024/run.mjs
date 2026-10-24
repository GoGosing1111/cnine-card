import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {OP,PLAN,HASH,state,receipt,artifacts,grant,verify} from '../../../scripts/ops/chanho-legion-recovery-20261024.mjs';
const mode=process.argv[2],directory=import.meta.dirname,id=PLAN.userId;
assert(['dry-run','apply','verify'].includes(mode));
const digest=createHash('sha256');
for(const file of [import.meta.filename,path.join(directory,'lock-worker.mjs'),path.join(directory,'wrangler.jsonc'),path.resolve(directory,'../../../scripts/ops/chanho-legion-recovery-20261024.mjs')])digest.update((await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n'));
digest.update(HASH);const sourceSha256=digest.digest('hex');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'chanho-legion-recovery-20261024',connectionTimeoutMillis:15000});
const token=randomBytes(32).toString('hex');let server,lockDeadline=0,report,failed=false;
const remote=async action=>{const response=await fetch(`http://127.0.0.1:${server.port}/${action}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(45000)});const result=await response.json();assert(response.ok,result.error||'Account lease failed');return result;};
const snapshot=async()=>({state:await state(db),artifacts:await artifacts(db),receipt:await receipt(db)});
const safeError=e=>String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]');
try{
 await db.connect();
 if(mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const r=await receipt(db);assert(r);
  report={mode,sourceSha256,receipt:r,verification:await verify(db,r),currentInventory:(await state(db)).inventory,independentConnection:true};
  await db.query('ROLLBACK');
 }else{
  if(mode==='apply'){const dry=JSON.parse(await fs.readFile(path.join(directory,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);assert.equal(dry.rollbackVerified,true);assert.equal(dry.leasesReleased,true);}
  const require=createRequire(import.meta.url),{unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
  server=await unstable_dev(path.join(directory,'lock-worker.mjs'),{config:path.join(directory,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const acquired=await remote('acquire');assert.equal(acquired.acquired,true);lockDeadline=acquired.leaseUntil;
  const lease=await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[id,token,OP,lockDeadline,Date.now()]);
  assert.equal(lease.rowCount,1,'Fallback lease unavailable');const before=await snapshot();
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  const result=await grant(db,HASH,{leaseToken:token,lockDeadline});
  assert(lockDeadline>Date.now()+5000);assert.equal((await remote('state')).owned,true);
  assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND lease_until_ms>$3 FOR UPDATE',[id,token,Date.now()+3000])).rowCount,1);
  await db.query(mode==='dry-run'?'ROLLBACK':'COMMIT');
  if(mode==='dry-run'){assert.equal(result.replayed,false);assert.deepEqual(await snapshot(),before);report={mode,sourceSha256,...result,rollbackVerified:true};}
  else{
   const noWrites={query:(sql,args)=>{assert(!/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(sql),'Replay must not write');return db.query(sql,args);}};
   const replay=await grant(noWrites,HASH);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
   report={mode,sourceSha256,...result,noWriteReplayVerified:true};
  }
 }
}catch(e){failed=true;await db.query('ROLLBACK').catch(()=>{});console.error(safeError(e));process.exitCode=1;}
finally{
 try{if(server){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[id,token]);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[id,token])).rowCount,0);await remote('release');assert.equal((await remote('state')).owned,false);if(report)report.leasesReleased=true;}}
 catch(e){failed=true;console.error(safeError(e));process.exitCode=1;}
 if(server)await server.stop();await db.end();
}
if(report&&!failed){await fs.writeFile(path.join(directory,mode+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,recipient:PLAN.nickname,userId:id,items:PLAN.items,auditId:report.receipt.auditId,replayed:report.replayed,rollbackVerified:report.rollbackVerified,noWriteReplayVerified:report.noWriteReplayVerified,independentConnection:report.independentConnection,leasesReleased:report.leasesReleased,coinsAndEnergyPreserved:true}));}
