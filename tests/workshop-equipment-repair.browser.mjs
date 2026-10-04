// Real local SQL + production clients. Never changes production accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8803';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local fixture only');
const out=process.env.WORKSHOP_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'craft-repair-'));fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const check=(ok,label)=>{assert.ok(ok,label);checks.push(label)};
try{
 for(const [width,height] of [[1440,1000],[390,844]]){
  await fetch(base+'/qa/reset?mode=repair',{method:'POST'});
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<600,serviceWorkers:'block',reducedMotion:'reduce'}),size=width+'x'+height,dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').click();await page.locator('#wsCraftEquipment').waitFor();
  const heading=await page.locator('.ws22-item-head').innerText();check(heading.includes('실패 시 +10 장비가 소모')&&heading.includes('리페어권')&&!heading.includes('보존'),size+' header follows consume/repair policy instead of stale description');
  await page.locator('#wsMaterialCraft').click();await page.locator('.ef-handle').waitFor();await page.locator('[data-skip]').click();await page.locator('.ef-reveal[data-phase="result"]').waitFor();
  check(dialogs.at(-1).includes('리페어권')&&!dialogs.at(-1).includes('영구 소모'),size+' confirmation states repairability');
  const link=page.locator('.ef-repair'),href=await link.getAttribute('href');check(href?.startsWith('/equipment-forge/?restoreRecord='),size+' receipt links exact repair record');
  check((await page.locator('.ef-result').innerText()).includes('제작 재료·재화는 반환되지 않습니다'),size+' no currency refund promised');
  const bounds=await link.boundingBox();check(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height,size+' repair button fits viewport');
  await page.screenshot({path:path.join(out,size+'-failure-repair.png')});
  await link.click();await page.locator('#restore-button:not([disabled])').waitFor();
  check(await page.locator('#tab-restore').getAttribute('aria-selected')==='true',size+' linked archive selected');
  check((await page.locator('#stage-level').innerText())==='소모 당시 +10',size+' consumed enhancement level shown');
  check((await page.locator('.restore-snapshot').innerText()).includes('+10 복구'),size+' original enhancement restored');
  const costs=await page.locator('.restore-policy').innerText();check(/1,?000억/.test(costs)&&costs.includes('1개'),size+' existing 100 billion / one coupon policy displayed');
  check(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth+1),size+' forge no horizontal overflow');
  await page.locator('#restore-button').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,size+'-restore-quote.png')});
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/character/equipment/forge/restore')&&r.request().method()==='POST'),page.locator('#restore-button').click()]);
  const receipt=await response.json();check(response.ok()&&receipt.level===10&&receipt.outcome==='RESTORED',size+' real repair API restores +10');
  await page.locator('.empty-inventory').filter({hasText:'복구할 파괴 기록이 없습니다'}).waitFor({timeout:20000});
  await page.goto(base+href);await page.locator('#tab-restore[aria-selected="true"]').waitFor();
  check(await page.locator('#restore-button').isDisabled(),size+' used record link cannot select or restore another item');
  await page.goto(base+'/qa/cms');await page.locator('#nav [data-view="workshop"]').click();await page.locator('#workshopAdminEasternDraft').click();
  check(await page.locator('#workshopCraftFailurePolicy').inputValue()==='CONSUME'&&await page.locator('#workshopCraftRepairPolicy').inputValue()==='1',size+' Eastern draft consumes and allows repair');
  check(!await page.locator('#workshopRecipeActiveV1668').isChecked()&&!await page.locator('#workshopRecipePublicV1668').isChecked(),size+' new Eastern draft remains OFF/hidden');
  check(await page.locator('#workshopRecipeStarV1668').getAttribute('max')==='20000000',size+' CMS star input accepts 20 million');
  await page.locator('#workshopRecipeNameV1668').fill('격리 동방무기 복구 검수');await page.locator('#workshopRecipeOutputRefV1668').selectOption('102');await page.locator('#workshopCraftInput').selectOption('101');await page.locator('#workshopCraftPity').fill('3');await page.locator('#workshopRecipeCoinV1668').fill('1000000000000');await page.locator('#workshopRecipeStarV1668').fill('20000000');
  await page.locator('#workshopMaterialAddV1668').click();await page.locator('[data-workshop-material-code]').selectOption('QA_MATERIAL');await page.locator('[data-workshop-material-qty]').fill('5');
  const [saved]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/workshop')&&r.request().method()==='POST'),page.locator('#workshopRecipeSaveV1668').press('Enter')]);check(saved.ok(),size+' CMS saves repair policy plus 20 million stars');
  await page.waitForFunction(()=>!document.querySelector('#workshopRecipeSaveV1668').disabled);await page.locator('#workshopAdminReloadV1668').click();await page.locator('#workshopCraftPity').waitFor();
  check(await page.locator('#workshopCraftRepairPolicy').inputValue()==='1'&&await page.locator('#workshopRecipeStarV1668').inputValue()==='20000000',size+' saved policy and cost survive reload');
  await page.locator('.workshop-equipment-policy').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,size+'-cms-repair.png'),fullPage:true});
  await page.locator('#workshopCraftFailurePolicy').selectOption('PRESERVE');check(await page.locator('#workshopCraftRepairPolicy').isDisabled()&&await page.locator('#workshopCraftRepairPolicy').inputValue()==='0',size+' preservation clears incompatible repair setting');
  await page.close();
 }
 check(errors.length===0,'No page errors: '+errors.join('; '));fs.writeFileSync(path.join(out,'ui-results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out}));
}finally{await browser.close()}
