import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync,spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd(),account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',windowsHide:true,maxBuffer:32e6}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
const api=async suffix=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+suffix,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok,'Cloudflare response '+r.status);return r;};
async function state(){const data=await(await api('/pages/projects/cnine-card')).json();assert(data.success);const d=data.result.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
if(mode==='inspect'){
 const before=await state();save('before-deploy.json',before);save('deployment-plan.json',{base:before.pages.commit,reason:'프라임 레퀴엠 제작 개방 지시: 서버 잠금 해제, 운영 체크박스 저장, 기존 재료·150조 비용 보존, 재료 차감·완제 지급·동시 요청 및 재시도 보호 검증. 다른 용병 한도와 팩 지급 유지. PC/모바일 실제 제작소·CMS 확인.',tests:['tests/prime-craft-open-20261026.test.mjs','tests/bloodmoon-prime-material-20261025.test.mjs','tests/kairon-craft-stock-20261018.test.mjs','tests/mercenary-limited-shard-craft-20261025.test.mjs'],checks:['check:worker']});console.log(JSON.stringify(before));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(out+'/deployment-plan.json')),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));assert.equal((await state()).pages.commit,plan.base,'Production advanced; inspect latest before deploying');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,pid:child.pid,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const execution=JSON.parse(fs.readFileSync(out+'/deployment-result.json')),after=await state();assert.equal(execution.exitCode,0);assert.equal(after.pages.commit,execution.head);assert.equal(after.pages.status,'success');
 const workers=[];for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){
  const body=await(await api('/workers/scripts/'+name)).text(),primeCraftReleased=/PRIME_CRAFT_RELEASE_ENABLED = true/.test(body),materialGuardPreserved=body.includes('SET verified=verified WHERE guard_id=?');assert(primeCraftReleased&&materialGuardPreserved,name);workers.push({name,primeCraftReleased,materialGuardPreserved});
 }
 const files=['admin/index.html','admin/workshop-admin-v1668.js','js/workshop-v1881.js','js/app.js','index.html','service-worker.js','js/mercenary-bloodmoon-pack-live.mjs','js/mercenary-bloodmoon-presentation-v2.mjs','shared/mercenary-prime-material-v1.mjs','shared/mercenary-craft-v1.mjs'];
 const publicFiles=[];for(const file of files){const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+execution.head,{signal:AbortSignal.timeout(30000)});assert(r.ok,file);const actual=(await r.text()).replaceAll('\r\n','\n'),expected=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');assert.equal(hash(actual),hash(expected),file);publicFiles.push({file,sha256:hash(actual)});}
 save('live-verification.json',{...after,releaseCommit:execution.head,workers,publicFiles});console.log(JSON.stringify({pages:after.pages,workers,publicFiles:publicFiles.length}));
}else throw Error('Use inspect|deploy|verify');
