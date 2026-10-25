import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd(),account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',windowsHide:true,maxBuffer:32e6}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const files=['shared/support-package-v1.mjs','functions/_support_package.js','js/support-package-v1.mjs','admin/support-package-admin-v1.mjs','css/support-package-v1.css','js/support-package-alerts-v1.mjs','js/server-support-v1.mjs','admin/server-support-admin-v1.mjs','admin/index.html','js/adventure-lobby-v2107.js','index.html','service-worker.js'];
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
async function state(){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/pages/projects/cnine-card',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)}),data=await r.json();assert(r.ok&&data.success);const d=data.result.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
if(mode==='inspect'){
 const before=await state();save('before-deploy.json',before);
 const plan={base:before.pages.commit,reason:'49,800원 1+1 이벤트 종료 시각을 2026-10-27 00:00 한국시간으로 표시. 상품/지급 객체·기존 영수증·지급 수량 불변, 구매 화면·진입·입금/OWNER 안내·후원관리 문구 및 캐시만 변경. 기존 패키지 원자 거래/영수증 회귀 11개와 Worker 컴파일을 선택, PC/모바일 화면 검수 별도 수행.',tests:['tests/support-package-20261020.test.mjs','tests/support-package-bogo-20261025.test.mjs'],checks:['check:worker'],files};
 save('deployment-plan.json',plan);console.log(JSON.stringify(before));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));assert.equal((await state()).pages.commit,plan.base,'Production advanced; inspect latest before deploying');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,pid:child.pid,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),after=await state();assert.equal(execution.exitCode,0);assert.equal(git('merge-base',execution.head,after.pages.commit),execution.head);assert.equal(after.pages.status,'success');
 const checks=await Promise.all(files.filter(p=>!p.startsWith('functions/')).map(async file=>{const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+execution.head,{signal:AbortSignal.timeout(30000)});assert(r.ok,file);const bytes=Buffer.from(await r.arrayBuffer()),local=fs.readFileSync(file);assert.equal(hash(bytes.toString('utf8').replaceAll('\r\n','\n')),hash(local.toString('utf8').replaceAll('\r\n','\n')),file);return {file,publicSha256:hash(bytes),localSha256:hash(local)};}));
 const workers=[];for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});assert(r.ok);const body=await r.text();assert(body.includes('SUPPORT_PACKAGE_EVENT_DEADLINE'));assert(body.includes('2026-10-27T00:00:00+09:00'));workers.push({name,deadlineCode:true});}
 const api=await fetch('https://cnine-card.pages.dev/api/server-support/package',{signal:AbortSignal.timeout(25000)});assert.equal(api.status,401);
 save('live-verification.json',{...after,releaseCommit:execution.head,publicFiles:checks,workers,unauthenticatedStatus:api.status,operationalAccountWrites:0,automaticExpiryAdded:false});console.log(JSON.stringify({pages:after.pages,publicFiles:checks.length,workers}));
}else throw Error('Use inspect|deploy|verify');
