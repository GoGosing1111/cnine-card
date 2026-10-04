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
async function slide(page,fraction=1,touch=false){
 const h=await page.locator('.ef-handle').boundingBox(),t=await page.locator('.ef-track').boundingBox(),x=h.x+h.width/2,y=h.y+h.height/2,end=x+(t.width-h.width-12)*fraction;
 if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*i/12,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else {await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(end,y,{steps:18});await page.mouse.up();}
}
try{
 for(const [width,height] of [[1440,1000],[390,844]].filter(([w])=>!process.env.WORKSHOP_QA_WIDTH||String(w)===process.env.WORKSHOP_QA_WIDTH)){
  await fetch(base+'/qa/reset?mode=emperor',{method:'POST'});
  let page=await browser.newPage({viewport:{width,height},hasTouch:width<600,serviceWorkers:'block'});const size=width+'x'+height,writes=[],dialogs=[];
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
  await page.locator('#wsMaterialCraft').click();await page.locator('.ef-reveal[data-phase="sealed"]').waitFor();
  await page.waitForTimeout(650);await page.screenshot({path:path.join(out,size+'-sealed.png')});
  check(await page.locator('.ef-result').isHidden(),size+' result remains sealed until user input');
  await slide(page,.45,width<600);await page.waitForTimeout(350);
  check(await page.locator('.ef-handle').getAttribute('aria-valuenow')==='0',size+' incomplete slide resets');check(writes.length===1,size+' partial slide never recrafts');
  await slide(page,1,width<600);await page.waitForTimeout(600);await page.screenshot({path:path.join(out,size+'-opening.png')});
  await page.locator('.ef-reveal[data-phase="result"]').waitFor();await page.screenshot({path:path.join(out,size+'-failed.png')});
  check(writes.length===1,size+' full slide reveals same saved receipt');
  check((await page.locator('.ef-result').innerText()).includes('+10 금룡 돌격소총 보존'),size+' failure preserves input');
  await page.locator('.ef-done').click();await page.reload();await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').click();await page.locator('#wsCraftEquipment').waitFor();
  check((await page.locator('.ws28-forge-pity').innerText()).includes('1 / 2회'),size+' reload preserves failure');
  await page.locator('#wsCraftEquipment').selectOption('2');await page.locator('#wsMaterialCraft').click();await page.locator('.ef-reveal[data-phase="sealed"]').waitFor();await page.locator('[data-skip]').click();await page.locator('.ef-reveal[data-phase="result"]').waitFor();
  check((await page.locator('.ef-result').innerText()).includes('다음 제작 100% 성공'),size+' Nth failure readies next attempt');
  await page.locator('.ef-done').click();check((await page.locator('#wsMaterialCraft').innerText()).includes('100% 확정 제작'),size+' guaranteed action visible');
  await page.screenshot({path:path.join(out,size+'-guaranteed.png'),fullPage:true});
  // Lose the response AFTER the real local SQL transaction has committed.
  let lose=true;await page.route('**/api/workshop/equipment-craft',async route=>{if(lose){lose=false;await route.fetch();await route.fulfill({status:503,json:{error:'격리 검수: 응답 유실'}})}else await route.continue()});
  await page.locator('#wsMaterialCraft').click();await page.locator('#wsMaterialCraft').filter({hasText:'이전 제작 결과 확인'}).waitFor();
  await page.locator('#wsMaterialCraft').click();await page.locator('.ef-reveal[data-phase="sealed"]').waitFor();await page.locator('[data-skip]').click();await page.locator('.ef-reveal[data-phase="result"]').waitFor();
  await page.waitForTimeout(1050);await page.screenshot({path:path.join(out,size+'-success.png')});
  check((await page.locator('.ef-reveal').innerText()).includes('장비 제작 성공'),size+' committed result recovered');
  check(writes.length===4&&writes[2].requestId===writes[3].requestId&&writes[3].instanceId==='2',size+' HTTP 503 retries same consumed instance and request');
  await page.locator('.ef-done').click();check((await page.locator('.ws28-forge-pity').innerText()).includes('0 / 2회'),size+' success resets saved pity');
  check(await page.locator('#wsCraftEquipment option').count()===1,size+' only successful input consumed');
  check(dialogs.some(s=>s.includes('이번 성공 확률 100%')&&s.includes('결과 장비 +0')),size+' confirmation states chance and output level');
  }
  await page.close();page=await browser.newPage({viewport:{width,height},hasTouch:width<600,serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
  await page.goto(base+'/qa/cms');await page.locator('#nav [data-view="workshop"]').click();await page.locator('#workshopAdminItemDraft').click();
  for(const id of ['workshopRecipeCoinV1668','workshopRecipeStarV1668','workshopCraftPity'])check(await page.locator('#'+id).inputValue()==='',size+' CMS leaves '+id+' unspecified');
  check(await page.locator('#workshopRecipeRateV1668').inputValue()==='10'&&await page.locator('#workshopRecipeRateV1668').getAttribute('readonly')!==null,size+' CMS fixed 10%');
  check(!await page.locator('#workshopRecipeActiveV1668').isChecked()&&!await page.locator('#workshopRecipePublicV1668').isChecked(),size+' CMS draft OFF and hidden');
  check(await page.locator('#workshopCraftFailurePolicy').inputValue()==='PRESERVE',size+' CMS existing/default input protection');
  await page.locator('#workshopAdminEasternDraft').click();
  check(await page.locator('#workshopCraftFailurePolicy').inputValue()==='CONSUME',size+' Eastern draft consumes failed +10');
  check(!await page.locator('#workshopRecipeActiveV1668').isChecked()&&!await page.locator('#workshopRecipePublicV1668').isChecked(),size+' Eastern draft stays OFF/hidden');
  check(await page.locator('#workshopCraftPity').inputValue()===''&&await page.locator('#workshopRecipeCoinV1668').inputValue()==='',size+' Eastern costs and ceiling unspecified');
  await page.locator('#workshopRecipeNameV1668').fill('격리 장비제작 검수');await page.locator('#workshopRecipeOutputRefV1668').selectOption('102');await page.locator('#workshopCraftInput').selectOption('101');
  await page.locator('#workshopCraftPity').fill('3');await page.locator('#workshopRecipeCoinV1668').fill('1000000000000');await page.locator('#workshopRecipeStarV1668').fill('30');
  await page.locator('#workshopMaterialAddV1668').click();await page.locator('[data-workshop-material-code]').selectOption('QA_MATERIAL');await page.locator('[data-workshop-material-qty]').fill('5');
  await page.locator('.workshop-equipment-policy').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,size+'-cms.png'),fullPage:true});
  check(await page.locator('#view-workshop').evaluate(e=>e.scrollWidth-e.clientWidth)<=1,size+' CMS no horizontal overflow');
  const [savedResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/workshop')&&r.request().method()==='POST'),page.locator('#workshopRecipeSaveV1668').press('Enter')]).catch(error=>{throw new Error(error.message+' Dialogs: '+JSON.stringify(dialogs))});check(savedResponse.ok(),size+' CMS save API status');await page.waitForFunction(()=>!document.querySelector('#workshopRecipeSaveV1668')?.disabled);
  check(dialogs.includes('제작 레시피를 저장했습니다.'),size+' CMS save succeeds');
  await page.locator('#workshopAdminReloadV1668').click();await page.locator('#workshopCraftPity').waitFor();
  check(await page.locator('#workshopCraftPity').inputValue()==='3',size+' CMS threshold survives reload');
  check(await page.locator('#workshopCraftFailurePolicy').inputValue()==='CONSUME',size+' failure policy persists through save/reload');
  // Destructive failure presentation and accessibility use only isolated stock.
  await fetch(base+'/qa/reset?mode=consume',{method:'POST'});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').click();await page.locator('#wsCraftEquipment').waitFor();
  check((await page.locator('.ws22-risk').innerText()).includes('실패 시 +10 장비 소모'),size+' destructive input policy shown before spending');
  await page.locator('#wsMaterialCraft').click();await page.locator('.ef-handle').waitFor();
  check(dialogs.at(-1).includes('영구 소모'),size+' spending confirmation explains permanent input loss');
  await page.locator('.ef-handle').press('End');await page.locator('.ef-reveal[data-phase="result"]').waitFor();
  check((await page.locator('.ef-result').innerText()).includes('+10 금룡 돌격소총 소모'),size+' authoritative destructive failure shown');
  check(!(await page.locator('.ef-result').innerText()).includes('보존'),size+' consumed input never labelled preserved');
  check(await page.locator('.ef-reveal').getAttribute('data-motion')==='reduced',size+' reduced motion and keyboard reveal');
  await page.screenshot({path:path.join(out,size+'-consumed.png')});await page.locator('.ef-done').press('Enter');
  await page.locator('#wsMaterialCraft').click();await page.locator('.ef-handle').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cnine:route-will-change')));
  await page.locator('.ef-reveal').waitFor({state:'detached'});check(await page.evaluate(()=>document.body.style.overflow!=='hidden'),size+' navigation restores scrolling and cleans overlay');
  await page.close();
 }
 check(errors.length===0,'zero JavaScript errors: '+errors.join('; '));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,out}));
}finally{await browser.close()}
