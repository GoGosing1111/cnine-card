import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {readBloodmoonOpening,enableBloodmoonOpening} from './bloodmoon-opening-20261025.mjs';
const mode=process.argv[2],out=path.resolve(process.argv[3]);assert(['read','dry-run','apply','verify'].includes(mode));fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'bloodmoon-opening-20261025',connectionTimeoutMillis:15000});
try{
 await db.connect();let result;
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');result=await readBloodmoonOpening(db);await db.query('ROLLBACK');
  if(mode==='verify'){assert(result.receipt);assert.equal(result.pack.settings.mode,'ON');}
 }else{
  const before=JSON.parse(fs.readFileSync(path.join(out,'read.json'),'utf8'));
  result=await enableBloodmoonOpening(db,{dryRun:mode==='dry-run',expectedPackSha256:before.packSha256});
  if(mode==='dry-run'){assert.deepEqual(await readBloodmoonOpening(db),Object.fromEntries(Object.entries(before).filter(([key])=>key!=='checkedAt')));result.rollbackVerified=true;}
  else{const replay=await enableBloodmoonOpening({query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql),'Replay must not write');return db.query(sql,args);}});assert(replay.replayed);result.noWriteReplayVerified=true;}
 }
 const record={...result,checkedAt:new Date().toISOString()};fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({mode,status:result.status,revision:result.pack?.revision,packMode:result.pack?.settings.mode,stock:result.stock,replayed:result.replayed,adminLogId:result.receipt?.adminLogId}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
