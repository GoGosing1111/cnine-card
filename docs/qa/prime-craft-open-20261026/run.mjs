import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {activate,inspect,verify,protectedState,hash,OP} from '../../../scripts/ops/prime-craft-open-20261026.mjs';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {decorateMercenaryCraft} from '../../../functions/_mercenary_craft.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),require=createRequire(root+'/package.json'),[mode,destination]=process.argv.slice(2),out=path.resolve(destination);
assert(['read','dry-run','apply','verify'].includes(mode));fs.mkdirSync(out,{recursive:true});
const save=(name,data)=>fs.writeFileSync(out+'/'+name,JSON.stringify(data,null,2)+'\n');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),u=new URL(connectionString);assert(u.hostname.endsWith('.neon.tech')&&u.pathname==='/cnine');
const connect=async()=>{const c=new(require('pg').Client)({connectionString,application_name:'prime-craft-open-'+mode,connectionTimeoutMillis:15000});await c.connect();return c;};
const read=async(c,work)=>{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{return await work();}finally{await c.query('ROLLBACK');}};
let c;try{
 c=await connect();
 if(mode==='read'){
  const before=await read(c,async()=>({...await inspect(c),protectedHash:hash(await protectedState(c))}));save('before.json',before);console.log(JSON.stringify({policy:before.policy,recipeId:before.recipe.id,receipt:!!before.receipt}));
 }else if(mode==='dry-run'||mode==='apply'){
  const before=JSON.parse(fs.readFileSync(out+'/before.json','utf8')),sourceHash=hash(fs.readFileSync(root+'/scripts/ops/prime-craft-open-20261026.mjs','utf8'));
  if(mode==='apply'){
   const dry=JSON.parse(fs.readFileSync(out+'/dry-run.json','utf8'));assert(dry.rolledBack);assert.equal(dry.sourceHash,sourceHash);
   const deployed=JSON.parse(fs.readFileSync(out+'/live-verification.json','utf8'));assert.equal(deployed.workers.length,2);assert(deployed.workers.every(w=>w.primeCraftReleased&&w.materialGuardPreserved));
  }
  const result=await activate(c,{expectedRaw:before.raw,dryRun:mode==='dry-run'});save(mode==='dry-run'?'dry-run.json':'production.json',{...result,sourceHash});
  if(mode==='apply'){await c.end();c=await connect();const checked=await read(c,()=>verify(c));save('verification.json',checked);const replay=await activate({query(sql,args){assert.match(sql,/^SELECT/);return c.query(sql,args);}});assert(replay.replayed);save('replay.json',{replayed:true,auditId:replay.auditId,additionalWrites:0});}
  console.log(JSON.stringify({committed:result.committed,rolledBack:result.rolledBack,replayed:result.replayed,auditId:result.receipt.auditId,policy:result.receipt.after.policy,accountWrites:0}));
 }else{
  const checked=await read(c,async()=>{const result=await verify(c);const env={DB:new __postgresCompatTest.PostgresD1Database(c)};const row=(await decorateMercenaryCraft(env,[])).find(r=>r.code==='WORKSHOP_PRIME_REQUIEM');assert(row);assert.equal(row.craftLocked,false);assert.equal(row.craftConfiguredActive,true);assert.equal(row.craftReleaseLocked,false);return {...result,userRecipe:row};});save('independent-verification.json',checked);console.log(JSON.stringify({verified:true,auditId:checked.auditId,recipeId:checked.recipeId,policy:checked.policy,craftLocked:checked.userRecipe.craftLocked}));
 }
}catch(e){console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));process.exitCode=1;}finally{await c?.end().catch(()=>{});}
