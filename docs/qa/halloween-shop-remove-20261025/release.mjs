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
 const plan={base:before.pages.commit,reason:'사용자 요청 할로윈팩 상점 제거와 신규 개봉 차단. 저장 가격/확률/한도, 보유 카드, 과거 영수증 및 블러드문팩 ON 보존. 관련 잠금/거래/복구/CMS 검사와 PC·모바일 상점/이전 결과 확인 경로 검수.',tests:['tests/halloween-shop-remove-20261025.test.mjs','tests/mercenary-halloween-pack-20261017.test.mjs','tests/mercenary-halloween-storage-recovery-20261021.test.mjs','tests/mercenary-halloween-jokro-20261021.test.mjs'],checks:['check:worker']};
 fs.writeFileSync(path.join(out,'deployment-plan.json'),JSON.stringify(plan,null,2));
}else if(mode==='deploy'){
 const plan=JSON.parse(fs.readFileSync(path.join(out,'deployment-plan.json'))),logfile=path.join(out,'deploy.log');if(fs.existsSync(logfile))throw Error('Preserve prior deployment log before retrying');
 const fd=fs.openSync(logfile,'w'),env={...process.env,SCOPED_DEPLOY_BASE:plan.base,SCOPED_DEPLOY_REASON:plan.reason,SCOPED_DEPLOY_TESTS:JSON.stringify(plan.tests),SCOPED_DEPLOY_CHECKS:JSON.stringify(plan.checks)};
 const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run deploy:production -- --scoped'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});console.log(JSON.stringify({head,base:plan.base,logfile,pid:child.pid}));
 const exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});fs.closeSync(fd);fs.writeFileSync(path.join(out,'deployment-result.json'),JSON.stringify({head,exitCode,finishedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({head,exitCode}));process.exitCode=exitCode||0;
}else if(mode==='verify'){
 const before=JSON.parse(fs.readFileSync(path.join(out,'before-deploy.json'))),after=await state(),executed=JSON.parse(fs.readFileSync(path.join(out,'deployment-result.json')));if(executed.exitCode||after.pages.commit!==executed.head||after.pages.status!=='success')throw Error('Canonical production version mismatch');
 const files=['index.html','service-worker.js','js/app.js','js/mercenary-halloween-pack-live.mjs','shared/mercenary-halloween-pack-v1.mjs','admin/index.html','admin/mercenary-admin-v1.js','admin/mercenary-halloween-admin-v1.mjs'],checks=[];
 for(const file of files){const r=await fetch('https://cnine-card.pages.dev/'+file+'?qa='+executed.head),remote=Buffer.from(await r.arrayBuffer()),local=hash(fs.readFileSync(path.join(root,file)));if(!r.ok||hash(remote)!==local)throw Error('Public file mismatch: '+file);checks.push({file,sha256:local,status:r.status});}
 const packs=await publicState();if(packs.shopIds.some(id=>!id||['halloween','mercenary-halloween-ss-limited'].includes(id)))throw Error('Removed pack still in shop');if(!packs.shopIds.includes('mercenary-bloodmoon-ss-limited'))throw Error('Bloodmoon missing from shop');
 if(packs.halloween.shopEnabled!==false||packs.halloween.userOpeningEnabled!==false)throw Error('Halloween still enabled');
 if(packs.bloodmoon.releaseEnabled!==true||packs.bloodmoon.userOpeningEnabled!==true||packs.bloodmoon.settings.mode!=='ON')throw Error('Bloodmoon no longer ON');
 const same=(a,b)=>hash(JSON.stringify(a))===hash(JSON.stringify(b));for(const name of ['bloodmoon','halloween'])if(!same(before.packs[name].settings,packs[name].settings)||before.packs[name].revision!==packs[name].revision)throw Error(name+' saved configuration changed');
 const post=await fetch('https://cnine-card.pages.dev/api/mercenary-halloween-pack/open',{method:'POST',headers:{origin:'https://cnine-card.pages.dev','content-type':'application/json'},body:'{}'}),denial=await post.json();if(post.status!==423||denial.code!=='MERCENARY_HALLOWEEN_SHOP_REMOVED')throw Error('Retired opening was not denied');
 const receipt=await fetch('https://cnine-card.pages.dev/api/mercenary-halloween-pack/receipt?requestId=00000000-0000-4000-8000-000000000001');if(receipt.status!==401)throw Error('Receipt authentication mismatch');
 const worker=await api('/workers/scripts/cnine-card-api-runtime'),bundle=await worker.text();if(!worker.ok||!bundle.includes('HALLOWEEN_PACK_SHOP_ENABLED = false')||!bundle.includes('MERCENARY_HALLOWEEN_SHOP_REMOVED')||!bundle.includes('BLOODMOON_PACK_RELEASE_ENABLED = true')||!bundle.includes('PRIME_CRAFT_RELEASE_ENABLED = false'))throw Error('Active API runtime flags mismatch');
 const result={...after,publicFiles:checks,shopIds:packs.shopIds,halloweenOpeningStatus:post.status,halloweenOpeningCode:denial.code,halloweenReceiptUnauthenticatedStatus:receipt.status,halloweenRemoved:true,halloweenSavedSettingsUnchanged:true,bloodmoonOpeningEnabled:true,bloodmoonSavedSettingsUnchanged:true,primeCraftLocked:true,productionAccountCharges:0,productionAccountGrants:0,productionSettingWrites:0};
 fs.writeFileSync(path.join(out,'live-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else throw Error('Use inspect, deploy or verify');
