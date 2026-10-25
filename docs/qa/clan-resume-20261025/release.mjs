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
async function state(){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/pages/projects/cnine-card',{headers:{Authorization:'Bearer '+token}}),data=await r.json();assert(r.ok&&data.success);const d=data.result.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
if(mode==='inspect'){
 const before=await state();save('before-deploy.json',before);
 const plan={base:before.pages.commit,reason:'승인된 8개 클랜 정규전 화수목토 21~22시와 세력전 하루 랜덤 1회·4점령 1승점 재개 및 란x2 클랜 탈퇴. 기존 기능의 잠금/일정/점수 연결만 변경하며 공통 DB·인증·인프라 변경 없음. 원자성·4점령/8점령 동일1점·실제 전투·가입 합류 5개 최종 회귀와 Worker 확인. 기존 잠금/달력/가입 회귀 23개 및 PC/모바일 확인 완료. 순위표 승인 남색/연두 UI 갱신.',tests:['tests/clan-resume-20261025.test.mjs'],checks:['check:worker']};save('deployment-plan.json',plan);console.log(JSON.stringify(before));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));assert.equal((await state()).pages.commit,plan.base,'Production advanced; inspect latest before deploying');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,pid:child.pid,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const before=JSON.parse(fs.readFileSync(path.join(out,'before-deploy.json'))),after=await state(),execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json')));assert.equal(execution.exitCode,0);assert.equal(after.pages.commit,execution.head);assert.equal(after.pages.status,'success');
 const files=git('diff','--name-only',before.pages.commit,execution.head).split('\n').filter(p=>/^(?:shared|js|css|admin|organization)\//.test(p)||['index.html','service-worker.js'].includes(p)),checks=[];
 for(const file of files){const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+execution.head),remote=Buffer.from(await r.arrayBuffer()),local=hash(fs.readFileSync(file));assert(r.ok,'Public file unavailable: '+file);assert.equal(hash(remote),local,'Public file mismatch: '+file);checks.push({file,sha256:local});}
 const result={...after,publicFiles:checks,clanCount:8,capacity:200,newAdmissionPolicyEnabled:false,regularScheduleReleased:true,championsScheduleLocked:true,factionDailyCount:1,requiredTerritories:4,pointsPerSession:1};save('live-verification.json',result);console.log(JSON.stringify({pages:after.pages,publicFiles:checks.length,clans:8,capacity:200}));
}else throw Error('Use inspect|deploy|verify');
