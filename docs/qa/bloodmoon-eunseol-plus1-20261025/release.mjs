import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareStockIncrease as prepareExpansion,TARGETS} from '../../../scripts/ops/bloodmoon-eunseol-plus1-20261025.mjs';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd(),account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:32e6}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=b=>createHash('sha256').update(b).digest('hex');
async function api(route){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{Authorization:'Bearer '+token}});const d=await r.json();assert(r.ok&&d.success,'Cloudflare inspection failed');return d.result;}
async function state(){const p=await api('/pages/projects/cnine-card'),d=p.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});fs.mkdirSync(out,{recursive:true});
if(mode==='inspect'){
 const before=await state();save('before-deploy.json',before);
 const plan={base:before.pages.commit,reason:'은설 블러드문팩 한도만 3→4장으로 1장 추가한다. 기존3장 정책을 유지해 읽고 확률/가격/ON/실제 발행/보유를 보존하며 원자 운영 증량과 4번째 시리얼·재시도 검증만 수행한다.',tests:['tests/bloodmoon-eunseol-plus1-20261025.test.mjs','tests/mercenary-bloodmoon-pack-20261023.test.mjs'],checks:['check:worker']};save('deployment-plan.json',plan);console.log(JSON.stringify(before));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));
 const current=await state();assert.equal(current.pages.commit,plan.base,'Production advanced; inspect the latest deployment');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,pid:child.pid,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const before=JSON.parse(fs.readFileSync(path.join(out,'before-deploy.json'))),after=await state(),execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json')));assert.equal(execution.exitCode,0);assert.equal(after.pages.commit,execution.head);assert.equal(after.pages.status,'success');
 const files=git('diff','--name-only',before.pages.commit,execution.head).split('\n').filter(p=>/^(?:shared|js|admin|mercenary-codex)\//.test(p)||['index.html','service-worker.js'].includes(p)),checks=[];
 for(const file of files){const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+execution.head),remote=Buffer.from(await r.arrayBuffer()),local=hash(fs.readFileSync(file));assert(r.ok,'Unavailable: '+file);assert.equal(hash(remote),local,'Public file mismatch: '+file);checks.push({file,sha256:local});}
 const r=await fetch('https://cnine-card.pages.dev/api/mercenaries/v3/bloodmoon-pack/feature'),response=await r.json();let pack=response;const maintenance=r.status===503&&response.code==='MAINTENANCE';if(maintenance){pack=JSON.parse(fs.readFileSync(path.join(out,'live-state.json')));assert.equal(pack.verificationSource,'production database, deployed source reader, READ ONLY');}else assert(r.ok,JSON.stringify(response));
 const original=JSON.parse(fs.readFileSync(path.join(out,'ops/read.json'))),expected=prepareExpansion(original.document.settings);assert.deepEqual(pack.settings,expected);assert(pack.userOpeningEnabled);
 for(const t of TARGETS){const s=pack.stock.find(s=>s.code===t.code);assert.equal(s.limit,t.after);assert(s.issued>=Number(original.stock.find(s=>s.code===t.code)?.issued??0)&&s.issued<=t.after);}
 assert(!pack.stock.some(s=>s.code==='V-058'));assert.equal(pack.cards.find(c=>c.code==='V-058').stockPolicy,'UNLIMITED');assert.equal(pack.cards.find(c=>c.code==='V-058').basePower,1000000);
 assert.equal(pack.settings.cardRatesPpm['V-973'],original.document.settings.cardRatesPpm['V-973']);
 if(!maintenance){const codex=await(await fetch('https://cnine-card.pages.dev/api/mercenary-codex')).json();assert.equal(codex.cards.find(c=>c.code==='V-058').basePower,1000000);}
 const result={...after,publicFiles:checks,publicApi:{status:r.status,...(maintenance?{maintenance:response.maintenance}:{} )},verificationSource:maintenance?pack.verificationSource:'public API',revision:pack.revision,stock:pack.stock,configuredRates:pack.settings.cardRatesPpm,effectiveCardPercents:pack.effectiveCardPercents,razakPower:1000000,stockAdded:1,operationGrants:0};save('live-verification.json',result);console.log(JSON.stringify({pages:after.pages,files:checks.length,revision:pack.revision,stock:pack.stock,razakPower:1000000}));
}else throw Error('Use inspect|deploy|verify');
