import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.SUGGESTIONS_QA_ORIGIN||'http://127.0.0.1:8985',out=process.env.SUGGESTIONS_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'player-suggestions-cms-'));
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
const monsters=[{id:75,name:'아카드',pveTab:'APOCALYPSE',battlePower:7500000,rewardCoin:1000},{id:76,name:'카네키 켄',pveTab:'APOCALYPSE',battlePower:8500000,rewardCoin:1000}];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());let saved;
  await page.route('**/api/admin/drop-pools',r=>r.fulfill({json:{pools:[],bindings:[],snapshot:{pools:[],bindings:[]}}}));
  await page.route('**/api/admin/battle',r=>{if(r.request().method()==='PATCH'){saved=r.request().postDataJSON();return r.fulfill({json:saved})}return r.fulfill({json:{settings:{apocalypse:{monsterProfiles:{}}},monsters}})});
  await page.goto(base+'/offline.html');
  await page.setContent(`<html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${base}/admin/admin-v945.css"><link rel="stylesheet" href="${base}/admin/apocalypse-admin-v1952.css"></head><body style="padding:16px"><main id="view-battle"></main></body></html>`);
  await page.evaluate(()=>{window.api=async(p,options={})=>{const r=await fetch('/api/'+p,{headers:{'content-type':'application/json'},...options});return r.json()}});
  await page.addScriptTag({url:base+'/admin/apocalypse-admin-v1952.js'});await page.evaluate(()=>window.loadApocalypseAdminV1952());
  const first=page.locator('[data-apocalypse-monster="75"]'),second=page.locator('[data-apocalypse-monster="76"]');
  assert.deepEqual(await page.locator('[data-ap-bonus]').evaluateAll(inputs=>inputs.map(i=>i.value)),['','','','','','']);
  for(const [row,values] of [[first,['15','300','2']],[second,['25','600','4']]])for(const [i,key] of ['coinPercent','masterStars','mysticEnergy'].entries())await row.locator(`[data-ap-bonus="${key}"]`).fill(values[i]);
  await first.locator('.apocalypseClearBonus').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'cms-'+viewport.width+'.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#saveApocalypseSettings').click();await page.locator('#apocalypseSaveState').filter({hasText:'전체 저장 완료'}).waitFor();
  assert.deepEqual(saved.apocalypse.monsterProfiles['75'].clearBonus,{coinPercent:15,masterStars:300,mysticEnergy:2});
  assert.deepEqual(saved.apocalypse.monsterProfiles['76'].clearBonus,{coinPercent:25,masterStars:600,mysticEnergy:4});checks.push(viewport.width+' CMS blank defaults, separate boss values and save');await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/offline.html');await page.setContent('<main class="pvev2-content"></main>');
 const recovered=await page.evaluate(async()=>{
  const module=await import('/js/apocalypse-challenge-v1.mjs');let claims=0,saved=0,calls=[];
  window.loadUser=()=>({serverUserId:9988});window.apiUserToLocal=x=>x;window.saveUser=()=>saved++;
  const row={requestId:'saved-apocalypse-qa',status:'ANSWERED',success:true,openedAt:Date.now()-10000,expiresAt:Date.now()+60000,windowMs:6000};
  localStorage.setItem('apocalypse-dodge-pending-v1:9988',JSON.stringify([row]));
  window.apiRequest=async(p)=>{calls.push(p);if(p.endsWith('/claim')){claims++;return {...row,status:'CLAIMED',rewards:{coin:0,masterStars:0,mysticEnergy:0},user:{}}}return {...row,serverNow:Date.now()}};
  module.mountRecovery(document);await document.querySelector('[data-apocalypse-recover] button').onclick({currentTarget:document.querySelector('[data-apocalypse-recover] button')});
  return {claims,saved,calls,pending:localStorage.getItem('apocalypse-dodge-pending-v1:9988')};
 });
 assert.equal(recovered.claims,1);assert.equal(recovered.saved,1);assert.equal(recovered.pending,'[]');assert(recovered.calls.every(p=>p.includes('apocalypse-challenge')));checks.push('interrupted result recovery never starts another fight or spends energy');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'settings-results.json'),JSON.stringify({checks,errors},null,2));console.log({out,checks,errors});
}finally{await browser.close()}
