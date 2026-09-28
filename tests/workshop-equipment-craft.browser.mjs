// Requires the isolated local workshop API fixture; never writes to production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8803';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Isolated localhost only');
const out=process.env.WORKSHOP_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'equipment-craft-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const check=(ok,label)=>{assert.ok(ok,label);checks.push(label)};
try{
 for(const [width,height] of [[1440,1000],[390,844]].filter(([w])=>!process.env.WORKSHOP_QA_WIDTH||String(w)===process.env.WORKSHOP_QA_WIDTH)){
  await fetch(base+'/qa/reset',{method:'POST'});
  let page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});const size=width+'x'+height,writes=[],dialogs=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  page.on('request',r=>{if(r.url().endsWith('/api/workshop/equipment-craft')&&r.method()==='POST')writes.push(r.postDataJSON())});
  if(process.env.WORKSHOP_QA_CMS_ONLY!=='1'){
  await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').click();await page.locator('#wsCraftEquipment').waitFor();
  check(await page.locator('#wsCraftEquipment option').count()===2,size+' only eligible unequipped +10 instances');
  check((await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').innerText()).includes('장비제작'),size+' renamed category');
  check((await page.locator('.ws28-forge-pity').innerText()).includes('0 / 2회'),size+' initial saved pity');
  await page.screenshot({path:path.join(out,size+'-craft.png'),fullPage:true});
  const layout=await page.locator('#workshopRootV1881').evaluate(e=>({overflow:e.scrollWidth-e.clientWidth,broken:[...e.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)}));
  check(layout.overflow<=1,size+' no horizontal overflow');check(!layout.broken.length,size+' loaded images intact');
  await page.locator('#wsMaterialCraft').click();await page.locator('#modal.show').waitFor();
  check((await page.locator('#modal').innerText()).includes('+10 금룡 돌격소총 보존'),size+' failure preserves input');
  await page.locator('#modal button').click();await page.reload();await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').click();await page.locator('#wsCraftEquipment').waitFor();
  check((await page.locator('.ws28-forge-pity').innerText()).includes('1 / 2회'),size+' reload preserves failure');
  await page.locator('#wsCraftEquipment').selectOption('2');await page.locator('#wsMaterialCraft').click();await page.locator('#modal.show').waitFor();
  check((await page.locator('#modal').innerText()).includes('다음 제작 100% 성공'),size+' Nth failure readies next attempt');
  await page.locator('#modal button').click();check((await page.locator('#wsMaterialCraft').innerText()).includes('100% 확정 제작'),size+' guaranteed action visible');
  await page.screenshot({path:path.join(out,size+'-guaranteed.png'),fullPage:true});
  // Lose the response AFTER the real local SQL transaction has committed.
  let lose=true;await page.route('**/api/workshop/equipment-craft',async route=>{if(lose){lose=false;await route.fetch();await route.fulfill({status:503,json:{error:'격리 검수: 응답 유실'}})}else await route.continue()});
  await page.locator('#wsMaterialCraft').click();await page.locator('#wsMaterialCraft').filter({hasText:'이전 제작 결과 확인'}).waitFor();
  await page.locator('#wsMaterialCraft').click();await page.locator('#modal.show').waitFor();
  check((await page.locator('#modal').innerText()).includes('장비 제작 성공'),size+' committed result recovered');
  check(writes.length===4&&writes[2].requestId===writes[3].requestId&&writes[3].instanceId==='2',size+' HTTP 503 retries same consumed instance and request');
  await page.locator('#modal button').click();check((await page.locator('.ws28-forge-pity').innerText()).includes('0 / 2회'),size+' success resets saved pity');
  check(await page.locator('#wsCraftEquipment option').count()===1,size+' only successful input consumed');
  check(dialogs.some(s=>s.includes('이번 성공 확률 100%')&&s.includes('결과 장비 +0')),size+' confirmation states chance and output level');
  }
  await page.close();page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
  await page.goto(base+'/qa/cms');await page.locator('#nav [data-view="workshop"]').click();await page.locator('#workshopAdminItemDraft').click();
  for(const id of ['workshopRecipeCoinV1668','workshopRecipeStarV1668','workshopCraftPity'])check(await page.locator('#'+id).inputValue()==='',size+' CMS leaves '+id+' unspecified');
  check(await page.locator('#workshopRecipeRateV1668').inputValue()==='10'&&await page.locator('#workshopRecipeRateV1668').getAttribute('readonly')!==null,size+' CMS fixed 10%');
  check(!await page.locator('#workshopRecipeActiveV1668').isChecked()&&!await page.locator('#workshopRecipePublicV1668').isChecked(),size+' CMS draft OFF and hidden');
  await page.locator('#workshopRecipeNameV1668').fill('격리 장비제작 검수');await page.locator('#workshopRecipeOutputRefV1668').selectOption('102');await page.locator('#workshopCraftInput').selectOption('101');
  await page.locator('#workshopCraftPity').fill('3');await page.locator('#workshopRecipeCoinV1668').fill('1000000000000');await page.locator('#workshopRecipeStarV1668').fill('30');
  await page.locator('#workshopMaterialAddV1668').click();await page.locator('[data-workshop-material-code]').selectOption('QA_MATERIAL');await page.locator('[data-workshop-material-qty]').fill('5');
  await page.locator('.workshop-equipment-policy').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,size+'-cms.png'),fullPage:true});
  check(await page.locator('#view-workshop').evaluate(e=>e.scrollWidth-e.clientWidth)<=1,size+' CMS no horizontal overflow');
  const [savedResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/workshop')&&r.request().method()==='POST'),page.locator('#workshopRecipeSaveV1668').press('Enter')]).catch(error=>{throw new Error(error.message+' Dialogs: '+JSON.stringify(dialogs))});check(savedResponse.ok(),size+' CMS save API status');await page.waitForFunction(()=>!document.querySelector('#workshopRecipeSaveV1668')?.disabled);
  check(dialogs.includes('제작 레시피를 저장했습니다.'),size+' CMS save succeeds');
  await page.locator('#workshopAdminReloadV1668').click();await page.locator('#workshopCraftPity').waitFor();
  check(await page.locator('#workshopCraftPity').inputValue()==='3',size+' CMS threshold survives reload');
  await page.close();
 }
 check(errors.length===0,'zero JavaScript errors: '+errors.join('; '));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,out}));
}finally{await browser.close()}
