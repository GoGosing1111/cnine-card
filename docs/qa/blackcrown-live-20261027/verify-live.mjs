import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.join(root,'docs/qa/blackcrown-live-20261027'),origin='https://cnine-card.pages.dev',account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const release='4f86b306c27c507fa4fed2f424e5fe47e8489d82',base='84c41277d64cf0ab0e389a65838fdb61dba307cb';
const hash=x=>createHash('sha256').update(x).digest('hex');
const load=p=>import(pathToFileURL(path.join(root,p)).href);
const {BLACKCROWN_MERCENARIES:cards}=await load('shared/mercenary-blackcrown-catalog-v1.mjs');
const {BLACKCROWN_PACK}=await load('shared/mercenary-blackcrown-pack-v1.mjs');
const {isProductionFile}=await load('scripts/prepare-production-assets.mjs');
const {htmlForStore}=await load('functions/_onestore_web.js');
const require=createRequire(path.join(root,'package.json'));
const wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const api=async p=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});assert(r.ok,'Cloudflare '+r.status);return r;};
const cloud=await(await api('/pages/projects/cnine-card')).json();assert(cloud.success);
const deployment=cloud.result.canonical_deployment;
assert.equal(deployment.deployment_trigger.metadata.commit_hash,release);assert.equal(deployment.latest_stage.status,'success');
const workers=[];
for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){
 const source=await(await api('/workers/scripts/'+name)).text();
 for(const text of ['blackcrown-live-20261027-v1','BLACKCROWN_AUTHORED_CAST','MERCENARY_BLACKCROWN_CAST','resolveBlackcrownCast','V-950','V-955'])assert(source.includes(text),name+' missing '+text);
 const active=await(await api('/workers/scripts/'+name+'/deployments')).json();assert(active.success);
 const latest=active.result.deployments?.[0];assert(latest?.versions?.some(v=>v.percentage===100));
 workers.push({name,sourceSha256:hash(source),activeDeployment:latest});
}
const changed=execFileSync('git',['diff','--name-only',base,release],{encoding:'utf8',maxBuffer:40000000}).trim().split(/\r?\n/);
const directory='assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2';
const files=[...new Set([...changed.filter(f=>isProductionFile(f)&&/\.(?:js|mjs|json|html)$/.test(f)&&!f.startsWith('functions/')&&!f.startsWith('workers/')),...cards.flatMap(c=>[c.sourceArt,c.battleSprite]),...fs.readdirSync(directory).filter(f=>f.endsWith('.png')).map(f=>directory+'/'+f)])];
const publicFiles=[];
for(let i=0;i<files.length;i+=4){
 publicFiles.push(...await Promise.all(files.slice(i,i+4).map(async file=>{
  const r=await fetch(origin+'/'+file+'?verify='+release,{signal:AbortSignal.timeout(60000)});assert(r.ok,file+' '+r.status);
  const binary=file.endsWith('.png'),raw=Buffer.from(await r.arrayBuffer()),expected=fs.readFileSync(file);
  const store=file==='onestore/index.html',expectedText=binary?'':expected.toString('utf8').replaceAll('\r\n','\n');
  const actualHash=hash(binary?raw:raw.toString('utf8').replaceAll('\r\n','\n')),expectedHash=hash(binary?expected:store?htmlForStore(expectedText,'/'):expectedText);
  assert.equal(actualHash,expectedHash,file);return {file,sha256:actualHash,encoding:binary?'BYTES':store?'UTF8_LF_STORE_TRANSFORM':'UTF8_LF'};
 })));
}
const codexResponse=await fetch(origin+'/api/mercenary-codex?verify='+release,{signal:AbortSignal.timeout(30000)});assert(codexResponse.ok);
const catalog=await codexResponse.json(),liveCards=catalog.cards.filter(c=>c.season==='BLACKCROWN');assert.equal(liveCards.length,6);
for(const card of liveCards){const expected=cards.find(c=>c.code===card.code);assert(expected);assert.equal(card.basePower,356400);assert.equal(card.deploymentEnabled,true);assert.equal(card.skills.length,2);assert.equal(card.serverLimit,10);assert.equal(card.battlePresentation.motionSpeed,2);assert.equal(card.battlePresentation.bodyHeight,285);assert.equal(card.battleSprite,expected.battleSprite);assert.deepEqual(card.skills.map(s=>({id:s.id,balance:s.balance,ready:s.ready})),expected.skills.map(s=>({id:s.id,balance:s.balance,ready:s.ready})));}
const features=await fetch(origin+'/api/'+BLACKCROWN_PACK.featurePath+'?verify='+release,{signal:AbortSignal.timeout(30000)}),featureBody=await features.json();assert([200,401,503].includes(features.status));
const status=await fetch(origin+'/api/service/status',{signal:AbortSignal.timeout(30000)});assert(status.ok);const service=await status.json();
const result={at:new Date().toISOString(),releaseCommit:release,pages:{id:deployment.id,url:deployment.url,status:deployment.latest_stage.status,commit:deployment.deployment_trigger.metadata.commit_hash},workers,publicFiles,cards:liveCards.map(c=>({code:c.code,basePower:c.basePower,deploymentEnabled:c.deploymentEnabled,skills:c.skills.map(s=>({id:s.id,name:s.name,balance:s.balance})),battleSprite:c.battleSprite,motionSpeed:c.battlePresentation.motionSpeed,bodyHeight:c.battlePresentation.bodyHeight})),featureGate:{path:BLACKCROWN_PACK.featurePath,status:features.status,error:featureBody.error,maintenance:featureBody.maintenance},serviceStatus:{status:status.status,maintenance:service.maintenance},operationalAccountWrites:0};
fs.writeFileSync(path.join(out,'live-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pages:result.pages,workers:workers.map(w=>({name:w.name,versions:w.activeDeployment.versions})),files:publicFiles.length,cards:liveCards.length,featureGate:result.featureGate}));
