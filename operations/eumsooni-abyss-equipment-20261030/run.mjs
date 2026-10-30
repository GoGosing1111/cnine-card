import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {OP,IDS,HASH,PLAN,state as snapshot,receipt,artifacts,grant,verify} from './grant.mjs';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const mode=process.argv[2],directory=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[3]);
assert(['read','dry-run','apply','verify','replay'].includes(mode));assert.equal(HASH,'5460958cfc0ae0658bb1806afbc6a654f54038ee1891d8f7f51ec6f65e57fb03','Pinned plan changed');await fs.mkdir(out,{recursive:true});await assert.rejects(fs.access(path.join(out,mode+'.json')),/ENOENT/,'Inspect the prior receipt before replay');
const digest=createHash('sha256');for(const file of ['run.mjs','grant.mjs','plan.json','discover.mjs','lock-worker.mjs','wrangler.jsonc'])digest.update((await fs.readFile(path.join(directory,file),'utf8')).replace(/\r\n/g,'\n'));
const sourceSha256=digest.digest('hex'),db=connect(),token=randomBytes(32).toString('hex');
let server,lockDeadline=0,report,failed=false,heartbeat,lostLock=false;
const remote=async action=>{const r=await fetch(`http://127.0.0.1:${server.port}/${action}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(45000)}),body=await r.json();assert(r.ok,body.error||'Lock unavailable');return body;};
const full=async()=>({state:await snapshot(db),artifacts:await artifacts(db)});
try{
 await db.connect();
 if(['read','verify','replay'].includes(mode)){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
  if(mode==='read'){const before=await full();await fs.writeFile(path.join(out,'before.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'});assert.equal(before.artifacts.receipt.length,0);report={mode,sourceSha256,planHash:HASH,recipients:PLAN.recipients,operationExists:false};}
  else if(mode==='replay'){const r=await grant({query:(sql,args)=>{assert.match(sql,/^\s*SELECT\b/i,'Replay must only SELECT');return db.query(sql,args);}});assert(r.replayed);report={mode,sourceSha256,planHash:HASH,verification:r.verification,noWriteReplayVerified:true};}
  else report={mode,sourceSha256,planHash:HASH,verification:await verify(db),independentConnection:true};
  await db.query('ROLLBACK');
 }else{
  if(mode==='apply'){const dry=JSON.parse(await fs.readFile(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);assert.equal(dry.planHash,HASH);for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true,key);}
  const {unstable_dev}=await import('wrangler');
  server=await unstable_dev(path.join(directory,'lock-worker.mjs'),{config:path.join(directory,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const acquired=await remote('acquire');assert.equal(acquired.acquired,true);lockDeadline=acquired.leaseUntil;assert.equal((await remote('state')).owned,true);
  heartbeat=setInterval(()=>{remote('state').then(s=>{if(!s.owned)lostLock=true;}).catch(()=>{lostLock=true;});},3000);
  assert.equal((await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) SELECT id,$2,$3,$4,CURRENT_TIMESTAMP FROM unnest($1::bigint[]) ids(id) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[IDS,token,OP,lockDeadline,Date.now()])).rowCount,IDS.length);
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");await db.query("SET LOCAL statement_timeout='20s'");
  await db.query('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);
  await db.query('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);
  const before=await full(),options={leaseToken:token,lockDeadline};await db.query('SAVEPOINT original_state');
  if(mode==='dry-run'){
   assert.equal(await receipt(db),null);await db.query('SAVEPOINT injected');
   await assert.rejects(grant({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO app_meta(key,value,updated_at)')&&args[0]===OP)return db.query('SELECT 1/0');return db.query(sql,args);}},HASH,options),/division by zero/);
   await db.query('ROLLBACK TO SAVEPOINT injected');assert.deepEqual(await full(),before);
  }
  const result=await grant(db,HASH,options),replay=await grant({query:(sql,args)=>{assert.match(sql,/^\s*SELECT\b/i,'Replay must only SELECT');return db.query(sql,args);}});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
  const after=await full();
  if(mode==='dry-run'){await db.query('ROLLBACK TO SAVEPOINT original_state');assert.deepEqual(await full(),before);await db.query('ROLLBACK');report={mode,sourceSha256,planHash:HASH,verification:result.verification,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true};}
  else{assert(lockDeadline>Date.now()+5000);assert.equal(lostLock,false,'A live lock was lost');assert.equal((await remote('state')).owned,true);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND lease_until_ms>$3 FOR UPDATE',[IDS,token,Date.now()+3000])).rowCount,IDS.length);await db.query('COMMIT');report={mode,sourceSha256,planHash:HASH,...result,noWriteReplayVerified:true};await fs.writeFile(path.join(out,'committed-snapshots.json'),JSON.stringify({before,after},null,2)+'\n',{flag:'wx'});}
 }
}catch(e){failed=true;await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,5).join('\n'));process.exitCode=1;}
finally{
 clearInterval(heartbeat);
 try{if(server){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token]);await remote('release');assert.equal((await remote('state')).anyOwned,false);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token])).rowCount,0);if(report)report.leasesReleased=true;}}
 catch(e){failed=true;console.error(safe(e));process.exitCode=1;}
 if(server)await server.stop();await db.end();
}
if(report&&!failed){await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,receipt:undefined}));}
