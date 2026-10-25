import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {complete,inspect,verify,PLAN_HASH} from '../../../scripts/ops/showmaker-previous-week-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(path.join(root,'package.json')),pg=require('pg');
const mode=process.argv[2];assert(['read','dry-run','apply','verify'].includes(mode));
const files=['scripts/ops/showmaker-previous-week-20261026.plan.json','scripts/ops/showmaker-previous-week-20261026.mjs','tests/showmaker-previous-week-20261026.test.mjs','docs/qa/showmaker-previous-week-20261026/local-runner.mjs'];
const digest=createHash('sha256');for(const file of files)digest.update(file).update(fs.readFileSync(path.join(root,file)));
const sourceSha=digest.digest('hex'),out=import.meta.dirname;
if(mode==='apply'){const dry=JSON.parse(fs.readFileSync(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha,sourceSha);assert.equal(dry.planHash,PLAN_HASH);assert.equal(dry.result.rollbackVerified,true);assert.equal(dry.result.committed,false);}
let db;
try{
 const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
 db=new pg.Client({connectionString,application_name:'showmaker-previous-week-'+mode,connectionTimeoutMillis:15000});await db.connect();
 let result;
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='12s'");
  if(mode==='read')result=await inspect(db);
  else{
   const verification=await verify(db);let selectQueries=0;
   const readOnly={query:(sql,args)=>{assert.match(sql,/^SELECT\b/);assert(!/FOR UPDATE|FOR SHARE|pg_advisory|nextval/i.test(sql));selectQueries++;return db.query(sql,args);}};
   const replay=await complete(readOnly,{expectedPlanHash:PLAN_HASH,dryRun:false});assert.equal(replay.replayed,true);
   result={verification,replayVerified:true,selectQueries,replayWrites:0};
  }
  await db.query('ROLLBACK');
 }else result=await complete(db,{expectedPlanHash:PLAN_HASH,dryRun:mode==='dry-run'});
 const evidence={checkedAt:new Date().toISOString(),mode,sourceSha,planHash:PLAN_HASH,result};
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,sourceSha,committed:result.committed,rollbackVerified:result.rollbackVerified,verification:result.verification,replayWrites:result.replayWrites,...(mode==='read'?{user:result.users,posts:result.posts.filter(p=>p.week_key==='2026-10-19'),existingTargetMessages:result.messages.length}:{})}));
}catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});console.error(String(error.stack||error).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}
finally{if(db)await db.end();}
