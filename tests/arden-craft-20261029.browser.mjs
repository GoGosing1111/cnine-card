// Real workshop/CMS scripts with isolated database and accounts only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8819';
assert.equal(new URL(base).hostname,'127.0.0.1');
const out=process.env.WORKSHOP_QA_DIR;assert(out);fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],check=(ok,message)=>{assert(ok,message);checks.push(message);};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{for(const [width,height]of [[1440,1000],[390,844]]){
 await fetch(base+'/qa/reset?mode=arden',{method:'POST'});
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'}),dialogs=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/workshop/equipment-craft'))writes.push(r.postDataJSON());});
 await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').click();await page.locator('#wsCraftEquipment').waitFor();
 const names=['아르덴 아머','아르덴 그리브','아르덴 부츠','아르덴 듀얼디스크'];
 for(const [i,name]of names.entries()){
  await page.locator('[data-material-recipe]').filter({hasText:name}).click();
  const text=await page.locator('.ws28-equipment-stage').innerText();check(text.includes('+15')&&text.includes('최대 4회')&&text.includes('50조')&&text.includes('아르덴 에너지'),width+' '+name+' exact requirements');check(!text.includes('마스터의 별'),width+' '+name+' no star charge');
  check(await page.locator('#wsCraftEquipment option').count()===(i===0?2:1),width+' '+name+' correct eligible instances');
  await page.waitForFunction(()=>[...document.querySelectorAll('.ws28-forge-chain img')].every(i=>i.complete&&i.naturalWidth>0));
  check(await page.locator('#workshopRootV1881').evaluate(e=>e.scrollWidth-e.clientWidth)<=1,width+' '+name+' no horizontal overflow');
  await page.screenshot({path:path.join(out,width+'-'+i+'-recipe.png'),fullPage:true});
 }
 await page.locator('[data-material-recipe]').filter({hasText:names[0]}).click();
 for(let attempt=1;attempt<=4;attempt++){
  await page.locator('#wsMaterialCraft').click();await page.locator('.ef-handle').waitFor();await page.locator('.ef-handle').press('End');await page.locator('.ef-reveal[data-phase="result"]').waitFor();
  const result=await page.locator('.ef-result').innerText();check(result.includes(attempt===4?'아르덴 아머 +0 획득':'+15 엠퍼러 슈트 보존'),width+' attempt '+attempt+' result');check(!result.includes('마스터의 별'),width+' attempt '+attempt+' no star cost');
  if(attempt===3)check(result.includes('다음 제작 100% 성공'),width+' fourth guaranteed');
  await page.screenshot({path:path.join(out,width+'-attempt-'+attempt+'.png')});await page.locator('.ef-done').click();
  if(attempt===1){await page.reload();await page.locator('[data-ws-section="ITEM_SYNTHESIS"]').click();await page.locator('#wsCraftEquipment').waitFor();await page.locator('[data-material-recipe]').filter({hasText:names[0]}).click();check((await page.locator('.ws28-forge-pity').innerText()).includes('1 / 3회'),width+' reconnect preserves pity');await page.locator('#wsCraftEquipment').selectOption('210');}
 }
 check(writes.length===4,width+' four requests only');check(dialogs.every(d=>!d.includes('마스터의 별'))&&dialogs.some(d=>d.includes('+15 엠퍼러 슈트')&&d.includes('100%')),width+' confirmations correct');
 check((await page.locator('.ws28-forge-pity').innerText()).includes('0 / 3회'),width+' success resets pity');
 await page.goto(base+'/qa/cms');await page.locator('#nav [data-view="workshop"]').click();await page.locator('[data-workshop-recipe-id]').filter({hasText:names[0]}).click();
 check(await page.locator('#workshopCraftLevel').inputValue()==='15',width+' CMS +15');check(await page.locator('#workshopRecipePaymentV1668').inputValue()==='COIN_ONLY',width+' CMS coin only');check(await page.locator('#workshopRecipeStarV1668').inputValue()==='0',width+' CMS stars zero');check(await page.locator('#workshopCraftPity').inputValue()==='3',width+' CMS three failures then fourth');
 const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/workshop')&&r.request().method()==='POST'),page.locator('#workshopRecipeSaveV1668').press('Enter')]);check(response.ok(),width+' CMS save');await page.locator('#workshopAdminReloadV1668').click();await page.locator('#workshopCraftLevel').waitFor();check(await page.locator('#workshopCraftLevel').inputValue()==='15',width+' CMS save preserves required level');
 await page.screenshot({path:path.join(out,width+'-cms.png'),fullPage:true});await page.close();
}check(errors.length===0,'no browser exceptions');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));}finally{await browser.close();}
