// Run against scripts/qa-pingdu-repair-coupon.mjs with FORGE_READINESS_QA,
// FORGE_INVENTORY_QA and FORGE_SHORTAGE_QA set to 1. No live account writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.FORGE_QA_URL||'http://127.0.0.1:8966';
assert.equal(new URL(origin).hostname,'127.0.0.1');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'forge-shortage-'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const reports=[];
try{
 for(const [width,height]of [[1440,1000],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],mutations=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/forge\/(enhance|restore)(?:\?|$)/.test(request.url()))mutations.push(request.url());});
  await page.goto(origin+'/equipment-forge/');
  await page.locator('[data-id="311"]').click();
  await page.waitForFunction(()=>document.getElementById('rate-level').textContent==='+9 → +10');
  await page.locator('.protection-card').click();
  await page.waitForFunction(()=>document.getElementById('forge-connection').textContent.includes('3장 필요 / 보유 1장 / 2장 부족'));
  assert.equal(await page.locator('#success-rate').textContent(),'10%');
  assert.match(await page.locator('.material-list').textContent(),/150,000개/);
  assert.match(await page.locator('.material-heading').textContent(),/184,958개/);
  assert.match(await page.locator('.consumption-note').textContent(),/\+10 도전 · 보호권 3장 필요/);
  assert.equal(await page.locator('#enhance-button').isDisabled(),true);
  assert.equal(await page.locator('#protection-toggle').isChecked(),true);
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('#forge-connection').scrollIntoViewIfNeeded();
  const screenshot=path.join(out,`shortage-${width}.png`);
  await page.locator('.control-panel').screenshot({path:screenshot});
  const layout=await page.evaluate(()=>{
   const panel=document.querySelector('.control-panel').getBoundingClientRect(),button=document.getElementById('enhance-button').getBoundingClientRect();
   return {overflow:document.documentElement.scrollWidth>innerWidth,panelBottom:panel.bottom,buttonBottom:button.bottom};
  });
  assert.equal(layout.overflow,false);assert.ok(layout.buttonBottom<=layout.panelBottom);
  await page.getByRole('button',{name:'보유 수량 새로고침',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('forge-connection').textContent.includes('2장 부족'));
  assert.equal(await page.locator('#protection-toggle').isChecked(),true);
  // Toggling protection is always the user's choice; never silently turn it off.
  await page.locator('.protection-card').click();
  await page.waitForFunction(()=>!document.getElementById('enhance-button').disabled);
  assert.equal(await page.locator('#forge-connection').isVisible(),false);
  assert.match(await page.locator('.risk-note').textContent(),/파괴/);
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
  reports.push({width,screenshot,layout,enhancements:mutations.length,errors});
  await context.close();
 }
 const state=await (await fetch(origin+'/__qa/state')).json();
 assert.equal(state.protection,1);assert.equal(state.stars,184958);assert.equal(state.requestStats.enhance,0);assert.equal(state.requestStats.restore,0);
 console.log(JSON.stringify({reports,state},null,2));
}finally{await browser.close();}
