import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root='C:/Users/User/Downloads/upload/cnine-card/output/helios-heukmu-balance-20261106/source';
const out=new URL('./',import.meta.url);
const execution=JSON.parse(fs.readFileSync(new URL('deployment-result.json',out)));
const publicReport=JSON.parse(fs.readFileSync(new URL('live-verification.json',out)));
assert.equal(execution.exitCode,0);
assert.equal(publicReport.releaseCommit,execution.head);
const log=fs.readFileSync(execution.logfile,'utf8');
const versions=[...log.matchAll(/Current Version ID:\s*([a-f0-9-]+)/g)].map(m=>m[1]);
assert.equal(versions.length,2);
const wrangler=path.join(path.dirname(createRequire(root+'/package.json').resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const token=auth.token||auth.apiToken||auth.oauthToken;
assert(token);
const workers=[];
for(const [i,name]of ['cnine-card-api-runtime','cnine-card-clan-draft'].entries()){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa/workers/scripts/'+name+'/deployments',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 assert(response.ok);
 const data=await response.json();
 assert(data.success);
 assert.deepEqual(data.result.deployments[0].versions,[{version_id:versions[i],percentage:100}]);
 workers.push({name,version:versions[i],percentage:100});
}
const response=await fetch('https://cnine-card.pages.dev/client/windows/manifest.json?hakuya='+execution.head,{signal:AbortSignal.timeout(30000)});
assert(response.ok);
const manifest=await response.json(),files=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const {file} of publicReport.publicFiles){
 const row=manifest.files.find(r=>r.path==='/'+file);
 if(!row)continue;
 const bytes=execFileSync('git',['show',execution.head+':'+file],{cwd:root,maxBuffer:64e6,windowsHide:true});
 const local=fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file)):bytes;
 assert([hash(bytes),hash(local)].includes(row.sha256),file+' Windows hash');
 files.push(row);
}
for(const required of ['js/battle-v3-live.js','shared/mercenary-helios-king-v1.mjs','preview/project-v-v3/project-v-pixi-battle.bundle.js'])assert(files.some(r=>r.path==='/'+required),required);
const result={at:new Date().toISOString(),releaseCommit:execution.head,workers,windows:{releaseId:manifest.releaseId,files},assetCount:Number([...log.matchAll(/Pages delivery: (\d+) files/g)].at(-1)?.[1]),operationalAccountWrites:0};
fs.writeFileSync(new URL('delivery-verification.json',out),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({workers,windowsFiles:files.length,windowsReleaseId:manifest.releaseId,assetCount:result.assetCount}));
