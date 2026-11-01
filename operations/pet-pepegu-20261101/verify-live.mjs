import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root='C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout';
const execution=JSON.parse(fs.readFileSync(new URL('./deployment-result.json',import.meta.url)));assert.equal(execution.exitCode,0);
const sha=b=>createHash('sha256').update(b).digest('hex');
const wrangler=path.join(path.dirname(createRequire(root+'/package.json').resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const api=async suffix=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa'+suffix,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const body=await r.json();assert(r.ok&&body.success,'Cloudflare read-only request failed');return body.result;};
const d=(await api('/pages/projects/cnine-card')).canonical_deployment;
const pages={id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash};
assert.equal(pages.commit,execution.source);assert.equal(pages.status,'success');
const log=fs.readFileSync(new URL('./deploy-'+execution.source.slice(0,9)+'.log',import.meta.url),'utf8');
const versions=[...log.matchAll(/Current Version ID:\s*([a-f0-9-]+)/g)].map(m=>m[1]);assert.equal(versions.length,2);
const workers=[];
for(const [i,name]of ['cnine-card-api-runtime','cnine-card-clan-draft'].entries()){
 const state=await api('/workers/scripts/'+name+'/deployments');assert.deepEqual(state.deployments[0].versions,[{version_id:versions[i],percentage:100}]);workers.push({name,version:versions[i],percentage:100});
}
const {htmlForStore}=await import(pathToFileURL(root+'/functions/_onestore_web.js'));
const files=['assets/ui/pets/pepegu-20261101/pet-pepegu-approved.png','shared/pet-art-catalog-v1.mjs','css/pet-equipment-v1.css','index.html','service-worker.js','pet-codex/index.html','pets/index.html','onestore/index.html','onestore/js/app.js','shared/onestore-web-assets-v1.mjs','js/app.js','js/battle-v3-live.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/scrapyard-v3-v1/battle.bundle.js','preview/cow-room-v3-v1/battle.bundle.js','preview/infinite-tower-v3-v1/battle.bundle.js','pve-v3/battle.bundle.js','preview/v3-wide-grid-v1/battle.bundle.js','preview/boss-resources-v2048/lab.bundle.js','preview/battle-suit-skill-chip-v1/skill-chip-lab.bundle.js','preview/project-v-mercenary-system-v1/skills.bundle.js','preview/coop-defense-v1/defense.bundle.js','preview/sustained-hunt-v2/battle.bundle.js'];
const publicBytes=new Map(),assets=[];
for(let i=0;i<files.length;i+=4){
 const results=await Promise.allSettled(files.slice(i,i+4).map(async file=>{
  const response=await fetch('https://cnine-card.pages.dev/'+file+'?pepeguVerify='+execution.source,{signal:AbortSignal.timeout(45000)});assert.equal(response.status,200,file);
  const bytes=Buffer.from(await response.arrayBuffer()),source=fs.readFileSync(path.join(root,file)),expected=file==='onestore/index.html'?Buffer.from(htmlForStore(source.toString(),'/')):source;
  assert.equal(sha(bytes),sha(expected),file);publicBytes.set(file,bytes);return {file,sha256:sha(bytes),bytes:bytes.length,serverTransformed:file==='onestore/index.html'};
 }));
 const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'Public file mismatch');
 assets.push(...results.map(r=>r.value));
}
const m=await fetch('https://cnine-card.pages.dev/client/windows/manifest.json?pepeguVerify='+execution.source);assert.equal(m.status,200);
const manifest=await m.json(),clientFiles=[];
for(const file of ['js/app.js','js/battle-v3-live.js','preview/project-v-v3/project-v-pixi-battle.bundle.js']){
 const row=manifest.files.find(f=>f.path==='/'+file);assert(row?.essential,file);const bytes=publicBytes.get(file);assert.equal(sha(bytes),row.sha256,file);assert.equal(bytes.length,row.bytes);clientFiles.push({path:row.path,sha256:row.sha256,essential:row.essential});
}
const result={status:'VERIFIED',sourceCommit:execution.source,pages,workers,assets,clientManifest:{releaseId:manifest.releaseId,files:clientFiles},scopedTests:Number(log.match(/ℹ tests (\d+)/)?.[1]),checkedAt:new Date().toISOString(),productionAccountWrites:0,messagesSent:0};
fs.writeFileSync(new URL('./live-verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,source:execution.source,pages,workers,files:assets.length,clientFiles:clientFiles.length,scopedTests:result.scopedTests}));
