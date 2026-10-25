import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {PLAN,GRANT,REVOKE,HASH,DEADLINE,grant,revoke,receipt,state,verify} from '../../../scripts/ops/bongsoon-general-jok-loan-20261026.mjs';
const DIR=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(DIR,'../../..'),require=createRequire(ROOT+'/package.json');
process.chdir(ROOT);
const mode=process.argv[2];assert(['read','dry-run','grant','revoke','verify'].includes(mode),'Use read|dry-run|grant|revoke|verify');
assert.equal(process.argv.length,3,'No clock override or extra options accepted');
const digest=b=>createHash('sha256').update(b).digest('hex');
const review=JSON.parse(fs.readFileSync(path.join(DIR,'reviewed-source.json'),'utf8'));
assert.equal(review.planHash,HASH);for(const [file,sha] of Object.entries(review.files))assert.equal(digest(fs.readFileSync(path.join(ROOT,file))),sha,'Reviewed source changed: '+file);
const sourceHash=digest(fs.readFileSync(path.join(DIR,'reviewed-source.json')));
const save=(file,data)=>fs.writeFileSync(path.join(DIR,file),JSON.stringify(data,null,2)+'\n');
const compact=s=>({user:s.user,identities:s.identities,holding:s.cards.filter(x=>x.mercenary_code===PLAN.code),loadout:s.loadout,pvp:s.pvp,protectedStateHash:digest(JSON.stringify(s))});
let connectionString,db,server,token,liveHeld=false,dbHeld=false,keepalive;
async function connect(label){
 if(!connectionString){
  const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
  connectionString=raw.trim().replace(/^['"]|['"]$/g,'');const u=new URL(connectionString);assert(u.hostname.endsWith('.neon.tech')&&u.pathname==='/cnine','Wrong database');
 }
 const c=new (require('pg').Client)({connectionString,application_name:'bongsoon-general-jok-'+label,connectionTimeoutMillis:15000});await c.connect();return c;
}
async function independentVerify(){
 const c=await connect('verify');try{await c.query('BEGIN READ ONLY');const verification=await verify(c),snapshot=compact(await state(c));await c.query('COMMIT');return {verification,snapshot};}finally{await c.end();}
}
async function live(action){
 const r=await fetch('http://127.0.0.1:'+server.port+'/'+action,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(20000)});assert(r.ok,'Live account lock failed: '+r.status);return r.json();
}
async function acquire(){
 token=randomBytes(32).toString('hex');
 const {unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
 server=await unstable_dev(path.join(DIR,'lock-worker.mjs'),{config:path.join(DIR,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+600000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
 const lock=await live('acquire');assert.equal(lock.acquired,true);liveHeld=true;assert(lock.leaseDeadline>Date.now()+20000);
 keepalive=setInterval(()=>{void live('state').catch(()=>{});},3000);keepalive.unref();
 const r=await db.query('INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET token=EXCLUDED.token,action_path=EXCLUDED.action_path,lease_until_ms=EXCLUDED.lease_until_ms,updated_at=EXCLUDED.updated_at WHERE user_mutation_locks_v1520.lease_until_ms <= $6 RETURNING user_id',[PLAN.userId,token,GRANT,lock.leaseDeadline,new Date().toISOString(),Date.now()]);
 assert.equal(r.rows.length,1,'Database account lease busy');dbHeld=true;
 return {leaseToken:token,lockDeadline:lock.leaseDeadline};
}
async function begin(){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");}
async function stillHeld(){const r=await live('state');assert(r.owned&&r.leaseDeadline>Date.now()+5000,'Live lease lost: '+JSON.stringify({owned:r.owned,remainingMs:r.leaseDeadline-Date.now()}));}
try{
 db=await connect(mode);
 if(mode==='read'){
  await db.query('BEGIN READ ONLY');const report={checkedAt:new Date().toISOString(),sourceHash,plan:PLAN,planHash:HASH,snapshot:compact(await state(db)),grant:await receipt(db,GRANT),revoke:await receipt(db,REVOKE)};await db.query('COMMIT');save('read.json',report);console.log(JSON.stringify(report,null,2));
 }else if(mode==='verify'){
  const report={checkedAt:new Date().toISOString(),sourceHash,...await independentVerify()};save('verification-latest.json',report);console.log(JSON.stringify(report,null,2));
 }else{
  await db.query('BEGIN READ ONLY');const old=await receipt(db,mode==='revoke'?REVOKE:GRANT);await db.query('COMMIT');
  if(old){const report={checkedAt:new Date().toISOString(),replayed:true,additionalWrites:0,...await independentVerify()};save(mode+'-replay.json',report);console.log(JSON.stringify(report,null,2));}
  else{
   if(mode==='grant'){
    const dry=JSON.parse(fs.readFileSync(path.join(DIR,'dry-run.json'),'utf8'));assert(dry.rolledBack&&dry.failureRollbackVerified&&dry.grantVerified&&dry.revokeVerified&&dry.sourceHash===sourceHash,'Matching dry run required');
    const schedule=JSON.parse(fs.readFileSync(path.join(DIR,'schedule.json'),'utf8'));assert(schedule.id&&schedule.active===true&&schedule.recallAt===PLAN.expiresAt&&schedule.sourceHash===sourceHash,'Active reviewed recall schedule required');
    assert(Date.now()<DEADLINE,'Loan period ended');
   }
   if(mode==='revoke')assert(Date.now()>=DEADLINE,'Not yet 05:00 KST');
   const options=await acquire();console.log(JSON.stringify({phase:'account-locked',mode,remainingMs:options.lockDeadline-Date.now()}));await begin();
   const before=await state(db);
   if(mode==='dry-run'){
    assert.equal(await receipt(db,GRANT),null);assert.equal(await receipt(db,REVOKE),null);
    await db.query('SAVEPOINT failure_preview');
    const injected={query(s,p){if(/INSERT INTO mercenary_card_acquisitions/.test(s))throw Error('injected acquisition failure');return db.query(s,p);}};
    await assert.rejects(grant(injected,HASH,options),/injected acquisition failure/);await db.query('ROLLBACK TO SAVEPOINT failure_preview');
    assert.deepEqual(await state(db),before);assert.equal(await receipt(db,GRANT),null);
    const g=await grant(db,HASH,options),ro={query(s,p){assert.match(s.trim(),/^SELECT\b/);return db.query(s,p);}};
    assert.equal((await grant(ro,HASH)).replayed,true);await assert.rejects(revoke(db,HASH,options),/Not yet/);
    console.log(JSON.stringify({phase:'preview-grant-verified',remainingMs:options.lockDeadline-Date.now()}));
    const r=await revoke(db,HASH,{...options,previewClock:DEADLINE});assert.equal((await revoke(ro,HASH)).replayed,true);
    console.log(JSON.stringify({phase:'preview-revoke-verified',remainingMs:options.lockDeadline-Date.now()}));await stillHeld();await db.query('ROLLBACK');
    await db.query('BEGIN READ ONLY');assert.deepEqual(await state(db),before);assert.equal(await receipt(db,GRANT),null);assert.equal(await receipt(db,REVOKE),null);await db.query('COMMIT');
    const report={checkedAt:new Date().toISOString(),sourceHash,planHash:HASH,rolledBack:true,failureRollbackVerified:true,grantVerified:g.verification.verified,revokeVerified:r.verification.verified,replayedWithoutWrites:true,before:compact(before),grant:g.verification,revoke:r.verification};save('dry-run.json',report);console.log(JSON.stringify(report,null,2));
   }else{
    const result=await (mode==='grant'?grant:revoke)(db,HASH,options);await stillHeld();await db.query('COMMIT');
    const report={checkedAt:new Date().toISOString(),sourceHash,mode,...result,...await independentVerify()};
    save(mode+'-result.json',report);console.log(JSON.stringify(report,null,2));
   }
  }
 }
}catch(error){
 if(db)await db.query('ROLLBACK').catch(()=>{});
 console.error(JSON.stringify({ok:false,mode,name:error.name,message:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[database connection redacted]')}));process.exitCode=1;
}finally{
 if(keepalive)clearInterval(keepalive);
 if(dbHeld&&db)await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[PLAN.userId,token]).catch(()=>{});
 if(liveHeld&&server)await live('release').catch(()=>{});
 if(server)await server.stop().catch(()=>{});
 if(db)await db.end().catch(()=>{});
}
