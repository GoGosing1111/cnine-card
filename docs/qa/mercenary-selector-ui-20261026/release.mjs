import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd();
assert(['inspect','deploy','verify'].includes(mode));fs.mkdirSync(out,{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:4000000}).trim();
const cli=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[cli,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,v)=>fs.writeFileSync(out+'/'+name,JSON.stringify(v,null,2)+'\n');
const files=['css/workshop-v1881.css','js/workshop-v1881.js','js/app.js','index.html','service-worker.js','css/command-ui-v1.css','assets/ui/mercenary-codex/command-20261021/panel-v3.webp','assets/ui/mercenary-codex/command-20261021/action-user-approved.webp'];
async function state(){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa/pages/projects/cnine-card',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok);const b=await r.json();assert(b.success);const d=b.result.canonical_deployment;return {id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash};}
if(mode==='inspect'){
 const pages=await state(),head=git('rev-parse','HEAD');assert.equal(pages.status,'success');
 const diff=git('diff','--name-only',pages.commit,head).split('\n').filter(Boolean),runtime=diff.filter(f=>f!=='AGENTS.md'&&!f.startsWith('docs/'));
 assert(runtime.every(f=>files.includes(f)),'Unexpected runtime change: '+runtime.join(','));
 const plan={checkedAt:new Date().toISOString(),base:pages.commit,pages,head,diff,mode:'scoped',tests:['tests/workshop-loading-20260925.test.mjs','tests/mercenary-limited-shard-craft-20261025.test.mjs'],checks:[],reason:'Replace only mercenary crafting selector artwork with approved shared navy/lime resources. Preserve selection behavior and all crafting policy; verify existing workshop loader and limited shard crafting regressions plus PC/mobile actual component review.'};save('deployment-plan.json',plan);console.log(JSON.stringify({pages,head,runtime,tests:plan.tests}));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(out+'/deployment-plan.json','utf8'));assert.equal((await state()).commit,plan.base,'Production advanced; inspect again');assert.equal(git('rev-parse','HEAD'),plan.head);assert.equal(git('rev-parse','origin/main'),plan.head);
 const log=out+'/deploy.log';assert(!fs.existsSync(log));const fd=fs.openSync(log,'w');
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env:{...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)},windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head:plan.head,base:plan.base,log}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});fs.closeSync(fd);save('deployment-result.json',{head:plan.head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({exitCode}));process.exitCode=exitCode||0;
}else{
 const result=JSON.parse(fs.readFileSync(out+'/deployment-result.json','utf8')),pages=await state();assert.equal(result.exitCode,0);assert.equal(pages.status,'success');assert.equal(pages.commit,result.head);
 const verified=[];for(const file of files){const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+result.head,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,file);const sha256=hash(Buffer.from(await r.arrayBuffer()));assert.equal(sha256,hash(fs.readFileSync(path.join(root,file))),file);verified.push({file,status:r.status,sha256});}
 save('live-verification.json',{checkedAt:new Date().toISOString(),pages,files:verified,productionDataWrites:0});console.log(JSON.stringify({pages,filesVerified:verified.length,productionDataWrites:0}));
}
