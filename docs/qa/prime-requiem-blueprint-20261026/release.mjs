import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MATERIAL} from './register.mjs';
const [mode,output]=process.argv.slice(2),out=path.resolve(output),root=process.cwd(),require=createRequire(import.meta.url);
assert(['inspect','deploy','verify','verify-published'].includes(mode));fs.mkdirSync(out,{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const cli=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[cli,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,v)=>fs.writeFileSync(out+'/'+name,JSON.stringify(v,null,2)+'\n');
async function state(){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa/pages/projects/cnine-card',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok);
 const b=await r.json();assert(b.success);const d=b.result.canonical_deployment;return {id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash};
}
if(mode==='inspect'){
 const pages=await state(),head=git('rev-parse','HEAD');assert.equal(pages.status,'success');
 const diff=git('diff','--name-only',pages.commit,head).split('\n').filter(Boolean);
 save('deployment-plan.json',{checkedAt:new Date().toISOString(),base:pages.commit,pages,head,diff,mode:'assets-only',reason:'One generated Prime Requiem crafting-material WebP; catalog registration through an explicit audited operation. Existing inventory and mercenary CMS runtime unchanged. Eight focused checks and PC/mobile actual-component validation passed.'});
 console.log(JSON.stringify({pages,head,diff}));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(out+'/deployment-plan.json','utf8'));assert.equal((await state()).commit,plan.base,'Production changed; inspect again');
 assert.equal(git('rev-parse','HEAD'),plan.head);assert.equal(git('rev-parse','origin/main'),plan.head);
 const log=out+'/deploy.log';assert(!fs.existsSync(log));const fd=fs.openSync(log,'w');
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --assets-only'],{cwd:root,env:{...process.env,ASSET_DEPLOY_BASE:plan.base},windowsHide:true,stdio:['ignore',fd,fd]});
 console.log(JSON.stringify({head:plan.head,base:plan.base,log}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head:plan.head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify-published'){
 const pages=await state();assert.equal(pages.status,'success');
 const committed=execFileSync('git',['show',pages.commit+':'+MATERIAL.image],{windowsHide:true,maxBuffer:1000000});assert.equal(hash(committed),MATERIAL.imageHash,'Published source does not contain the reviewed blueprint');
 const url='https://cnine-card.pages.dev/'+MATERIAL.image,r=await fetch(url+'?verify='+pages.commit,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);const sha256=hash(Buffer.from(await r.arrayBuffer()));assert.equal(sha256,MATERIAL.imageHash);
 save('live-verification.json',{checkedAt:new Date().toISOString(),pages,publicAsset:{url,status:r.status,sha256},delivery:'INCLUDED_IN_CONCURRENT_RELEASE',separateDeployCommands:0,reason:'Reviewed blueprint asset included in the current production source; verify its exact committed and public bytes instead of redeploying unchanged files.'});console.log(JSON.stringify({pages,publicAssetHashMatches:true,separateDeployCommands:0}));
}else{
 const result=JSON.parse(fs.readFileSync(out+'/deployment-result.json','utf8')),pages=await state();assert.equal(result.exitCode,0);assert.equal(pages.status,'success');assert.equal(pages.commit,result.head);
 const url='https://cnine-card.pages.dev/'+MATERIAL.image,r=await fetch(url+'?verify='+result.head,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);const sha256=hash(Buffer.from(await r.arrayBuffer()));assert.equal(sha256,MATERIAL.imageHash);
 save('live-verification.json',{checkedAt:new Date().toISOString(),pages,publicAsset:{url,status:r.status,sha256},workerRedeploys:0});console.log(JSON.stringify({pages,publicAssetHashMatches:true,workerRedeploys:0}));
}
