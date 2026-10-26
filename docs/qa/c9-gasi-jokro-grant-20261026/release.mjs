import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd(),account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:32e6}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=b=>createHash('sha256').update(b).digest('hex');
async function api(route){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{Authorization:'Bearer '+token}});const d=await r.json();assert(r.ok&&d.success,'Cloudflare inspection failed');return d.result;}
async function state(){const p=await api('/pages/projects/cnine-card'),d=p.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
async function pack(){const r=await fetch('https://cnine-card.pages.dev/api/mercenaries/v3/bloodmoon-pack/feature');assert(r.ok);return r.json();}
const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
if(mode==='inspect'){
 const before={...await state(),bloodmoon:await pack()};save('before-deploy.json',before);
 const plan={base:before.pages.commit,reason:'[C9]가시 ID4866에 사용자 지정 족로 1장 한도 예외 지급. 해당 계정의 보유 필수 PVE/PVP 접근만 추가하며 기존 허용 계정·대여 만료·팩/제작 발행·재화/자동 편성은 유지한다.',tests:['tests/c9-gasi-jokro-access-20261026.test.mjs','tests/tmoney-jokro-access-20261023.test.mjs','tests/jokro-loan-20261019.test.mjs'],checks:['check:worker']};save('deployment-plan.json',plan);console.log(JSON.stringify({pages:before.pages,revision:before.bloodmoon.revision}));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile),'Preserve previous deploy log');
 const current=await state();assert.equal(current.pages.commit,plan.base,'Production advanced; inspect the latest deployment before proceeding');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,pid:child.pid,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const before=JSON.parse(fs.readFileSync(path.join(out,'before-deploy.json'))),after=await state(),execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json')));assert.equal(execution.exitCode,0);assert.equal(after.pages.commit,execution.head);assert.equal(after.pages.status,'success');
 const files=git('diff','--name-only',before.pages.commit,execution.head).split('\n').filter(p=>/^(?:shared|js|admin|mercenary-codex)\//.test(p)||['index.html','service-worker.js'].includes(p)),checks=[];
 for(const file of files){const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+execution.head),remote=Buffer.from(await r.arrayBuffer()),local=hash(fs.readFileSync(file));assert(r.ok,'Public file unavailable: '+file);assert.equal(hash(remote),local,'Public file mismatch: '+file);checks.push({file,sha256:local});}
 const current=await pack();assert.deepEqual(current.settings,before.bloodmoon.settings);assert.equal(current.userOpeningEnabled,true);
 const publicModule=await fetch('https://cnine-card.pages.dev/shared/mercenary-jokro-v1.mjs?verify='+execution.head).then(r=>r.text());
 assert.match(publicModule,/Number\(userId\)===4866/);
 const workerResponse=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/services/cnine-card-api-runtime/environments/production/content',{headers:{Authorization:'Bearer '+token}});assert(workerResponse.ok,'Read deployed API runtime');
 const worker=await workerResponse.text(),predicate=worker.match(/\bjokroAccountAllowed\s*=[^;]+;/)?.[0];assert(predicate,'Deployed account predicate missing');
 assert.match(predicate,/Number\(userId\d*\)\s*===\s*4866/);assert.match(predicate,/Number\(userId\d*\)\s*===\s*5147/);
 const result={...after,publicFiles:checks,apiRuntimeHasExactAccount4866:true,apiRuntimeHasPrior5147:true,bloodmoonSettingsPreserved:true,accountGrant:'verified separately by run.mjs verify'};save('live-verification.json',result);console.log(JSON.stringify(result));
}else throw Error('Use inspect|deploy|verify');
