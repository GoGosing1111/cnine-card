import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd();
assert(!out.startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const account='1e7c59450a8b6e34a9d87f92ca02aeaa',site='https://cnine-card.pages.dev';
const save=(file,data)=>fs.writeFileSync(path.join(out,file),JSON.stringify(data,null,2)+'\n');
async function state(){
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/cnine-card`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok);const body=await r.json();assert(body.success);const d=body.result.canonical_deployment;
  return {id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash};
}
if(mode==='inspect'){
  const before=await state();save('before-deploy.json',before);
  save('deployment-plan.json',{base:before.commit,reason:'Add the user-requested optional SOOP watch-time consent popup and PLAY DK settings/re-entry flow. Existing authentication and gift rules are unchanged; only optional provision status from a fresh token is returned. Six provider/route regressions and actual-main 51 PC/mobile checks passed. Run the new stale-session/cache regressions and required worker compilation; no ranking fetches or direct account writes.',tests:['tests/soop-watch-consent-release-20261026.test.mjs'],checks:['check:worker']});
  console.log(JSON.stringify(before));
}else if(mode==='deploy'){
  const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD');
  assert.equal((await state()).commit,plan.base,'Production advanced; reconcile the base first');
  const logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));const fd=fs.openSync(logfile,'w');
  const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
  const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});
  console.log(JSON.stringify({head,base:plan.base,logfile}));
  const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);
  save('deployment-result.json',{head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
  const execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),after=await state();assert.equal(execution.exitCode,0);assert.equal(after.status,'success');assert.equal(after.commit,execution.head);
  const files=['index.html','service-worker.js','js/app.js','js/soop-watch-consent-v1.mjs','css/soop-watch-consent-v1.css','onestore/js/app.js','shared/onestore-web-assets-v1.mjs'];
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const publicFiles=await Promise.all(files.map(async file=>{
    const response=await fetch(site+'/'+file+'?verify='+execution.head,{signal:AbortSignal.timeout(45000)});assert(response.ok,file);
    const actual=(await response.text()).replaceAll('\r\n','\n'),expected=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');assert.equal(hash(actual),hash(expected),file);return {file,sha256:hash(actual)};
  }));
  const service=await fetch(site+'/api/service/status',{signal:AbortSignal.timeout(20000)});assert(service.ok);
  const unauth=await fetch(site+'/api/secondary-verification/playdk',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});assert.equal(unauth.status,401);
  save('live-verification.json',{pages:after,publicFiles,serviceStatus:service.status,unauthenticatedVerificationStatus:unauth.status,operationalAccountWrites:0,watchRankingCalls:0});
  console.log(JSON.stringify({pages:after,publicFiles:publicFiles.length,serviceStatus:service.status,unauthenticatedVerificationStatus:unauth.status}));
}else throw Error('Use inspect|deploy|verify');
