import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd();
const account='1e7c59450a8b6e34a9d87f92ca02aeaa',site='https://cnine-card.pages.dev',deadline=Date.parse('2026-10-27T00:00:00+09:00');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:40e6}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
const publicFiles=['index.html','service-worker.js','js/adventure-lobby-v2107.js','js/server-support-v1.mjs','js/support-package-v1.mjs','shared/support-package-v1.mjs','onestore/index.html','js/support-package-alerts-v1.mjs','admin/support-package-admin-v1.mjs','css/support-package-v1.css'];
async function cf(endpoint){const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+endpoint,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});assert(response.ok,endpoint);return response;}
async function state(){const body=await (await cf('/pages/projects/cnine-card')).json();assert(body.success);const d=body.result.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
if(mode==='inspect'){
 const before=await state();save('before-deploy.json',before);
 save('deployment-plan.json',{base:before.pages.commit,reason:'Hide the 49,800 KRW package automatically at 2026-10-27 00:00 KST. Server time closes new applications and navigation while committed request replay and pending OWNER fulfillment stay unchanged. Validate exact boundary, lock delay, existing package atomicity and 1+1 receipts; local desktop/mobile screens and ONE store generated variants verified separately.',tests:['tests/support-package-hide-20261026.test.mjs','tests/support-package-20261020.test.mjs','tests/support-package-bogo-20261025.test.mjs'],checks:['check:worker']});
 console.log(JSON.stringify(before));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));assert.equal((await state()).pages.commit,plan.base,'Production advanced; inspect and reconcile first');
 const fd=fs.openSync(logfile,'w'),env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'||mode==='midnight'){
 if(mode==='midnight')assert(Date.now()>=deadline,'The midnight check must not run early');
 const execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),after=await state();assert.equal(execution.exitCode,0);assert.equal(after.pages.status,'success');assert.equal(git('merge-base',execution.head,after.pages.commit),execution.head);
 const fileChecks=await Promise.all(publicFiles.map(async file=>{
  const response=await fetch(site+'/'+file+'?packageHideVerify='+Date.now(),{signal:AbortSignal.timeout(45000)});assert(response.ok,file);const text=(await response.text()).replaceAll('\r\n','\n');
  // Later unrelated releases may change the shell, but the package gate must match.
  const relevant=mode==='verify'||['js/server-support-v1.mjs','js/support-package-v1.mjs','shared/support-package-v1.mjs'].includes(file);
  if(relevant){let expected=execFileSync('git',['show',execution.head+':'+file],{encoding:'utf8',windowsHide:true,maxBuffer:10e6});if(file==='onestore/index.html'){const {htmlForStore}=await import('../../../functions/_onestore_web.js');expected=htmlForStore(expected,'/');}assert.equal(hash(text),hash(expected),file);}
  if(mode==='verify'){const dest=path.join(out,'public-source',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}
  if(file==='shared/support-package-v1.mjs'){
   const product=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
   assert.equal(product.SUPPORT_PACKAGE_SALES_ENDS_AT,deadline);assert.equal(product.supportPackageSalesOpen(deadline-1),true);assert.equal(product.supportPackageSalesOpen(deadline),false);
   assert.equal(product.supportPackageSalesOpen(Date.now()),Date.now()<deadline);
  }
  return {file,sha256:hash(text),matchesRelease:relevant};
 }));
 const workers=[],expectedVersions=[...fs.readFileSync(path.join(out,'deploy.log'),'utf8').matchAll(/Current Version ID: ([a-f0-9-]+)/g)].map(m=>m[1]);assert.equal(expectedVersions.length,2);
 for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){
  const packageGatePresent=name==='cnine-card-api-runtime';
  if(packageGatePresent){const body=await (await cf('/workers/scripts/'+name)).text();assert.match(body,/if\s*\(!supportPackageSalesOpen\(now\d*\)\)\s*fail\d*\("CLOSED"/);assert.match(body,/packageVisible:[^\n]*supportPackageSalesOpen\(now\d*\)/);assert(body.includes('2026-10-27T00:00:00+09:00'));}
  const versions=await (await cf('/workers/scripts/'+name+'/deployments')).json();assert(versions.success);const latest=versions.result.deployments[0];assert.equal(latest.versions.length,1);assert.equal(latest.versions[0].percentage,100);if(mode==='verify')assert.equal(latest.versions[0].version_id,expectedVersions[workers.length]);workers.push({name,packageGatePresent,deploymentId:latest.id,createdOn:latest.created_on,versionId:latest.versions[0].version_id,percentage:100});
 }
 const api=await fetch(site+'/api/server-support/package',{signal:AbortSignal.timeout(30000)});assert.equal(api.status,401);
 const report={...after,releaseCommit:execution.head,deadline:'2026-10-27T00:00:00+09:00',salesOpenAtCheck:Date.now()<deadline,publicFiles:fileChecks,workers,unauthenticatedStatus:api.status,operationalAccountWrites:0,operationalSettingsWrites:0};
 save(mode==='midnight'?'midnight-verification.json':'live-verification.json',report);console.log(JSON.stringify({pages:after.pages,checkedAt:after.at,salesOpenAtCheck:report.salesOpenAtCheck,publicFiles:fileChecks.length,workers:workers.map(w=>w.name)}));
}else throw Error('Use inspect|deploy|verify|midnight');
