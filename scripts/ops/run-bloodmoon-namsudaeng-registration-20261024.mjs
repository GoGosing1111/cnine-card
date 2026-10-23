import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {readNamsudaengRegistration,registerNamsudaengStock} from './bloodmoon-namsudaeng-registration-20261024.mjs';
const mode=process.argv[2];assert(['read','dry-run','apply','verify'].includes(mode));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'bloodmoon-namsudaeng-20261024',connectionTimeoutMillis:15000});
try{
 await db.connect();let result;
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');result=await readNamsudaengRegistration(db);await db.query('ROLLBACK');
  if(mode==='verify'){assert.equal(result.stock[0]?.limit,10);assert(result.receipt);}
 }else{
  const before=await readNamsudaengRegistration(db);result=await registerNamsudaengStock(db,{dryRun:mode==='dry-run'});
  if(mode==='dry-run'){assert.deepEqual(await readNamsudaengRegistration(db),before);result.rollbackVerified=true;}
  else {const replay=await registerNamsudaengStock({query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql),'Replay must not write');return db.query(sql,args);}});assert(replay.replayed);result.noWriteReplayVerified=true;}
 }
 const out='docs/qa/bloodmoon-namsudaeng-live-20261024';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/'+mode+'.json',JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({mode,...result}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
