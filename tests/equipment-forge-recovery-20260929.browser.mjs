// Local-only forge harness with FORGE_READINESS_QA=1 and FORGE_INVENTORY_QA=1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.FORGE_QA_URL||'http://127.0.0.1:8971';
assert.equal(new URL(origin).hostname,'127.0.0.1');
const out=process.env.FORGE_QA_OUT||fs.mkdtempSync(path.join(os.tmpdir(),'forge-recovery-'));
fs.mkdirSync(out,{recursive:true});
const auth={authorization:'Bearer local-account-7'},api=async route=>{
 const response=await fetch(origin+route,{headers:auth});assert.equal(response.status,200);return response.json();
};
const state=await api('/api/character/equipment/forge/state?group=all'),before=await api('/__qa/state');
const completed=state.history.find(row=>row.status==='COMPLETED');assert.ok(completed);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']}),reports=[];
try{
 for(const [width,height]of [[1440,1000],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],submissions=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/forge\/(enhance|restore)$/.test(request.url()))submissions.push(request.postDataJSON());});
  await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(origin+'/equipment-forge/');await page.waitForFunction(()=>!document.getElementById('enhance-button').disabled);
  const pendingKey=`cnine.forge.pending:${state.accountId}`;
  await page.evaluate(({pendingKey,requestId,kind})=>localStorage.setItem(pendingKey,JSON.stringify({requestId,kind,quoteId:crypto.randomUUID()})),{pendingKey,requestId:completed.requestId,kind:completed.kind.replace('FORGE_','')});
  await page.route('**/forge/receipt?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA receipt unavailable'})}));
  await page.reload();await page.waitForFunction(key=>localStorage.getItem(key)===null,pendingKey);
  await page.waitForFunction(()=>!document.getElementById('enhance-button').disabled&&document.getElementById('enhance-button').textContent.includes('강화 시도'));
  assert.equal(submissions.length,0);await page.unroute('**/forge/receipt?**');
  const pending={requestId:crypto.randomUUID(),quoteId:crypto.randomUUID(),kind:'ENHANCE'};
  await page.evaluate(({key,pending})=>localStorage.setItem(key,JSON.stringify(pending)),{key:pendingKey,pending});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('enhance-button').disabled&&document.getElementById('enhance-button').textContent.includes('같은 요청 이어서 확인'));
  assert.equal(submissions.length,0);await page.evaluate(()=>document.fonts.ready);
  const screenshot=path.join(out,`recovery-${width}.png`);await page.locator('.control-panel').screenshot({path:screenshot});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  await page.locator('#enhance-button').evaluate(button=>button.scrollIntoView({block:'center'}));
  const actionScreenshot=path.join(out,`recovery-action-${width}.png`);await page.screenshot({path:actionScreenshot});
  assert.equal(await page.locator('#enhance-button').evaluate(button=>{const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));}),true);
  await page.locator('#enhance-button').click();
  await page.waitForFunction(key=>localStorage.getItem(key)===null,pendingKey);
  await page.waitForFunction(()=>!document.getElementById('enhance-button').disabled&&document.getElementById('enhance-button').textContent.includes('강화 시도'));
  assert.deepEqual(submissions,[{requestId:pending.requestId,quoteId:pending.quoteId}]);
  const after=await api('/__qa/state');for(const key of ['coins','stars','protection','coupons'])assert.equal(after[key],before[key]);assert.deepEqual(after.records,before.records);
  assert.deepEqual(errors,[]);reports.push({width,screenshot,actionScreenshot,overflow,exactRequestContinuations:submissions.length,balanceUnchanged:true,errors});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser.close();}
