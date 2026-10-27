import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {snapshot,compact,receipt,QA,OP,TARGETS,hash} from '../../../scripts/ops/blackcrown-reversal-20261027.mjs';
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,'');const uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'blackcrown-reversal-read',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query("SET statement_timeout='20s'");await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const s=await snapshot(db),prior=await receipt(db);await db.query('ROLLBACK');
 const report={checkedAt:new Date().toISOString(),readOnly:true,prior,...compact(s)};
 fs.writeFileSync(QA+'/read.json',JSON.stringify(report,null,2));
 const backup='C:/Users/User/.codex/visualizations/2026/10/27/01a17ab9-a03a-79f2-bb14-19ce5c1ac967/blackcrown-reversal-before.json';if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(s,null,2));
 const plan={operationKey:OP,authorization:'전체 환급 후 획득물 회수',totalRefund:'11049000000000',totalDraws:7366,targets:TARGETS.map(t=>({...t,identity:s.identities.filter(i=>i.userId===t.userId),nickname:s.users.find(u=>u.id===t.userId).nickname})),sourceEvidenceHash:hash(s.evidence)};
 if(!fs.existsSync(QA+'/plan.json'))fs.writeFileSync(QA+'/plan.json',JSON.stringify(plan,null,2));
 console.log(JSON.stringify({users:report.users,targets:report.targets.map(t=>({userId:t.userId,refund:t.refund,cardCount:Object.values(t.cards).reduce((a,b)=>a+b,0),minRemaining:Math.min(...t.holdings.map(h=>h.remaining))})),packageAccounting:s.packageAccounting,prior,sourceEvidenceHash:plan.sourceEvidenceHash}));
}catch(error){console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
