// Actual app shell; all API calls are isolated local fixtures, never real spending.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8913';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local isolated QA server required');
const out=process.env.WORKSHOP_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'workshop-material-batch-'));
fs.mkdirSync(out,{recursive:true});
const recipe={id:80,name:'미스틱 에너지 제작',code:'WORKSHOP_MYSTIC_ENERGY',category:'MATERIAL_CRAFT',output_type:'INVENTORY_ITEM',output_ref:'STARLIGHT_ARMOR_CORE',output_name:'미스틱 에너지',output_image:'assets/items/starlight-armor-core-v1749.png',output_quantity:1,success_rate:10,payment_mode:'COIN_AND_CARD_SHARD',coin_cost:200000000,card_shard_cost:5000000,materials:[],description:'코인과 카드 조각을 사용해 미스틱 에너지를 제작합니다.'};
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[];let activePage;
try {
  for(const [width,height] of [[1440,1000],[390,844]]) {
    const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
    activePage=page;
    const state={wallet:{coin:30000000000,cardShards:500000000,masterStars:1000},inventory:{STARLIGHT_ARMOR_CORE:{code:'STARLIGHT_ARMOR_CORE',name:'미스틱 에너지',image_url:recipe.output_image,quantity:0}},recipes:[recipe],synthesis:[]};
    const writes=[],dialogs=[],receipts=new Map();let disconnect=width===1440,charges=0;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
    await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
    await page.route('**/api/workshop**',async route=>{
      if(route.request().method()==='GET')return route.fulfill({json:state});
      const body=route.request().postDataJSON();writes.push(body);
      if(!receipts.has(body.requestId)) {
        charges++;const attempts=body.attempts,successCount=Math.floor(attempts/3);
        state.wallet.coin-=attempts*recipe.coin_cost;state.wallet.cardShards-=attempts*recipe.card_shard_cost;state.inventory.STARLIGHT_ARMOR_CORE.quantity+=successCount;
        receipts.set(body.requestId,{ok:true,requestId:body.requestId,recipeId:80,recipeName:recipe.name,attempts,successCount,failureCount:attempts-successCount,success:successCount>0,output:successCount?{name:recipe.output_name,image:recipe.output_image,quantity:successCount}:null,state});
      }
      if(disconnect){disconnect=false;return route.abort('failed');}
      return route.fulfill({json:receipts.get(body.requestId)});
    });
    await page.goto(base+'/?screen=fusion',{waitUntil:'domcontentloaded'});
    const root=page.locator('#workshopRootV1881');await root.locator('.ws81-nav').waitFor();
    await root.locator('[data-ws-section="MATERIAL_CRAFT"]').click();
    assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'1');
    await root.locator('#wsMaterialMore').click();assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'2');
    await root.locator('#wsMaterialLess').click();assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'1');
    await root.locator('#wsMaterialMax').click();assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'100');
    await root.locator('#wsMaterialAttempts').fill('101');assert.equal(await root.locator('#wsMaterialCraft').isDisabled(),true);
    await root.locator('#wsMaterialAttempts').fill('1.5');assert.equal(await root.locator('#wsMaterialCraft').isDisabled(),true);
    await root.locator('#wsMaterialAttempts').fill('10');
    assert.equal(await root.locator('#wsMaterialAttempts').evaluate(el=>document.activeElement===el),true);
    assert.match(await root.locator('.ws22-requirements').innerText(),/2,000,000,000/);
    assert.match(await root.locator('.ws22-requirements').innerText(),/50,000,000/);
    assert.equal(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.evaluate(()=>document.fonts.ready);
    await root.locator('#wsMaterialAttempts').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,width+'-quantity.png')});
    await root.locator('#wsMaterialCraft').click();
    if(width===1440) {
      await root.locator('#wsMaterialCraft').filter({hasText:'이전 제작 결과 확인'}).waitFor();
      assert.equal(await root.locator('#wsMaterialAttempts').isDisabled(),true);
      // Resume after a full reload with the batch size and request ID intact.
      await page.goto(base+'/?screen=fusion',{waitUntil:'domcontentloaded'});await root.locator('.ws81-nav').waitFor();
      await root.locator('[data-ws-section="MATERIAL_CRAFT"]').click();
      assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'10');
      await root.locator('#wsMaterialCraft').click();
      assert.deepEqual(writes[1],writes[0]);assert.equal(charges,1);
    }
    await page.locator('.ws81-material-result').waitFor();
    assert.match(await page.locator('.ws28-material-summary').innerText(),/제작 10회/);
    assert.match(await page.locator('.ws28-material-summary').innerText(),/성공 3회/);
    assert.match(await page.locator('.ws28-material-summary').innerText(),/실패 7회/);
    await page.screenshot({path:path.join(out,width+'-result.png')});
    assert.ok(dialogs.some(value=>value.includes('10회 제작')&&value.includes('50,000,000')));
    await page.locator('.ws81-material-result button').click();
    assert.match(await root.locator('.ws22-item-output').innerText(),/현재 보유 3개/);
    await root.locator('#wsMaterialMax').click();assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'90');
    await root.locator('#wsMaterialAttempts').fill('91');assert.equal(await root.locator('#wsMaterialCraft').isDisabled(),true);
    // A single failed attempt remains a supported path.
    await root.locator('#wsMaterialAttempts').fill('1');await root.locator('#wsMaterialCraft').click();
    await page.locator('.ws81-material-result.is-failed').waitFor();
    assert.match(await page.locator('.ws28-material-summary').innerText(),/실패 1회/);
    checks.push({width,charges,requests:writes.length,quantityAndResults:true,recovery:width===1440});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({ok:true,out,checks}));
} catch(error) {
  if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(out,'failure.png')});console.error(JSON.stringify({url:activePage.url(),errors,body:(await activePage.locator('body').innerText()).slice(-2500)}));}
  throw error;
} finally {await browser.close();}
