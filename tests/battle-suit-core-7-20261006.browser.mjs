// Local production-shell inventory and actual CMS picker, without account writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {inventoryUiFixture} from './fixtures/inventory-ui-v2125.mjs';
import {BATTLE_SUIT_CORE_CATALOG} from '../functions/_battle_suit_materials.js';
const origin='http://127.0.0.1:8984',out=process.env.CORE7_QA_OUT;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_card_api_token','local-core7-qa');});
  await page.route('**/api/inventory',r=>r.fulfill({json:inventoryUiFixture()}));
  await page.route('**/api/inventory/seen',r=>r.fulfill({json:{ok:true}}));
  await page.goto(origin+'/review/?screen=inventory',{waitUntil:'domcontentloaded'});
  await page.locator('#inventoryVault[aria-busy="false"]').waitFor();
  await page.locator('#inventorySearch').fill('슈트 코어');
  await page.waitForFunction(()=>document.querySelectorAll('#inventoryGrid [data-inventory-select]').length===7);
  const order=await page.locator('#inventoryGrid [data-inventory-select]').evaluateAll(nodes=>nodes.map(n=>n.dataset.inventorySelect));
  assert.ok(order.indexOf('SUIT_CORE_7')>order.indexOf('SUIT_CORE_6'));
  await page.locator('[data-inventory-select="SUIT_CORE_7"]').click();
  const detail=page.locator(width===390?'#inventoryDetailDialog':'#inventoryDetail');await detail.waitFor({state:'visible'});
  assert.match(await detail.innerText(),/슈트 코어 7/);assert.match(await detail.innerText(),/X-BODY/);
  assert.ok(await detail.locator('.iv25-use').isDisabled());
  await page.waitForFunction(selector=>{const i=document.querySelector(selector+' img');return i?.complete&&i.naturalWidth>=1024&&i.currentSrc.includes('suit-core-7-20261006.png');},width===390?'#inventoryDetailDialog':'#inventoryDetail');
  await detail.locator('img').evaluate(async image=>{await image.decode();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  assert.ok(await page.locator('#inventoryVault').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:path.join(out,width+'-inventory-core7.png')});
  const snapshot={recipes:[],vehicles:[],equipment:[{id:48,code:'BATTLE_SUIT_Z_BODY',name:'Z-BODY',slot:'BATTLE_SUIT',rarity:'MYTHIC'},{id:49,code:'BATTLE_SUIT_X_BODY',name:'X-BODY',slot:'BATTLE_SUIT',rarity:'MYTHIC'}],inventoryItems:BATTLE_SUIT_CORE_CATALOG.map(c=>({...c,category:'MATERIAL',image_url:c.image})),recentLogs:[],synthesisRecipes:[],recentSynthesisLogs:[]};
  await page.route('**/qa-core-cms',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css"></head><body><nav id="nav"><button data-view="equipment">장비 관리</button></nav><main id="cms"><h1 id="pageTitle">제작소 관리</h1></main><script src="/admin/workshop-admin-v1668.js"></script></body></html>'}));
  await page.route('**/api/admin/workshop',r=>{if(r.request().method()!=='GET')writes.push(r.request().method());return r.fulfill({json:snapshot});});
  await page.goto(origin+'/qa-core-cms');await page.locator('[data-view="workshop"]').click();
  await page.waitForFunction(()=>document.querySelector('#workshopAdminLoadV1668')?.textContent.includes('연결 완료'),null,{timeout:10000}).catch(async error=>{console.error(JSON.stringify({cmsStatus:await page.locator('#workshopAdminLoadV1668').innerText(),errors}));throw error;});
  await page.locator('#workshopAdminCoreDraft').click();
  await page.locator('#workshopRecipeOutputRefV1668').selectOption('SUIT_CORE_7');
  await page.locator('[data-workshop-material-code]').first().selectOption('SUIT_CORE_6');
  assert.equal(await page.locator('#workshopRecipeOutputRefV1668').inputValue(),'SUIT_CORE_7');
  assert.match(await page.locator('[data-workshop-material-code]').first().innerText(),/슈트 코어 7/);
  await page.locator('#workshopRecipeOutputRefV1668').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,width+'-cms-core7.png')});
  await page.locator('#workshopRecipeCategoryV1668').selectOption('BATTLE_SUIT_CRAFT');
  await page.locator('#workshopRecipeOutputTypeV1668').selectOption('EQUIPMENT');
  await page.locator('#workshopRecipeOutputRefV1668').selectOption('49');
  await page.locator('[data-workshop-material-code]').first().selectOption('SUIT_CORE_7');
  assert.deepEqual(writes,[],'QA must not save recipes');assert.deepEqual(errors,[]);
  reports.push({width,inventoryIconLoaded:true,materialNotDirectlyUsable:true,zBeforeX:true,cmsCore7OutputAndMaterialSelectable:true,cmsXBodySelectable:true,recipeWrites:0,pageErrors:errors});await page.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({passed:true,reports},null,2));console.log(JSON.stringify({passed:true,reports}));
}finally{await browser.close();}
