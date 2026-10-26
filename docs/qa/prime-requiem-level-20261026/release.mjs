import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync,spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd(),account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',windowsHide:true,maxBuffer:32e6}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
const api=async suffix=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+suffix,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok,'Cloudflare response '+r.status);return r;};
async function state(){const data=await(await api('/pages/projects/cnine-card')).json();assert(data.success);const d=data.result.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
if(mode==='inspect'){
 const before=await state();save('before-deploy.json',before);
 save('deployment-plan.json',{base:before.pages.commit,reason:'프라임 레퀴엠의 성장 목록 누락과 MERCENARY_LEVEL_RANK를 READ ONLY로 재현했다. PRIME_CODE만 기존 성장 목록에 연결하고 XP 5배·돌파·이전·보유/재료 보호를 유지하며 관련 서버/PC/모바일 경로를 검증한다.',tests:['tests/prime-requiem-level-20261026.test.mjs','tests/mercenary-level-v2-integration-20261015.test.mjs','tests/mercenary-experience-transfer-20261025.test.mjs','tests/mercenary-level-cap21-20261025.test.mjs','tests/eunseol-level-20261026.test.mjs','tests/prime-level-release-assets-20261026.test.mjs'],checks:['check:worker']});console.log(JSON.stringify(before));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));assert.equal((await state()).pages.commit,plan.base,'Production advanced; inspect latest before deploying');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,pid:child.pid,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),after=await state();assert.equal(execution.exitCode,0);assert.equal(after.pages.commit,execution.head);assert.equal(after.pages.status,'success');
 const workers=[];for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){
  const body=await(await api('/workers/scripts/'+name)).text();
  // Scheduled combat does not expose growth HTTP routes; bundling removes that handler.
  if(name==='cnine-card-clan-draft'){assert.match(body,/PRIME_CODE\s*=\s*["']V-975["']/);workers.push({name,growthApi:false,bundleSha256:hash(body)});continue;}
  const match=body.match(/function levelCatalog\([^]{0,3000}/);assert(match,'Growth catalog missing from '+name);const end=match[0].indexOf('\n}'),catalog=match[0].slice(0,end+2);assert(end>0);assert.match(catalog,/PRIME_CODE/);assert.match(body,/PRIME_CODE\s*=\s*["']V-975["']/);workers.push({name,primeRequiemGrowthCatalog:true,catalogSha256:hash(catalog)});
 }
 const publicFiles=[];for(const file of ['mercenary-codex/leveling/index.html','mercenary-codex/leveling/app.mjs','shared/mercenary-level-v1.mjs','shared/mercenary-prime-requiem-v1.mjs']){const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+execution.head,{signal:AbortSignal.timeout(30000)});assert(r.ok);const actual=(await r.text()).replaceAll('\r\n','\n'),expected=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');assert.equal(hash(actual),hash(expected));publicFiles.push({file,sha256:hash(actual)});}
 const unauth=await fetch('https://cnine-card.pages.dev/api/mercenaries/v3/leveling/state?verify='+execution.head,{signal:AbortSignal.timeout(30000)});assert.equal(unauth.status,401);
 save('live-verification.json',{...after,releaseCommit:execution.head,workers,publicFiles,unauthenticatedStateStatus:unauth.status,operationalAccountWrites:0});console.log(JSON.stringify({pages:after.pages,workers,publicFiles:publicFiles.length,unauthenticatedStateStatus:unauth.status}));
}else throw Error('Use inspect|deploy|verify');
