import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {OP,IDS,HASH,snapshot,compact,receipt,reverse,verify} from '../../../scripts/ops/blackcrown-reversal-20261027.mjs';
const DIR=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(DIR,'../../..'),require=createRequire(ROOT+'/package.json');process.chdir(ROOT);
const mode=process.argv[2];assert(['dry-run','apply','verify'].includes(mode));assert.equal(process.argv.length,3);
const digest=b=>createHash('sha256').update(b).digest('hex'),review=JSON.parse(fs.readFileSync(DIR+'/reviewed-source.json','utf8'));
assert.equal(review.planHash,HASH);for(const [file,sha] of Object.entries(review.files))assert.equal(digest(fs.readFileSync(path.join(ROOT,file))),sha,'Reviewed source changed: '+file);
const sourceHash=digest(fs.readFileSync(DIR+'/reviewed-source.json')),save=(file,data)=>fs.writeFileSync(DIR+'/'+file,JSON.stringify(data,null,2)+'\n');
let connectionString,db,server,token,liveHeld=false,dbHeld=false,keepalive;
async function connect(label){
 if(!connectionString){const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});connectionString=raw.trim().replace(/^['"]|['"]$/g,'');const uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');}
 const c=new (require('pg').Client)({connectionString,application_name:'blackcrown-reversal-'+label,connectionTimeoutMillis:15000});await c.connect();return c;
}
async function live(action){const r=await fetch('http://127.0.0.1:'+server.port+'/'+action,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(20000)});assert(r.ok,'Live account lock failed: '+r.status);return r.json();}
async function acquire(){
 token=randomBytes(32).toString('hex');const {unstable_dev}=await import(pathToFileURL(path.join(path.dirname(require.resolve('wrangler/package.json')),'wrangler-dist/cli.js')));
 server=await unstable_dev(DIR+'/lock-worker.mjs',{config:DIR+'/wrangler.jsonc',local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+600000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
 const lock=await live('acquire');assert.equal(lock.acquired,true);liveHeld=true;assert(lock.leaseDeadline>Date.now()+30000);
 keepalive=setInterval(()=>{void live('state').catch(()=>{});},3000);keepalive.unref();dbHeld=true;
 for(const id of IDS){const r=await db.query('INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET token=EXCLUDED.token,action_path=EXCLUDED.action_path,lease_until_ms=EXCLUDED.lease_until_ms,updated_at=EXCLUDED.updated_at WHERE user_mutation_locks_v1520.lease_until_ms <= $6 RETURNING user_id',[id,token,OP,lock.leaseDeadline,new Date().toISOString(),Date.now()]);assert.equal(r.rows.length,1,'Database account lease busy');}
 return {leaseToken:token,lockDeadline:lock.leaseDeadline};
}
async function stillHeld(){const s=await live('state');assert(s.owned&&s.leaseDeadline>Date.now()+5000,'Live account lease lost');}
async function independentVerify(exact=false){const c=await connect('independent-readonly');try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const verification=await verify(c,undefined,{exact});await c.query('COMMIT');return verification;}finally{await c.end();}}
try{
 db=await connect(mode);await db.query('BEGIN READ ONLY');const prior=await receipt(db);await db.query('COMMIT');
 if(mode==='verify'||prior){assert(prior);const report={checkedAt:new Date().toISOString(),sourceHash,replayed:mode!=='verify',additionalWrites:0,verification:await independentVerify()};save(mode==='verify'?'verification.json':'replay.json',report);console.log(JSON.stringify(report));}
 else{
  if(mode==='apply'){const dry=JSON.parse(fs.readFileSync(DIR+'/dry-run.json','utf8'));assert(dry.rolledBack&&dry.failureRollbackVerified&&dry.replayedWithoutWrites&&dry.sourceHash===sourceHash,'Matching complete dry run required');}
  const options=await acquire();console.log(JSON.stringify({phase:'three-accounts-locked',mode}));await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  const before=await snapshot(db);const backup='C:/Users/User/.codex/visualizations/2026/10/27/01a17ab9-a03a-79f2-bb14-19ce5c1ac967/blackcrown-reversal-'+mode+'-'+Date.now()+'.json';fs.writeFileSync(backup,JSON.stringify(before,null,2));
  if(mode==='dry-run'){
   await db.query('SAVEPOINT failure_preview');let refunds=0;
   const injected={query(s,p){if(/INSERT INTO coin_logs/.test(s)&&++refunds===2)throw Error('injected second refund failure');return db.query(s,p);}};
   await assert.rejects(reverse(injected,options),/injected second refund failure/);await db.query('ROLLBACK TO SAVEPOINT failure_preview');assert.deepEqual(await snapshot(db),before);assert.equal(await receipt(db),null);
  }
  const result=await reverse(db,options);
  const selectOnly={query(s,p){assert.match(s.trim(),/^SELECT\b/,'Replay attempted a write');return db.query(s,p);}};assert.equal((await reverse(selectOnly)).replayed,true);await stillHeld();
  if(mode==='dry-run'){
   await db.query('ROLLBACK');await db.query('BEGIN READ ONLY');assert.deepEqual(await snapshot(db),before);assert.equal(await receipt(db),null);await db.query('COMMIT');
   const report={checkedAt:new Date().toISOString(),sourceHash,planHash:HASH,rolledBack:true,failureRollbackVerified:true,replayedWithoutWrites:true,backup,before:compact(before),verification:result.verification};save('dry-run.json',report);console.log(JSON.stringify({rolledBack:true,failureRollbackVerified:true,verification:result.verification}));
  }else{
   await db.query('COMMIT');const report={checkedAt:new Date().toISOString(),sourceHash,backup,...result,independent:await independentVerify(true)};save('apply-result.json',report);console.log(JSON.stringify({committed:true,verification:report.independent}));
  }
 }
}catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({ok:false,mode,message:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]')}));process.exitCode=1;}
finally{
 if(keepalive)clearInterval(keepalive);
 try{
  if(dbHeld&&db){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token]);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[IDS,token])).rows.length,0);}
  if(liveHeld&&server){const release=await live('release');assert.equal(release.released,true);save(mode+'-locks-released.json',{releasedAt:new Date().toISOString(),databaseLeasesReleased:true,liveLeasesReleased:true});}
 }catch(error){console.error('Lease release verification failed: '+error.message);process.exitCode=1;}
 if(server)await server.stop().catch(()=>{});if(db)await db.end().catch(()=>{});
}
