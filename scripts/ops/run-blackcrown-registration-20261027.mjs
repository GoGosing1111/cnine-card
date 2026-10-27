import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {inspectBlackcrownRegistration,registerBlackcrownPack} from './blackcrown-registration-20261027.mjs';
const [mode,directory]=process.argv.slice(2);assert(['read','dry-run','apply','verify'].includes(mode));assert(directory);
const out=path.resolve(directory);fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'blackcrown-registration-20261027',connectionTimeoutMillis:15000});
try{
 await db.connect();let result;
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');result=await inspectBlackcrownRegistration(db);await db.query('ROLLBACK');
  if(mode==='verify')assert(result.receipt);
 }else{
  const before=JSON.parse(fs.readFileSync(path.join(out,'read.json'),'utf8'));
  const options={dryRun:mode==='dry-run',expectedSourceSha256:before.sourceSha256};
  if(mode==='dry-run'){
   await assert.rejects(registerBlackcrownPack(db,{...options,failAfterWrite:true}),/BLACKCROWN_INJECTED_FAILURE/);
   assert.deepEqual(await inspectBlackcrownRegistration(db),Object.fromEntries(Object.entries(before).filter(([k])=>k!=='checkedAt')));
  }
  result=await registerBlackcrownPack(db,options);
  if(mode==='dry-run'){assert.deepEqual(await inspectBlackcrownRegistration(db),Object.fromEntries(Object.entries(before).filter(([k])=>k!=='checkedAt')));result.failureAndDryRunRollbackVerified=true;}
  else{const replay=await registerBlackcrownPack({query:(sql,args)=>{assert(/^SELECT\b/.test(sql),'Replay must be SELECT-only');return db.query(sql,args);}});assert(replay.replayed);result.noWriteReplayVerified=true;}
 }
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({mode,status:result.status,sourceRevision:result.source?.revision,sourceMode:result.source?.settings.mode,prices:result.source?.settings.prices,stock:result.stock,sourceStock:result.sourceStock,packMode:result.pack?.settings.mode,adminLogId:result.receipt?.adminLogId}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
