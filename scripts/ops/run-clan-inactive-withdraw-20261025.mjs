import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {inspectWithdrawal,withdrawInactive,verifyWithdrawal} from './clan-inactive-withdraw-20261025.mjs';
const [mode,directory]=process.argv.slice(2);assert(['read','dry-run','apply','verify'].includes(mode));assert(directory);const out=path.resolve(directory);fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');const db=new pg.Client({connectionString,application_name:'clan-inactive-three-withdraw',connectionTimeoutMillis:15000});
try{
 await db.connect();let result;
 if(mode==='read'||mode==='verify'){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');result=mode==='read'?await inspectWithdrawal(db):await verifyWithdrawal(db);await db.query('ROLLBACK');}
 else{const before=mode==='dry-run'?await inspectWithdrawal(db):null;result=await withdrawInactive(db,{dryRun:mode==='dry-run'});if(before){assert.deepEqual(await inspectWithdrawal(db),before);result.rollbackVerified=true;}else{const replay=await withdrawInactive({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return db.query(sql,args);}});assert(replay.replayed);result.noWriteReplayVerified=true;}}
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode,verified:result.verified,auditId:result.receipt?.auditId,clans:result.clans,protectedUnchanged:result.protectedUnchanged,rollbackVerified:result.rollbackVerified,noWriteReplayVerified:result.noWriteReplayVerified,removed:result.receipt?.targets}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.stack).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
