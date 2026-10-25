import {TARGETS} from '../../../scripts/ops/bloodmoon-restock-ss5-leonel2-20261025.mjs';
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
 const plan={base:before.pages.commit,reason:'블러드문 SS 6종 각 25→30장과 레오넬 5→7장, 총 32장 추가. 과거 한도 읽기·실제 발행/보유·가격/확률/ON·제너럴 족/프라임 3장 보존. 거래·과거 등록·도감 검사28개와 PC/모바일 검증 통과.',tests:['tests/mercenary-bloodmoon-pack-20261023.test.mjs','tests/mercenary-bloodmoon-bulk-20261025.test.mjs'],checks:['check:worker']};save('deployment-plan.json',plan);console.log(JSON.stringify({pages:before.pages,revision:before.bloodmoon.revision}));
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
 const current=await pack(),expected=structuredClone(before.bloodmoon.settings);for(const t of TARGETS)expected.stockLimits[t.code]=t.after;
 assert.deepEqual(current.settings,expected);assert.equal(current.releaseEnabled,true);assert.equal(current.userOpeningEnabled,true);
 for(const t of TARGETS){const s=current.stock.find(s=>s.code===t.code),old=before.bloodmoon.stock.find(s=>s.code===t.code);assert.equal(s.limit,t.after);assert(s.issued>=old.issued&&s.issued<=t.after);}
 for(const [code,limit] of [['V-974',3],['V-975',3]])assert.equal(current.stock.find(s=>s.code===code).limit,limit);
 const result={...after,publicFiles:checks,revision:current.revision,stock:current.stock,prices:current.settings.prices,priceAndOddsAndModePreserved:true,stockAdded:32,operationGrants:0};save('live-verification.json',result);console.log(JSON.stringify(result));
}else throw Error('Use inspect|deploy|verify');
