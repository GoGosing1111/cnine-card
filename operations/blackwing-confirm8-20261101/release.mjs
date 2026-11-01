import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';

const root='C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout';
const out=new URL('./',import.meta.url),mode=process.argv[2];
process.chdir(root);
const git=(...args)=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{encoding:'utf8',windowsHide:true,maxBuffer:40e6}).trim();
const save=(name,value)=>fs.writeFileSync(new URL(name+'.json',out),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const load=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',out)));
const wrangler=path.join(path.dirname(createRequire(root+'/package.json').resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
async function api(suffix){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa'+suffix,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 assert(r.ok,'Cloudflare read failed: '+r.status);return r;
}
async function production(){
 const body=await(await api('/pages/projects/cnine-card')).json();assert(body.success);
 const d=body.result.canonical_deployment;
 return {id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash};
}
if(mode==='prepare'){
 const before=await production();assert.equal(before.status,'success');git('merge-base','--is-ancestor',before.commit,'HEAD');
 const plan={before,base:before.commit,reason:'흑익 용혈 저울의 첫 유효 확정부터 독립된 8초 전원 확정 시간 적용. 최초 단계별 고민 시간 유지, 재확정/재접속 연장 금지, 실패 후 남은 원래 시간과 광폭화 보존. 8개 새 경계 회귀 통과; 배포에서는 수정된 기존 흑익 서버/동시입력/화면 회귀와 전달 검사 및 Worker 컴파일만 실행.',tests:['tests/blackwing-bloodscale-20261028.test.mjs','tests/blackwing-battlefield-20261029.test.mjs','tests/blackwing-raid-20261024.test.mjs','tests/onestore-web-20261026.test.mjs'],checks:['check:worker'],alreadyPassed:['tests/blackwing-confirm-window-20261101.test.mjs'],productionAccountWrites:0,messagesSent:0};
 save('deployment-plan',plan);console.log(JSON.stringify(plan));
}else if(mode==='prepare-retry'){
 const previous=load('deployment-result');assert.equal(previous.exitCode,1);
 const passedLog=fs.readFileSync(new URL(previous.logfile),'utf8');assert(passedLog.includes('ℹ tests 48')&&passedLog.includes('ℹ fail 0')&&passedLog.includes('Pages asset count exceeds'));
 const changed=git('diff','--name-only',previous.head,'HEAD').split('\n').filter(Boolean);
 assert(changed.every(f=>['scripts/prepare-production-assets.mjs','tests/operation-audit-packaging-20261029.test.mjs','docs/qa/blackwing-confirm8-20261101/README.md'].includes(f)),JSON.stringify(changed));
 const original=load('deployment-plan'),plan={...original,reason:original.reason+' 직전 동일게임소스48검사 통과 보존. 문서4개의 배포물 제외만 수정했으므로 해당 포장검사만 추가.',tests:['tests/operation-audit-packaging-20261029.test.mjs'],alreadyPassed:[...original.alreadyPassed,...original.tests],retainedRegressionTests:48,retainedSource:previous.head,packagingOnlyChanges:changed};
 save('deployment-plan-retry',plan);console.log(JSON.stringify(plan));
}else if(mode==='deploy'||mode==='deploy-retry'){
 const retry=mode==='deploy-retry',plan=load(retry?'deployment-plan-retry':'deployment-plan'),head=git('rev-parse','HEAD');
 assert.equal((await production()).commit,plan.base,'Production advanced; review base before deployment');
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');assert.equal(git('rev-parse','origin/main'),head);
 const browser=load('browser-local/browser-battlefield');assert.equal(browser.reports.length,2);assert(browser.reports.every(r=>r.completedAfterPlanning&&r.errors.length===0));
 const logUrl=new URL('deploy-'+head.slice(0,9)+'.log',out),fd=fs.openSync(logUrl,'wx');
 const startedAt=new Date().toISOString();
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'gc.auto',GIT_CONFIG_VALUE_0:'0',GIT_CONFIG_KEY_1:'maintenance.auto',GIT_CONFIG_VALUE_1:'false',SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)}});
 console.log(JSON.stringify({head,base:plan.base,pid:child.pid}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);
 save(retry?'deployment-result-retry':'deployment-result',{head,base:plan.base,exitCode,logfile:logUrl.href,startedAt,finishedAt:new Date().toISOString()});
 console.log(JSON.stringify({head,exitCode}));if(exitCode!==0){console.error(fs.readFileSync(logUrl,'utf8').slice(-14000));process.exitCode=exitCode||1;}
}else if(mode==='verify'){
 const result=load(fs.existsSync(new URL('deployment-result-retry.json',out))?'deployment-result-retry':'deployment-result'),pages=await production();assert.equal(result.exitCode,0);assert.equal(pages.commit,result.head);assert.equal(pages.status,'success');
 const log=fs.readFileSync(new URL(result.logfile),'utf8'),versions=[...log.matchAll(/Current Version ID:\s*([a-f0-9-]+)/g)].map(m=>m[1]);assert.equal(versions.length,2);
 const workers=[];
 for(const[i,name]of ['cnine-card-api-runtime','cnine-card-clan-draft'].entries()){
  const data=await(await api('/workers/scripts/'+name+'/deployments')).json();assert(data.success);assert.deepEqual(data.result.deployments[0].versions,[{version_id:versions[i],percentage:100}]);
  if(i===0){const compiled=await(await api('/workers/scripts/'+name)).text();assert(compiled.includes('confirmationMs = 8e3')||compiled.includes('confirmationMs = 8000'));assert(compiled.includes('scaleDeadline'));}
  workers.push({name,version:versions[i],percentage:100});
 }
 const {htmlForStore}=await import(pathToFileURL(root+'/functions/_onestore_web.js'));
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const files=['index.html','service-worker.js','onestore/index.html','js/blackwing-raid-entry-v1.js','raid/blackwing/inline.mjs','raid/blackwing/battlefield.mjs','raid/blackwing/commands.mjs','raid/blackwing/lobby-ui.mjs'];
 const bytesByPath=new Map(),assets=[];
 for(let i=0;i<files.length;i+=4){
  const batch=await Promise.allSettled(files.slice(i,i+4).map(async file=>{
   const r=await fetch('https://cnine-card.pages.dev/'+file+'?confirm8='+result.head,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,file);
   const bytes=Buffer.from(await r.arrayBuffer()),source=fs.readFileSync(file),expected=file==='onestore/index.html'?Buffer.from(htmlForStore(source.toString(),'/')):source;
   assert.equal(sha(bytes),sha(expected),file);bytesByPath.set(file,bytes);return{file,sha256:sha(bytes),bytes:bytes.length};
  }));
  const failed=batch.filter(r=>r.status==='rejected');if(failed.length)throw new AggregateError(failed.map(r=>r.reason),'Public file verification failed');assets.push(...batch.map(r=>r.value));
 }
 const response=await fetch('https://cnine-card.pages.dev/client/windows/manifest.json?confirm8='+result.head);assert.equal(response.status,200);const manifest=await response.json(),clientFiles=[];
 for(const file of files.filter(f=>f.endsWith('.mjs')||f==='js/blackwing-raid-entry-v1.js')){
  const row=manifest.files.find(f=>f.path==='/'+file);assert(row,file);assert.equal(sha(bytesByPath.get(file)),row.sha256,file);assert.equal(bytesByPath.get(file).length,row.bytes);clientFiles.push({path:row.path,sha256:row.sha256,essential:row.essential});
 }
 const report={at:new Date().toISOString(),pages,workers,assets,clientManifest:{releaseId:manifest.releaseId,files:clientFiles},productionAccountWrites:0,messagesSent:0};save('live-verification',report);console.log(JSON.stringify({pages,workers,publicFiles:assets.length,clientFiles:clientFiles.length}));
}else throw Error('Use prepare, deploy or verify');
