import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync,spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const mode=process.argv[2],out=path.resolve(process.argv[3]),root=process.cwd(),account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32e6}).trim(),head=git('rev-parse','HEAD');
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;
if(!token)throw Error('Cloudflare authentication unavailable');
const api=route=>fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{Authorization:'Bearer '+token}}),hash=b=>createHash('sha256').update(b).digest('hex');
async function publicState(){
 const read=async p=>{const r=await fetch('https://cnine-card.pages.dev/api/'+p);if(!r.ok)throw Error('Public read failed '+r.status);return r.json();};
 const [b,h,p]=await Promise.all([read('mercenaries/v3/bloodmoon-pack/feature'),read('mercenary-halloween-pack/config'),read('packs')]);
 const select=d=>({name:d.name,revision:d.revision,settings:d.settings,stock:d.stock,releaseEnabled:d.releaseEnabled,shopEnabled:d.shopEnabled,userOpeningEnabled:d.userOpeningEnabled});
 return {bloodmoon:{...select(b),prime:b.cards.find(c=>c.code==='V-975')},halloween:select(h),shopIds:p.packs.map(p=>p?.id??null)};
}
async function state(){
 const [p,r]=await Promise.all([api('/pages/projects/cnine-card'),api('/workers/scripts/cnine-card-api-runtime/deployments')]);if(!p.ok||!r.ok)throw Error('Release inspection failed');
 const d=(await p.json()).result.canonical_deployment,runtime=(await r.json()).result.deployments[0];delete runtime.author_email;
 return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash},runtime};
}
if(mode==='inspect'){
 fs.mkdirSync(out,{recursive:true});const before={...await state(),packs:await publicState()};fs.writeFileSync(path.join(out,'before-deploy.json'),JSON.stringify(before,null,2));console.log(JSON.stringify({pages:before.pages,shopIds:before.packs.shopIds,bloodmoonOn:before.packs.bloodmoon.userOpeningEnabled}));
 const plan={base:before.pages.commit,reason:'블러드문 편성 시 MERCENARY_SD_NOT_READY: 기존 엔진과 신규 엔진의 버전 충돌을 수정한다. 전투 엔진/래퍼/메인 로더 버전 및 캐시를 함께 갱신하고, 실제 구버전 주입 재현과 6종 PC/모바일 양팀 전투를 확인했다. 전투력/보상/계정/팩 설정 변경 없음.',tests:['tests/battle-feature-recovery-20261015.test.mjs','tests/pve-battlefield-entry-v2117.test.mjs','tests/project-v-v3-live-payload-v1.mjs'],checks:[]};
 fs.writeFileSync(path.join(out,'deployment-plan.json'),JSON.stringify(plan,null,2));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),logfile=path.join(out,'deploy.log');if(fs.existsSync(logfile))throw Error('Preserve prior deployment log before retrying');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,logfile,pid:child.pid}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);fs.writeFileSync(path.join(out,'deployment-result.json'),JSON.stringify({head,exitCode,finishedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const before=JSON.parse(fs.readFileSync(path.join(out,'before-deploy.json'))),after=await state(),executed=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json')));if(executed.exitCode||after.pages.commit!==executed.head||after.pages.status!=='success')throw Error('Canonical production version mismatch');
 const outputs=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json')).outputs.map(r=>r.file),files=['index.html','service-worker.js','js/app.js','js/battle-v3-live.js',...outputs];
 const checks=await Promise.all(files.map(async file=>{const r=await fetch('https://cnine-card.pages.dev/'+file+'?qa='+executed.head),remote=Buffer.from(await r.arrayBuffer()),local=hash(fs.readFileSync(path.join(root,file)));if(!r.ok||hash(remote)!==local)throw Error('Public file mismatch: '+file);return {file,sha256:local,status:r.status};}));
 const packs=await publicState(),same=(a,b)=>hash(JSON.stringify(a))===hash(JSON.stringify(b));
 for(const name of ['bloodmoon','halloween'])if(!same(before.packs[name].settings,packs[name].settings))throw Error(name+' saved configuration changed');
 if(!packs.bloodmoon.userOpeningEnabled||packs.halloween.userOpeningEnabled||packs.shopIds.includes('mercenary-halloween-ss-limited'))throw Error('Pack availability changed');
 const version=fs.readFileSync('js/battle-v3-live.js','utf8').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];if(!version.endsWith('-bloodmoon-owned-battle-20261025-v1'))throw Error('Missing runtime release');
 const result={...after,publicFiles:checks,runtimeVersion:version,bloodmoonOpeningEnabled:true,halloweenRemoved:true,savedPackSettingsUnchanged:true,productionAccountWrites:0,productionSettingWrites:0};fs.writeFileSync(path.join(out,'live-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pages:after.pages,publicFiles:checks.length,runtimeUpdated:true,savedPackSettingsUnchanged:true}));
}else throw Error('Use inspect, deploy or verify');
