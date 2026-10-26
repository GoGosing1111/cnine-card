import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const [mode,directory] = process.argv.slice(2), out=path.resolve(directory), root=process.cwd();
const account='1e7c59450a8b6e34a9d87f92ca02aeaa', site='https://cnine-card.pages.dev';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync(out,{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');
async function state(){
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/cnine-card`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok);
  const body=await r.json();assert(body.success);const d=body.result.canonical_deployment;
  const response=await fetch(site+'/api/streamer-profiles',{signal:AbortSignal.timeout(30000)});assert(response.ok);const roster=await response.json();
  return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash},roster,rosterHash:hash(JSON.stringify(roster))};
}
if(mode==='inspect'){
  const before=await state();save('before-deploy.json',before);
  save('deployment-plan.json',{base:before.pages.commit,reason:'Split the CNINE roster into a department selection page and separate female/star pages, each with three columns. Append BJ Chaeri, Kkukka and Idani after the existing female members. Preserve the existing art, lobby entry, station links and lounge CMS; validate actual-main PC/mobile navigation and related lobby/lounge regressions. No account or settings writes.',tests:['tests/streamer-lounge-v2036.test.mjs','tests/adventure-lobby-menu-separation.test.mjs'],checks:[]});
  console.log(JSON.stringify({pages:before.pages,rosterCount:before.roster.profiles.length,rosterHash:before.rosterHash}));
}else if(mode==='deploy'){
  const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD');
  assert.equal((await state()).pages.commit,plan.base,'Production advanced; inspect and reconcile first');
  const logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));const fd=fs.openSync(logfile,'w');
  const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
  const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});
  console.log(JSON.stringify({head,base:plan.base,logfile}));
  const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);
  save('deployment-result.json',{head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
  const execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),before=JSON.parse(fs.readFileSync(path.join(out,'before-deploy.json'))),after=await state();
  assert.equal(execution.exitCode,0);assert.equal(after.pages.status,'success');assert.equal(after.pages.commit,execution.head);assert.equal(after.rosterHash,before.rosterHash);
  const files=['index.html','service-worker.js','js/streamer-lounge-v2036.js','js/cnine-roster-v1.js','js/adventure-lobby-v2107.js','css/cnine-roster-v1.css','assets/ui/streamer-lounge/cnine-roster-20261026/celestial-board.webp','preview/mercenary-jokro-iaido-20261017-v1/references/user-c9.png'];
  const publicFiles=await Promise.all(files.map(async file=>{
    const response=await fetch(site+'/'+file+'?verify='+execution.head,{signal:AbortSignal.timeout(60000)});assert(response.ok,file);
    const binary=/\.(?:webp|png)$/.test(file),actual=binary?Buffer.from(await response.arrayBuffer()):(await response.text()).replaceAll('\r\n','\n');
    const expected=binary?fs.readFileSync(file):fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');assert.equal(hash(actual),hash(expected),file);
    return {file,sha256:hash(actual)};
  }));
  save('live-verification.json',{...after,publicFiles,operationalAccountWrites:0,operationalSettingsWrites:0});console.log(JSON.stringify({pages:after.pages,publicFiles:publicFiles.length,rosterUnchanged:true}));
}else throw Error('Use inspect|deploy|verify');
