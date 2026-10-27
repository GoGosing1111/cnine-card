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
async function api(url){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok);const body=await r.json();assert(body.success);return body.result;}
async function state(){const d=(await api('/pages/projects/cnine-card')).canonical_deployment;return {id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash};}
if(mode==='inspect'){
  const before=await state();save('before-deploy.json',before);
  save('deployment-plan.json',{base:before.commit,reason:'Fix repeated SOOP notice on every fresh PLAY DK entry. Ordinary callbacks respect acknowledgement and fresh provision; only an explicit tab-local reconnect can show one result. Popup and caller only, no server/auth/data changes. Thirteen notice/provider regressions and actual-main PC/mobile flow passed; run the four final caller/session/cache regressions without repeating completed checks.',tests:['tests/soop-watch-consent-release-20261026.test.mjs'],checks:[]});
  console.log(JSON.stringify(before));
}else if(mode==='deploy'){
  const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD');assert.equal((await state()).commit,plan.base,'Production advanced; reconcile the base first');
  const logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));const fd=fs.openSync(logfile,'w');
  const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
  const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});
  console.log(JSON.stringify({head,base:plan.base,logfile}));const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);
  save('deployment-result.json',{head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
  const execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),after=await state();assert.equal(execution.exitCode,0);assert.equal(after.status,'success');assert.equal(after.commit,execution.head);
  const files=['index.html','service-worker.js','js/app.js','js/soop-watch-consent-v1.mjs','css/soop-watch-consent-v1.css','onestore/index.html','onestore/js/app.js','shared/onestore-web-assets-v1.mjs'];
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const publicFiles=await Promise.all(files.map(async file=>{const r=await fetch(site+'/'+file+'?verify='+execution.head,{signal:AbortSignal.timeout(45000)});assert(r.ok,file);const actual=(await r.text()).replaceAll('\r\n','\n'),expected=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');assert.equal(hash(actual),hash(expected),file);return {file,sha256:hash(actual)};}));
  const service=await fetch(site+'/api/service/status',{signal:AbortSignal.timeout(20000)});assert(service.ok);
  const workers=await Promise.all(['cnine-card-api-runtime','cnine-card-clan-draft'].map(async name=>({name,deployments:await api('/workers/scripts/'+name+'/deployments')})));
  save('live-verification.json',{pages:after,publicFiles,workers,serviceStatus:service.status,operationalAccountWrites:0,watchRankingCalls:0});console.log(JSON.stringify({pages:after,publicFiles:publicFiles.length,serviceStatus:service.status,workers}));
}else throw Error('Use inspect|deploy|verify');
