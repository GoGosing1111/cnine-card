import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createHash,randomBytes} from 'node:crypto';import pg from 'pg';
import {OP,IDS,PLAN,HASH,snapshot,receipt,artifacts,grant,verify} from '../../../scripts/ops/tmoney-package15-20261026.mjs';
const mode=process.argv[2],directory=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[3]);assert(['read','dry-run','apply','verify','replay'].includes(mode));await fs.mkdir(out,{recursive:true});
const files=['run.mjs','lock-worker.mjs','wrangler.jsonc','../../../scripts/ops/tmoney-package15-20261026.mjs','../../../scripts/ops/support-package-bogo-extra-20261025.mjs','../../../shared/support-package-v1.mjs','../../../functions/_package_coin_accounting.js'],digest=createHash('sha256');for(const file of files)digest.update((await fs.readFile(path.join(directory,file),'utf8')).replace(/\r\n/g,'\n'));const sourceSha256=digest.digest('hex');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'tmoney-package15-20261026',connectionTimeoutMillis:15000}),token=randomBytes(32).toString('hex');
let server,lockDeadline=0,report,failed=false,heartbeat,lostLock=false;const safe=e=>String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]');
const remote=async action=>{const r=await fetch(`http://127.0.0.1:${server.port}/${action}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(45000)}),body=await r.json();assert(r.ok,body.error||'Lock unavailable');return body;};
const full=async()=>({state:await snapshot(db),artifacts:await artifacts(db)});
try{
 await db.connect();
 if(mode==='read'||mode==='verify'||mode==='replay'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
  if(mode==='read'){const before=await full();await fs.writeFile(path.join(out,'before.json'),JSON.stringify(before,null,2),{flag:'wx'});report={mode,sourceSha256,planHash:HASH,plan:PLAN,operationExists:before.artifacts.receipt!==null};}
  else if(mode==='replay'){const result=await grant({query:(sql,args)=>{assert.match(sql,/^\s*SELECT\b/i,'Replay must only SELECT');return db.query(sql,args);}});assert(result.replayed);report={mode,sourceSha256,verification:result.verification,noWriteReplayVerified:true};}
  else{report={mode,sourceSha256,verification:await verify(db),independentConnection:true};}
  await db.query('ROLLBACK');
 }else{
  if(mode==='apply'){const dry=JSON.parse(await fs.readFile(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);assert.equal(dry.planHash,HASH);for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true,key);}
  const require=createRequire(import.meta.url),{unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
  server=await unstable_dev(path.join(directory,'lock-worker.mjs'),{config:path.join(directory,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const acquired=await remote('acquire');assert.equal(acquired.acquired,true);lockDeadline=acquired.leaseUntil;assert.equal((await remote('state')).owned,true);heartbeat=setInterval(()=>{remote('state').then(s=>{if(!s.owned)lostLock=true;}).catch(()=>{lostLock=true;});},3000);
  assert.equal((await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) SELECT id,$2,$3,$4,CURRENT_TIMESTAMP FROM unnest($1::bigint[]) ids(id) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[IDS,token,OP,lockDeadline,Date.now()])).rowCount,IDS.length);
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");await db.query("SET LOCAL statement_timeout='20s'");await db.query('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=5147 FOR UPDATE');await db.query('SELECT id FROM users WHERE id=5147 FOR UPDATE');const before=await full(),options={leaseToken:token,lockDeadline};await db.query('SAVEPOINT original_state');
  if(mode==='dry-run'){
   assert.equal(before.artifacts.receipt,null);await db.query('SAVEPOINT injected');await assert.rejects(grant({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO app_meta(key,value,updated_at)')&&args[0]===OP)throw Error('INJECTED_RECEIPT_FAILURE');return db.query(sql,args);}},options),/INJECTED_RECEIPT_FAILURE/);
   await db.query('ROLLBACK TO SAVEPOINT injected');assert.deepEqual(await full(),before);
  }
  const result=await grant(db,options),noWrites={query:(sql,args)=>{assert.match(sql,/^\s*SELECT\b/i,'Replay must only SELECT');return db.query(sql,args);}};
  const replay=await grant(noWrites);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
  if(mode==='dry-run'){await db.query('ROLLBACK TO SAVEPOINT original_state');assert.deepEqual(await full(),before);await db.query('ROLLBACK');report={mode,sourceSha256,planHash:HASH,verification:result.verification,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true};}
  else{assert(lockDeadline>Date.now()+5000);assert.equal(lostLock,false,'A live lock was lost');assert.equal((await remote('state')).owned,true);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND lease_until_ms>$3 FOR UPDATE',[IDS,token,Date.now()+3000])).rowCount,IDS.length);await db.query('COMMIT');report={mode,sourceSha256,planHash:HASH,...result,noWriteReplayVerified:true};}
 }
}catch(e){failed=true;await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').slice(-5).join('\n'));process.exitCode=1;}
finally{clearInterval(heartbeat);try{if(server){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token]);await remote('release');assert.equal((await remote('state')).anyOwned,false);if(report)report.leasesReleased=true;}}catch(e){failed=true;console.error(safe(e));process.exitCode=1;}if(server)await server.stop();await db.end();}
if(report&&!failed){await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,receipt:undefined}));}
