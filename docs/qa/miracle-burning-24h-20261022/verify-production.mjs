import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const out='docs/qa/miracle-burning-24h-20261022/',wrangler='C:/Users/User/.codex/worktrees/node_modules/wrangler/bin/wrangler.js';
const cli=args=>JSON.parse(execFileSync(process.execPath,[wrangler,...args,'--json'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']}));
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),pages=cli(['pages','deployment','list','--project-name','cnine-card','--environment','production'])[0];
assert(source.startsWith(pages.Source),'Expected release must be active');
const files=[];
for(const path of ['admin/index.html','admin/miracle-burning-admin.js','preview/miracle-burning-v1/admin.html']){
 const r=await fetch('https://cnine-card.pages.dev/'+path+'?verify=miracle24-'+source.slice(0,9),{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);
 const text=(await r.text()).replace(/\r\n/g,'\n'),expected=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');assert.equal(text,expected,path);
 files.push({path,status:200,sha256:createHash('sha256').update(text).digest('hex'),normalization:'CRLF to LF'});
}
const log=fs.readFileSync('C:/Users/User/.codex/operation-cache-archive/miracle-burning-24h-20261022-deploy.log','utf8');
const versions=[...log.matchAll(/Current Version ID: ([a-f0-9-]+)/g)].map(m=>m[1]);assert.equal(versions.length,2);
const workers=[];
for(const [index,config] of ['workers/api-runtime/wrangler.jsonc','workers/clan-draft/wrangler.jsonc'].entries()){
 const active=cli(['deployments','list','--config',config]).sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];
 assert(active.versions.some(v=>v.version_id===versions[index]&&v.percentage===100),config);workers.push({config,deploymentId:active.id,createdAt:active.created_on,versions:active.versions});
}
const eventResponse=await fetch('https://cnine-card.pages.dev/api/burning-event/status?_='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(eventResponse.status,200);const event=await eventResponse.json();
const before=JSON.parse(fs.readFileSync(out+'preflight.json')),fields=['mode','generation','activatedAt','endsAt','durationMinutes','battleRewardMultiplier'];
const unchanged=fields.every(k=>JSON.stringify(before.burningEvent[k])===JSON.stringify(event.burningEvent[k]));assert(unchanged,'Operator settings changed during deployment; review separately');
const auth=await fetch('https://cnine-card.pages.dev/api/admin/miracle-burning-event?_='+Date.now(),{signal:AbortSignal.timeout(20000)});assert.equal(auth.status,401);
const report={checkedAt:new Date().toISOString(),source,base:'59e06042e907ef9d12e518d142250cf07925e5c7',pages,workers,files,tests:11,browserWidths:[1440,390],unauthenticatedAdminStatus:auth.status,publicEventUnchanged:unchanged,burningEvent:event.burningEvent,operationWrites:0};
fs.writeFileSync(out+'production.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({source,pages:pages.Id,files:files.length,tests:11,publicEventUnchanged:unchanged,operationWrites:0}));
