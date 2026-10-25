import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site';
const out='C:/Users/User/.codex/visualizations/2026/10/25/01a172a0-71a0-7d40-a5ca-76b49d420a0e/heukgu-large-head-release';
const temp='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/heukgu-large-head-release-temp-20261025';
const wrangler='C:/Users/User/Downloads/upload/cnine-card/node_modules/wrangler/bin/wrangler.js';
const mode=process.argv[2],git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40e6,windowsHide:true}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');fs.mkdirSync(out,{recursive:true});
const current=()=>JSON.parse(execFileSync(process.execPath,[wrangler,'pages','deployment','list','--project-name','cnine-card','--environment','production','--json'],{cwd:root,encoding:'utf8',timeout:45000,windowsHide:true}))[0];
const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
if(mode==='inspect'){
 const before=current(),base=git('rev-parse',before.Source),head=git('rev-parse','HEAD');git('merge-base','--is-ancestor',base,head);
 const tests=['tests/pet-heukgu-approval-20261025.test.mjs','tests/pet-heukgu-large-head-20261025.test.mjs','tests/pet-heukgu-production-assets-20261025.test.mjs','tests/battle-ground-runes-20261017.test.mjs','tests/battle-feature-recovery-20261015.test.mjs','tests/pve-battlefield-entry-v2117.test.mjs','tests/pet-live-magnet-20261006.test.mjs'];
 const plan={before,base,head,tests,checks:['check:worker'],reason:'흑구 투명 원화 머리 확대 및 PET-HEUKGU 전용 전투 표시 15% 확대. 실제 메인 V3 PC/모바일 3폭 PVE/PVP 6건, 도감/CMS 3폭, 40개 관련 검사 및 구버전 엔진/래퍼 회복 검수. 펫 효과·경제·계정 데이터 보존.',temp,changed:git('diff','--name-only',base,head).split('\n')};save('deployment-plan.json',plan);console.log(JSON.stringify({before,head,base,changed:plan.changed.length,checks:plan.checks}));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json')));assert.equal(current().Id,plan.before.Id,'Production changed; inspect the new base');assert.equal(git('rev-parse','HEAD'),plan.head);assert.equal(git('status','--porcelain','--untracked-files=all'),'');
 const logFile=path.join(out,'deploy.log');assert(!fs.existsSync(logFile),'Preserve prior log');fs.mkdirSync(temp,{recursive:true});
 const fd=fs.openSync(logFile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks),TEMP:temp,TMP:temp};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head:plan.head,base:plan.base,logFile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});fs.closeSync(fd);save('deployment-result.json',{head:plan.head,exitCode,at:new Date().toISOString()});console.log(JSON.stringify({exitCode,head:plan.head}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),result=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),deployment=current();assert.equal(result.exitCode,0);assert.equal(git('rev-parse',deployment.Source),plan.head);
 const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa/pages/projects/cnine-card',{headers:{Authorization:'Bearer '+token}});assert(response.ok);const canonical=(await response.json()).result.canonical_deployment;assert.equal(canonical.id,deployment.Id);assert.equal(canonical.latest_stage.status,'success');assert.equal(canonical.deployment_trigger.metadata.commit_hash,plan.head);
 const build=JSON.parse(fs.readFileSync(path.join(root,'preview/project-v-v3/grid-build-report.json'))),approval=JSON.parse(fs.readFileSync(path.join(root,'docs/qa/pet-heukgu-large-head-20261025/approval-20261025.json')));
 const files=['index.html','service-worker.js','js/app.js','js/battle-v3-live.js','shared/pet-art-catalog-v1.mjs','css/pet-equipment-v1.css','pets/index.html','pet-codex/index.html',approval.assets[0].approvedAsset,approval.previousApprovedAsset,...build.outputs.map(r=>r.file)];
 const checks=[];for(const file of [...new Set(files)]){const r=await fetch('https://cnine-card.pages.dev/'+file+'?qa='+plan.head);assert(r.ok,file);const remote=Buffer.from(await r.arrayBuffer()),local=fs.readFileSync(path.join(root,file));assert.equal(hash(remote),hash(local),file);checks.push({file,status:r.status,sha256:hash(local),bytes:local.length});}
 const record={at:new Date().toISOString(),head:plan.head,deployment,canonicalStatus:canonical.latest_stage.status,publicFiles:checks,assetSha256:approval.assets[0].sha256,accountGrants:0};save('public-verification.json',record);console.log(JSON.stringify({head:plan.head,deployment:deployment.Id,files:checks.length,assetSha256:record.assetSha256}));
}else throw Error('Use inspect, deploy or verify');
