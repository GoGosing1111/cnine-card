// Explicit 2026-10-19 user approval: release Bathory, half odds, +1 sold-out SS stock.
import {execFileSync} from 'node:child_process';import fs from 'node:fs/promises';import pg from 'pg';
import {launchHalloweenBathory,verifyHalloweenBathoryLaunch} from './halloween-bathory-launch-20261019.mjs';
const [mode,expectedDocumentHash,approvalReference]=process.argv.slice(2);
if(!['dry-run','apply','verify'].includes(mode))throw Error('Expected dry-run|apply|verify [current document SHA256] [user approval reference]');
if(mode!=='verify'&&!/^[a-f0-9]{64}$/.test(expectedDocumentHash||''))throw Error('Fresh pack document hash required');
if(mode==='apply'&&!String(approvalReference||'').trim())throw Error('User release approval reference required');
const raw=execFileSync(process.execPath,[process.env.BATHORY_NEON_CLI||'C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','neondb_owner','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);if(!url.hostname.endsWith('.neon.tech')||url.pathname!='/cnine')throw Error('Unexpected database destination');
const db=new pg.Client({connectionString,application_name:'bathory-approved-launch',connectionTimeoutMillis:10000});
try{await db.connect();const result=mode==='verify'?await verifyHalloweenBathoryLaunch(db):await launchHalloweenBathory(db,{dryRun:mode==='dry-run',expectedDocumentHash,approvalReference});
 if(process.env.BATHORY_RECEIPT_PATH)await fs.writeFile(process.env.BATHORY_RECEIPT_PATH,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:result.status,mode,replayed:result.replayed??false,stock:result.stock,revision:result.currentRevision,completedAt:result.receipt.completedAt,bathoryRatePpm:result.receipt.bathoryRatePpm,totalAdded:result.receipt.totalAdded,grants:0}));
}catch(error){console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await db.end();}
