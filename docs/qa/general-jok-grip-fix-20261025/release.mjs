import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isProductionFile} from '../../../scripts/prepare-production-assets.mjs';
const [mode,directory]=process.argv.slice(2),out=path.resolve(directory),root=process.cwd(),account='1e7c59450a8b6e34a9d87f92ca02aeaa';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',windowsHide:true,maxBuffer:32e6}).trim();
const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
async function state(){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/pages/projects/cnine-card',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)}),data=await r.json();assert(r.ok&&data.success);const d=data.result.canonical_deployment;return {at:new Date().toISOString(),pages:{id:d.id,url:d.url,status:d.latest_stage.status,commit:d.deployment_trigger.metadata.commit_hash}};}
if(mode==='inspect'){
 const before=await state();save('before-deploy.json',before);
 save('deployment-plan.json',{base:before.pages.commit,reason:'제너럴 족 대기·발사 장갑의 엄지/검지와 손잡이 파지를 국소 수정. 기존 전투력·스킬·2배 모션·이펙트·67개 승인 원본을 보존하고 실제 PC/모바일/좌우 전장 검수 완료. 전용 회귀와 V3 공통 번들/메인 로더, 수정한 정적 전달 필터 검사를 선택한다.',tests:['tests/general-jok-live-20261023.test.mjs','tests/v3-common-grid-v1.test.mjs','tests/battle-feature-recovery-20261015.test.mjs','tests/production-sparse-staging-20261023.test.mjs'],checks:['check:worker']});console.log(JSON.stringify(before));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),head=git('rev-parse','HEAD'),logfile=path.join(out,'deploy.log');assert(!fs.existsSync(logfile));assert.equal((await state()).pages.commit,plan.base,'Production advanced; inspect latest before deploying');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,pid:child.pid,logfile}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);save('deployment-result.json',{head,base:plan.base,exitCode,finishedAt:new Date().toISOString()});console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const execution=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json'))),after=await state();assert.equal(execution.exitCode,0);assert.equal(git('merge-base',execution.head,after.pages.commit),execution.head);assert.equal(after.pages.status,'success');
 const files=git('diff','--name-only',execution.base,execution.head).split(/\r?\n/).filter(p=>isProductionFile(p)&&/\.(js|mjs|json|html|png)$/.test(p)&&!p.startsWith('scripts/')&&!p.startsWith('functions/'));
 const publicFiles=await Promise.all(files.map(async file=>{const r=await fetch('https://cnine-card.pages.dev/'+file+'?verify='+execution.head,{signal:AbortSignal.timeout(45000)});assert(r.ok,file);const bytes=Buffer.from(await r.arrayBuffer()),local=fs.readFileSync(file),normalize=b=>file.endsWith('.png')?b:b.toString('utf8').replaceAll('\r\n','\n');assert.equal(hash(normalize(bytes)),hash(normalize(local)),file);return {file,sha256:hash(normalize(bytes)),binary:file.endsWith('.png')};}));
 const workers=[];for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});assert(r.ok);const body=await r.text();assert(body.includes('general-jok-grip-20261025/ready.png'));workers.push({name,correctedSprite:true});}
 const response=await fetch('https://cnine-card.pages.dev/api/mercenary-codex?verify='+execution.head,{signal:AbortSignal.timeout(25000)});assert(response.ok);const data=await response.json(),card=data.cards.find(c=>c.code==='V-974');assert(card);assert.equal(card.battleSprite,'assets/ui/project-v/mercenaries/general-jok-grip-20261025/ready.png');assert.equal(card.basePower,2700000);
 save('live-verification.json',{...after,releaseCommit:execution.head,publicFiles,workers,card:{code:card.code,battleSprite:card.battleSprite,basePower:card.basePower},operationalAccountWrites:0});console.log(JSON.stringify({pages:after.pages,publicFiles:publicFiles.length,workers,card:card.code}));
}else throw Error('Use inspect|deploy|verify');
