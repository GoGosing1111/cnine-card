import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import * as op from '../../../scripts/ops/monster-defense-settings-20261026.mjs';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory);assert(['inspect','dry-run','apply','verify','replay'].includes(mode));fs.mkdirSync(out,{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
assert(!fs.existsSync(path.join(out,mode+'-private.json')),'Read the existing result before repeating');
const {Client}=createRequire(import.meta.url)('pg'),raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',windowsHide:true,timeout:30000,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new Client({connectionString,application_name:'defense-coin-settings-20261026',connectionTimeoutMillis:15000}),sqlLog=[];
const readonly=['inspect','verify','replay'].includes(mode),client={query(sql,args){if(readonly)assert(/^SELECT\b/.test(sql));sqlLog.push(sql);return db.query(sql,args);}};
try{
 await db.connect();if(readonly)await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');let result;
 if(mode==='inspect')result=await op.inspect(client);
 else if(mode==='verify')result=await op.verify(client);
 else if(mode==='replay'){result=await op.apply(client);assert(result.replayed);}
 else {const before=JSON.parse(fs.readFileSync(path.join(out,'inspect-private.json'),'utf8'));result=await op.apply(client,{expectedRaw:before.raw,dryRun:mode==='dry-run'});}
 if(readonly)await db.query('ROLLBACK');
 assert(!sqlLog.some(s=>/^(UPDATE|INSERT INTO|DELETE FROM)\s+(users|coin_logs|cnine_user_inventory|inventory_logs)\b/i.test(s)));
 save(mode+'-private.json',result);const r=result.receipt,s=result.settings||r?.after;
 const summary={at:new Date().toISOString(),mode,operationKey:op.OP,revision:s?.revision,modeSetting:s?.mode,rewardsEnabled:s?.rewardsEnabled,difficulties:s?.difficulties,items:result.items,committed:result.committed,rolledBack:result.rolledBack,replayed:result.replayed,auditId:r?.auditId,verified:result.verified||result.verification?.verified,writeStatements:sqlLog.filter(s=>/^(UPDATE|INSERT INTO|DELETE FROM)\b/.test(s)).length,accountWrites:0};save(mode+'.json',summary);console.log(JSON.stringify(summary));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.stack||e).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
