import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.dirname(fileURLToPath(import.meta.url)),mode=process.argv[2],account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const wrangler=path.join(path.dirname(createRequire(path.join(root,'package.json')).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const cf=async route=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});assert(r.ok);return r;};
const project=await(await cf('/pages/projects/cnine-card')).json(),deployment=project.result.canonical_deployment;assert.equal(deployment.latest_stage.status,'success');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),head=git('rev-parse','HEAD');
if(mode==='base'){const result={at:new Date().toISOString(),head,base:deployment.deployment_trigger.metadata.commit_hash,pages:deployment.id};fs.writeFileSync(path.join(out,'deployment-base.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
else if(mode==='deploy'){
 const plan={base:deployment.deployment_trigger.metadata.commit_hash,head,reason:'DK 일일 5조 상한·주간 30조 및 오늘 수령자 메시지 차액: 신규 거래/재시도 7개 사전 통과, 기존 주간 집계/원자 지급 회귀만 추가',tests:['tests/quest-hub-20260924.test.mjs'],checks:['check:worker']};
 fs.writeFileSync(path.join(out,'deployment-plan.json'),JSON.stringify(plan,null,2)+'\n');
 const env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,stdio:'inherit',windowsHide:true});
 fs.writeFileSync(path.join(out,'deployment-result.json'),JSON.stringify({head,base:plan.base,exitCode:result.status,finishedAt:new Date().toISOString()},null,2)+'\n');process.exitCode=result.status||0;if(result.error)throw result.error;
}else if(mode==='verify'){
 const digest=s=>createHash('sha256').update(s).digest('hex'),files=[];
 for(const file of ['admin/index.html','admin/daily-quest-admin-v1270.js']){const r=await fetch('https://cnine-card.pages.dev/'+file+'?questReview='+head);assert(r.ok);const actual=(await r.text()).replaceAll('\r\n','\n'),expected=fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n');assert.equal(digest(actual),digest(expected));files.push({file,sha256:digest(actual)});}
 const bundle=await(await cf('/workers/scripts/cnine-card-api-runtime')).text();
 assert.match(bundle,/DAILY_QUEST_MAX_REWARD_COIN\s*=\s*(?:5e12|5000000000000|5_000_000_000_000)/);
 const payment=bundle.slice(bundle.indexOf('async function payDailyQuestReward'),bundle.indexOf('async function payDailyQuestReward')+1800);assert.match(payment,/reward\s*>\s*(?:5e12|5000000000000|5_000_000_000_000)/);
 const result={verifiedAt:new Date().toISOString(),sourceHead:head,pages:{id:deployment.id,commit:deployment.deployment_trigger.metadata.commit_hash,status:deployment.latest_stage.status},files,apiBundleSha256:digest(bundle),apiDailyFiveTrillionConfirmed:true};fs.writeFileSync(path.join(out,'live-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}else throw Error('base|deploy|verify');
