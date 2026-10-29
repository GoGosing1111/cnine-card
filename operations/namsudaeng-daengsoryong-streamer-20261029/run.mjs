import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {OPERATION_KEY as OP,IDS,TARGETS,PLAN_HASH,inspect,grant,verify,validate} from './grant.mjs';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const mode=process.argv[2],directory=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[3]||path.join(directory,'evidence'));
assert(['read','dry-run','apply','verify'].includes(mode));
assert.equal(PLAN_HASH,'4444266ca6d641c586679c3fda25263621ebd9b414d4a57ca40fcc22e90eb6d2','Pinned plan changed');validate(PLAN_HASH);
await fs.mkdir(out,{recursive:true});await assert.rejects(fs.access(path.join(out,mode+'.json')),/ENOENT/,'Report already exists; inspect the completed receipt before replay');
const digest=createHash('sha256');for(const file of ['run.mjs','grant.mjs','plan.json','source.json','preflight.mjs','lock-worker.mjs','wrangler.jsonc','../rap-contest-rewards-20261027/preflight.mjs'])digest.update((await fs.readFile(path.join(directory,file),'utf8')).replace(/\r\n/g,'\n'));
const sourceSha256=digest.digest('hex'),db=connect(),token=randomBytes(32).toString('hex'),chunks=Math.ceil(IDS.length/20);
let server,lockDeadline=0,report,failed=false,heartbeat,lostLock=false,pollPending=false;
const remote=async action=>{
 const replies=[];
 for(let i=0;i<chunks;i++){
  let body;
  for(let attempt=0;attempt<(action==='acquire'?12:1);attempt++){
   const r=await fetch(`http://127.0.0.1:${server.port}/${action}/${i}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(30000)});body=await r.json();assert(r.ok,body.error||'Lock unavailable');
   if(action!=='acquire'||body.acquired)break;
   await new Promise(resolve=>setTimeout(resolve,350));
  }
  if(action==='acquire')assert(body.acquired,'Account remains busy: '+body.busyIds?.join(','));
  replies.push(body);
 }
 return {acquired:replies.every(r=>r.acquired),count:replies.reduce((n,r)=>n+(r.count||0),0),owned:replies.reduce((n,r)=>n+(r.owned||0),0),leaseUntil:Math.min(...replies.map(r=>r.leaseUntil||0))};
};
const full=async()=>({state:await inspect(db),petAudits:(await db.query("SELECT id::text,after_data FROM admin_logs WHERE action_type='PET_GRANT' AND target_id='183' ORDER BY id")).rows,audit:(await db.query('SELECT * FROM admin_logs WHERE target_id=$1 ORDER BY id',[OP])).rows,sync:(await db.query('SELECT * FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[IDS])).rows});
const noWrites={query:(sql,args)=>{assert.match(sql,/^\s*SELECT\b/i,'Replay must only SELECT');return db.query(sql,args);}};
try{
 await db.connect();
 if(['read','verify'].includes(mode)){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
  const current=await full();
  if(mode==='read'){
   assert.equal(current.state.receipt,null,'Operation already completed');assert.equal(current.state.logs.length,0);
   await fs.writeFile(path.join(out,'before.json'),JSON.stringify(current,null,2)+'\n',{flag:'wx'});
   report={mode,sourceSha256,planHash:PLAN_HASH,recipientCount:current.state.users.length,totalBoxes:4,operationExists:false,syncCount:current.sync.length};
  }else{
   report={mode,sourceSha256,planHash:PLAN_HASH,verification:await verify(db,current.state.receipt),receipt:current.state.receipt,currentPetCollection:JSON.parse(current.state.collection.value),currentInventory:current.state.inventory,currentSync:current.sync,independentConnection:true,noWriteReplayVerified:(await grant(noWrites,{expectedPlanHash:PLAN_HASH})).replayed,checkedAt:new Date().toISOString()};
  }
  await db.query('ROLLBACK');
 }else{
  if(mode==='apply'){const dry=JSON.parse(await fs.readFile(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);assert.equal(dry.planHash,PLAN_HASH);for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true,key);}
  const {unstable_dev}=await import('wrangler');
  server=await unstable_dev(path.join(directory,'lock-worker.mjs'),{config:path.join(directory,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const acquired=await remote('acquire');assert.equal(acquired.acquired,true);assert.equal(acquired.count,IDS.length);lockDeadline=acquired.leaseUntil;assert.equal((await remote('state')).owned,IDS.length);
  console.log(JSON.stringify({stage:'LIVE_LOCKS_ACQUIRED',count:IDS.length,remainingMs:lockDeadline-Date.now()}));
  heartbeat=setInterval(()=>{if(pollPending)return;pollPending=true;remote('state').then(s=>{if(s.owned!==IDS.length)lostLock=true;}).catch(()=>{lostLock=true;}).finally(()=>{pollPending=false;});},4000);
  assert.equal((await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
   SELECT id,$2,$3,$4,CURRENT_TIMESTAMP FROM unnest($1::bigint[]) ids(id) ORDER BY id
   ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP
   WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[IDS,token,OP,lockDeadline,Date.now()])).rowCount,IDS.length);
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
  await db.query('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS]);
  await db.query('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);
  const before=await full(),options={expectedPlanHash:PLAN_HASH,leaseToken:token,lockDeadline};assert.equal(before.state.receipt,null,'Operation already completed');
  await db.query('SAVEPOINT original_state');
  if(mode==='dry-run'){
   await db.query('SAVEPOINT injected');
   await assert.rejects(grant({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO app_meta(key,value,updated_at)')&&args[0]===OP)throw Error('INJECTED_RECEIPT_FAILURE');return db.query(sql,args);}},options),/INJECTED_RECEIPT_FAILURE/);
   await db.query('ROLLBACK TO SAVEPOINT injected');assert.deepEqual(await full(),before);console.log(JSON.stringify({stage:'FAILURE_ROLLBACK_VERIFIED'}));
  }
  const result=await grant(db,options),replay=await grant(noWrites,{expectedPlanHash:PLAN_HASH});assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
  const after=await full();assert.equal(after.sync.length,before.sync.length);
  for(let i=0;i<before.sync.length;i++){assert.equal(after.sync[i].user_id,before.sync[i].user_id);assert(BigInt(after.sync[i].domains.inventory)>BigInt(before.sync[i].domains.inventory),'Inventory synchronization must advance');}
  if(mode==='dry-run'){
   await db.query('ROLLBACK TO SAVEPOINT original_state');assert.deepEqual(await full(),before);await db.query('ROLLBACK');
   report={mode,sourceSha256,planHash:PLAN_HASH,verification:result.verification,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true};
  }else{
   assert(lockDeadline>Date.now()+5000);assert.equal(lostLock,false,'A live lock was lost');assert.equal((await remote('state')).owned,IDS.length);
   assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[IDS,token,OP,Date.now()+3000])).rowCount,IDS.length);
   await fs.writeFile(path.join(out,'commit-candidate-snapshots.json'),JSON.stringify({before,after},null,2)+'\n',{flag:'wx'});
   await db.query('COMMIT');report={mode,sourceSha256,planHash:PLAN_HASH,...result,noWriteReplayVerified:true};
   await fs.writeFile(path.join(out,'commit-confirmed.json'),JSON.stringify({operationKey:OP,planHash:PLAN_HASH,sourceSha256,auditId:result.receipt.auditId,completedAt:result.receipt.completedAt},null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({stage:'COMMITTED',count:1,pets:1,totalBoxes:4,auditId:result.receipt.auditId,petAuditId:result.receipt.pet.auditId}));
  }
 }
}catch(e){failed=true;await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,5).join('\n'));process.exitCode=1;}
finally{
 clearInterval(heartbeat);
 try{if(server){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token]);await remote('release');assert.equal((await remote('state')).owned,0);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token])).rowCount,0);if(report)report.leasesReleased=true;}}
 catch(e){failed=true;console.error(safe(e));process.exitCode=1;}
 if(server)await server.stop();await db.end().catch(()=>{});
}
if(report&&!failed){await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,receipt:undefined}));}
