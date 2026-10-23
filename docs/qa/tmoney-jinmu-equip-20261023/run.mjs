import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {connect,safeError} from '../jokgeida-halloween-jokro-slot3-20261022/connect.mjs';
import {PLAN,OP,HASH,IDS,state,receipt,artifacts,grant,verify} from './equip.mjs';
const out=fileURLToPath(new URL('./',import.meta.url)),token=randomBytes(32).toString('hex');
const sourceSha256=createHash('sha256').update(readFileSync(new URL('./equip.mjs',import.meta.url))).digest('hex');
assert.equal(readFileSync(path.join(out,'reviewed-plan.sha256'),'utf8').trim(),HASH);
const save=(name,data)=>writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2)+'\n');
const summary=r=>({replayed:r.replayed,account:'T-Money™',loadouts:r.receipt.after,auditId:r.receipt.auditId,completedAt:r.receipt.completedAt,verification:r.verification});
let db,server,dbLocked=false,deadline,phase='connect',lastSql='';
async function read(fn){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{const r=await fn(db);await db.query('ROLLBACK');return r;}catch(e){await db.query('ROLLBACK');throw e;}}
async function lock(action){const r=await fetch('http://127.0.0.1:'+server.port+'/'+action,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(20000)});const data=await r.json();assert.equal(r.status,200,'Live lock: '+(data.error||r.status));return data;}
async function releaseDb(){if(dbLocked){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token]);dbLocked=false;}}
async function acquire(){const a=await lock('acquire');assert.equal(a.acquired,IDS.length);deadline=a.leaseDeadline;dbLocked=true;const r=await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) SELECT id,$2,$3,$4,CURRENT_TIMESTAMP FROM unnest($1::bigint[]) u(id) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[IDS,token,OP,deadline,Date.now()]);assert.equal(r.rowCount,IDS.length,'DB lease unavailable');}
async function begin(){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");}
async function rollbackTest(fn){
 for(let attempt=0;attempt<3;attempt++){
  await begin();
  try{
   await db.query('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);
   const before=await state(db),empty=await artifacts(db);await db.query('SAVEPOINT grant_test');const result=await fn();
   await db.query('ROLLBACK TO SAVEPOINT grant_test');assert.deepEqual(await state(db),before,'Rollback state differs');assert.deepEqual(await artifacts(db),empty,'Rollback artifacts differ');await db.query('ROLLBACK');return result;
  }catch(e){await db.query('ROLLBACK');if(['40P01','40001'].includes(e.code)&&attempt<2&&deadline>Date.now()+30000)continue;throw e;}
 }
}
try{
 db=await connect();const originalQuery=db.query.bind(db);db.query=(sql,args)=>{lastSql=String(sql).slice(0,170);return originalQuery(sql,args).catch(e=>{e.failedSql=String(sql).slice(0,1500);if(['40P01','40001'].includes(e.code))console.error(JSON.stringify({phase,code:e.code,detail:e.detail,where:e.where}));throw e;});};const existing=await read(receipt);
 if(existing){const v=await read(c=>verify(c,existing));save('verify',{receipt:existing,verification:v,sourceSha256,verifiedAt:new Date().toISOString(),independentConnection:true});console.log(JSON.stringify({phase:'already-completed',...v}));}
 else{
  const require=createRequire(new URL('../../package.json',import.meta.url));const {unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
  server=await unstable_dev(path.join(out,'lock-worker.mjs'),{config:path.join(out,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+600000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  await acquire();let opts={lockDeadline:deadline,leaseToken:token};
  const readonly={query(sql,args){assert(!/\b(INSERT|UPDATE|DELETE|BEGIN)\b/i.test(sql),'Replay attempted write');return db.query(sql,args);}};
  phase='injected-failure-test';await rollbackTest(async()=>{let inserted=0;const fault={query(sql,args){if(sql.startsWith('INSERT INTO app_meta(')&&args[0]===OP)throw Error('INJECTED_RECEIPT_FAILURE');if(sql.startsWith('INSERT INTO user_mercenary_loadout_v1'))inserted++;return db.query(sql,args);}};let failure;try{await grant(fault,HASH,opts);}catch(e){failure=e;}if(failure?.code)throw failure;assert.match(failure?.message||'',/INJECTED_RECEIPT_FAILURE/);assert.equal(inserted,2);});
  await releaseDb();await lock('release');await acquire();opts={lockDeadline:deadline,leaseToken:token};
  phase='dry-run';const dry=await rollbackTest(async()=>{const result=await grant(db,HASH,opts);assert.equal(result.replayed,false);const replay=await grant(readonly,HASH,opts);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);return result;});
  save('dry-run',{verified:true,rollbackVerified:true,injectedFailureRolledBack:true,idempotentReplay:true,sourceSha256,planHash:HASH,verification:dry.verification});console.log(JSON.stringify({phase:'dry-run',rollbackVerified:true,injectedFailureRolledBack:true,idempotentReplay:true,recipientCount:PLAN.recipientCount,totalQuantity:PLAN.totalQuantity}));
  await releaseDb();await lock('release');await acquire();opts={lockDeadline:deadline,leaseToken:token};
  phase='apply';assert.equal((await lock('state')).owned,IDS.length);await begin();const applied=await grant(db,HASH,opts);assert(deadline>Date.now()+7000);assert.equal((await lock('state')).owned,IDS.length);await db.query('COMMIT');
  save('apply',{...applied,sourceSha256});console.log(JSON.stringify({phase:'applied',...summary(applied)},null,2));
  const repeat=await grant(readonly,HASH,opts);assert.equal(repeat.replayed,true);save('replay',{verified:true,additionalWrites:0,operationKey:OP});
  await releaseDb();await lock('release');await db.end();db=await connect();const saved=await read(receipt),verified=await read(c=>verify(c,saved));save('verify',{receipt:saved,verification:verified,sourceSha256,verifiedAt:new Date().toISOString(),independentConnection:true});console.log(JSON.stringify({phase:'independent-verification',...verified}));
 }
}catch(e){const failedSql=lastSql;await db?.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({phase,lastSql:e.failedSql||failedSql,error:safeError(e),stack:e.stack?.split("\n").slice(0,6),code:e.code}));process.exitCode=1;}
finally{await releaseDb().catch(()=>{});if(server){await lock('release').catch(()=>{});await server.stop();}await db?.end();}
