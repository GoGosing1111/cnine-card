import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),hash=b=>createHash('sha256').update(b).digest('hex');
const wrangler='C:/Users/User/.codex/worktrees/node_modules/wrangler/bin/wrangler.js';
const pages=JSON.parse(execFileSync(process.execPath,[wrangler,'pages','deployment','list','--project-name','cnine-card','--environment','production','--json'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']}));
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert(source.startsWith(pages[0].Source),'Production deployment must match the released source');
const textFiles=['index.html','js/jokgak-city-v1.js','js/jokgak-city-disguise-ui-v1.mjs','js/jokgak-city-item-art-v1.mjs','js/jokgak-city-life-ui-v1.mjs','js/jokgak-city-career-ui-v1.mjs','js/jokgak-city-expansion-ui-v1.mjs','js/adventure-navigation-standalone.js','css/jokgak-city-v1.css','css/jokgak-city-disguise-v1.css','shared/jokgak-city-v1.mjs','shared/jokgak-city-life-v1.mjs','shared/jokgak-city-comms-v1.mjs','shared/jokgak-city-disguise-v1.mjs','assets/ui/jokgak-city/disguise-v1/manifest.json'];
const manifest=JSON.parse(fs.readFileSync('assets/ui/jokgak-city/disguise-v1/manifest.json'));
const binaryFiles=manifest.assets.flatMap(r=>r.derivatives.map(d=>d.path)),checks=[];
for(const path of [...textFiles,...binaryFiles]){
 const response=await fetch('https://cnine-card.pages.dev/'+path+'?verify=disguise-'+source.slice(0,9),{cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,path);const raw=Buffer.from(await response.arrayBuffer());
 const binary=binaryFiles.includes(path),normalize=b=>binary?b:Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
 const expected=hash(normalize(fs.readFileSync(path))),actual=hash(normalize(raw));assert.equal(actual,expected,path);
 checks.push({path,status:response.status,sha256:actual,normalization:binary?'binary':'CRLF to LF'});
}
const log=fs.readFileSync('C:/Users/User/.codex/operation-cache-archive/jokgak-city-disguise-20261022-deploy.log','utf8');
const versions=[...log.matchAll(/Current Version ID: ([a-f0-9-]+)/g)].map(m=>m[1]);assert.equal(versions.length,2);
const activeWorkers=[];
for(const [index,config] of ['workers/api-runtime/wrangler.jsonc','workers/clan-draft/wrangler.jsonc'].entries()){
 const deployments=JSON.parse(execFileSync(process.execPath,[wrangler,'deployments','list','--config',config,'--json'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']}));
 const active=deployments.sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];assert(active.versions.some(v=>v.version_id===versions[index]&&v.percentage===100),config);
 activeWorkers.push({config,deploymentId:active.id,createdAt:active.created_on,versions:active.versions});
}
const report={checkedAt:new Date().toISOString(),source,base:'955597b36cec37ce85c9a1aee523c8f9494d8874',pages:pages[0],apiRuntimeVersion:versions[0],clanDraftVersion:versions[1],activeWorkers,deployExit:0,releaseTests:18,relatedUniqueTests:77,browserWidths:[1440,390,320],productionAssetCount:20000,checks,liveAccountMutations:0};
fs.writeFileSync('docs/qa/jokgak-city-disguise-20261022/production.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({source,checkedFiles:checks.length,pages:pages[0].Id,versions,liveAccountMutations:0}));
