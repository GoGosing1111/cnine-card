import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {OP,HASH,PLAN,grant,receipt,snapshot,artifacts,verify} from './ganjang-pig-package4-20261026.mjs';

const [mode,directory]=process.argv.slice(2);assert(['read','dry-run','apply','verify','replay'].includes(mode));assert(directory);
const out=path.resolve(directory);fs.mkdirSync(out,{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const sourceHash=file=>createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex');
const sourceSha256=sourceHash(new URL('./ganjang-pig-package4-20261026.mjs',import.meta.url)),runnerSha256=sourceHash(new URL(import.meta.url));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'ganjang-pig-package4-20261026',connectionTimeoutMillis:15000,statement_timeout:20000});
const allowed=new Set(['users','pig_coin_wallets_v1','pig_coin_ledger_v1','cnine_user_inventory','coin_logs','inventory_logs','app_meta','admin_logs','user_mutation_locks_v1520']);
const query=db.query.bind(db);db.query=(sql,args)=>{const mutation=String(sql).match(/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_0-9]+)/i);if(mutation)assert(allowed.has(mutation[1].toLowerCase()),'Unexpected mutation');return query(sql,args);};
const readonly={query(sql,args){assert.match(sql,/^SELECT\b/,'Replay must be SELECT only');return db.query(sql,args);}};
async function transaction(fn,{readOnly=false,rollback=false}={}){
 await db.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
 try{await db.query("SET LOCAL lock_timeout='5s'");const result=await fn();await db.query(readOnly||rollback?'ROLLBACK':'COMMIT');return result;}
 catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
// A short-lived helper can access only this existing production account lock.
// Credentials remain in memory, and the helper expires even if the runner exits.
async function withLiveLocks(fn){
 const require=createRequire(import.meta.url),wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
 const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
 const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
 const base='https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa',name='cnine-ops-ganjang-grant-20261026',prefix='/workers/scripts/'+name;
 async function api(route,options={}){const res=await fetch(base+route,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(20000)});const value=await res.json();assert(value.success,JSON.stringify({status:res.status,errors:value.errors}));return value.result;}
 const absent=await fetch(base+prefix+'/settings',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});assert.equal(absent.status,404,'Do not overwrite an existing helper');
 const settings=await api('/workers/scripts/cnine-card-api-runtime/settings'),binding=settings.bindings.find(x=>x.name==='USER_LOCK');assert.equal(binding?.namespace_id,'7527bc3b920b4a2d86c4c3d6514ad4d1');assert.equal(binding.script_name,'cnine-card-user-lock');
 const {subdomain}=await api('/workers/subdomain');assert.equal(subdomain,'wlgks6344');
 const guard=randomBytes(32).toString('hex'),leaseToken=randomBytes(32).toString('hex'),expiresAt=Date.now()+15*60*1000;
 const source=`export default {async fetch(request,env){const url=new URL(request.url);if(Date.now()>${expiresAt}||request.method!=='POST'||request.headers.get('authorization')!=='Bearer '+env.GUARD||!['/acquire','/release','/state'].includes(url.pathname))return new Response('not found',{status:404});const body=await request.json();if(body.token!==env.LOCK_TOKEN)return new Response('not found',{status:404});const stub=env.USER_LOCK.get(env.USER_LOCK.idFromName('user:4981'));return stub.fetch('https://lock'+url.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:env.LOCK_TOKEN,actionPath:${JSON.stringify(OP)},leaseMs:120000})});}}`;
 let created=false,remoteHeld=false,sqlHeld=false,lockDeadline=0,result;
 const endpoint='https://'+name+'.'+subdomain+'.workers.dev';
 async function lock(route){const res=await fetch(endpoint+route,{method:'POST',headers:{Authorization:'Bearer '+guard,'content-type':'application/json'},body:JSON.stringify({token:leaseToken}),signal:AbortSignal.timeout(10000)});assert.equal(res.status,200,'Lock helper unavailable');return res.json();}
 try{
  const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'index.mjs',compatibility_date:'2026-10-01',bindings:[{type:'durable_object_namespace',name:'USER_LOCK',namespace_id:binding.namespace_id},{type:'plain_text',name:'GUARD',text:guard},{type:'plain_text',name:'LOCK_TOKEN',text:leaseToken}]})],{type:'application/json'}));form.append('index.mjs',new Blob([source],{type:'application/javascript+module'}),'index.mjs');
  await api(prefix,{method:'PUT',body:form});created=true;await api(prefix+'/subdomain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
  let ready;for(let i=0;i<8;i++){try{ready=await lock('/state');break;}catch(e){if(i===7)throw e;await new Promise(r=>setTimeout(r,1000));}}assert(ready);
  const acquired=await lock('/acquire');assert.equal(acquired.acquired,true,'Account is busy; retry later');remoteHeld=true;lockDeadline=Number(acquired.leaseUntil);assert(lockDeadline>Date.now()+100000);
  const rows=(await db.query('INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) VALUES(4981,$1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$4 RETURNING user_id',[leaseToken,OP,lockDeadline,Date.now()])).rows;assert.equal(rows.length,1,'SQL account lease is busy');sqlHeld=true;
  const live=await lock('/state');assert(live.held&&live.lock.token===leaseToken&&live.lock.actionPath===OP);
  result=await fn({leaseToken,lockDeadline});assert(lockDeadline>Date.now()+5000);
 }finally{
  await db.query('ROLLBACK').catch(()=>{});
  try{
   if(sqlHeld){assert.equal((await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=4981 AND token=$1 RETURNING user_id',[leaseToken])).rows.length,1);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=4981 AND token=$1',[leaseToken])).rows.length,0);}
   if(remoteHeld){assert((await lock('/release')).released);const state=await lock('/state');assert(!state.held||state.lock.token!==leaseToken);}
  }finally{
   if(created){await api(prefix,{method:'DELETE'});const check=await fetch(base+prefix+'/settings',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});assert.equal(check.status,404,'Helper deletion not verified');}
  }
 }
 return {...result,locksReleased:true,helperDeleted:true,lockNamespace:binding.namespace_id};
}
try{
 await db.connect();let result;
 if(mode==='read'){
  result=await transaction(async()=>({plan:PLAN,snapshot:await snapshot(db),artifacts:await artifacts(db)}),{readOnly:true});
 }else if(mode==='verify'){
  result=await transaction(async()=>({verification:await verify(readonly),current:await snapshot(db),independentReadOnlyConnection:true}),{readOnly:true});
 }else if(mode==='replay'){
  result=await transaction(async()=>{const before=await artifacts(db),r=await grant(readonly);assert(r.replayed);assert.deepEqual(await artifacts(db),before);return {verification:r.verification,replayed:true,additionalWrites:0};},{readOnly:true});
 }else{
  if(mode==='apply'){
   const dry=JSON.parse(fs.readFileSync(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);assert.equal(dry.runnerSha256,runnerSha256);assert.equal(dry.planHash,HASH);assert(dry.rollbackVerified&&dry.injectedFailureRollback&&dry.noWriteReplayVerified&&dry.locksReleased&&dry.helperDeleted);
  }
  // Check completion before creating any temporary helper or acquiring leases.
  const existing=await transaction(()=>receipt(db),{readOnly:true});assert.equal(existing,null,'Already completed; use verify or replay');
  result=await withLiveLocks(async options=>{
   console.log(JSON.stringify({mode,stage:'account-locks-acquired'}));
   const executed=await transaction(async()=>{
    // Keep the baseline locks outside both savepoints. Background rewards may
    // legitimately arrive immediately after the final transaction rollback.
    await db.query('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=4981 FOR UPDATE');
    await db.query('SELECT id FROM users WHERE id=4981 FOR UPDATE');
    await db.query('SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id=4981 FOR UPDATE');
    const before=await snapshot(db),beforeArtifacts=await artifacts(db);assert.equal(beforeArtifacts.receipt,null);for(const k of ['coins','items','pig','audit'])assert.equal(beforeArtifacts[k].length,0);save(mode+'-before',{snapshot:before,artifacts:beforeArtifacts});
    if(mode==='dry-run'){
     await db.query('SAVEPOINT failure_test');let caught;
     try{await grant({query(sql,args){if(sql.startsWith('INSERT INTO app_meta(')&&args[0]===OP)throw Error('INJECTED_RECEIPT_FAILURE');return db.query(sql,args);}},options);}catch(e){caught=e;}
     assert.match(caught?.message||'',/INJECTED_RECEIPT_FAILURE/);await db.query('ROLLBACK TO SAVEPOINT failure_test');assert.deepEqual(await snapshot(db),before);assert.deepEqual(await artifacts(db),beforeArtifacts);
     console.log(JSON.stringify({mode,stage:'injected-failure-rollback-verified'}));
     await db.query('SAVEPOINT normal_test');
     const sent=await grant(db,options),again=await grant(readonly);assert(again.replayed);assert.deepEqual(again.receipt,sent.receipt);
     await db.query('ROLLBACK TO SAVEPOINT normal_test');assert.deepEqual(await snapshot(db),before);assert.deepEqual(await artifacts(db),beforeArtifacts);
     return {verification:sent.verification,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true};
    }
    return grant(db,options);
   },{rollback:mode==='dry-run'});
   if(mode==='dry-run'){const after=await transaction(()=>artifacts(readonly),{readOnly:true});assert.equal(after.receipt,null);for(const k of ['coins','items','pig','audit'])assert.equal(after[k].length,0);executed.artifactsAfterRollback=after;}
   else await transaction(()=>verify(readonly,executed.receipt),{readOnly:true});
   return executed;
  });
 }
 save(mode,{mode,...result,sourceSha256,runnerSha256,planHash:HASH,checkedAt:new Date().toISOString()});
 console.log(JSON.stringify({mode,...result.verification,account:result.snapshot?.users,sourceSha256,planHash:HASH,rollbackVerified:result.rollbackVerified,injectedFailureRollback:result.injectedFailureRollback,additionalWrites:result.additionalWrites,locksReleased:result.locksReleased,helperDeleted:result.helperDeleted}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({mode,error:String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'),code:e.code}));process.exitCode=1;}finally{await db.end();}
