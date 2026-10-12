// Real app shell with local API fixtures; no production resources are spent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8913';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local isolated QA server required');
const out=process.env.WORKSHOP_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'workshop-suit-core-batch-'));
fs.mkdirSync(out,{recursive:true});
const core={id:81,name:'슈트 코어 2 합성',code:'QA_CORE_2',category:'SUIT_CORE_SYNTHESIS',output_type:'INVENTORY_ITEM',output_ref:'SUIT_CORE_2',output_name:'슈트 코어 2',output_image:'assets/items/suit-core-2-v2004.png',output_quantity:2,success_rate:25,payment_mode:'BOTH',coin_cost:200000000,master_star_cost:100,materials:[{item_code:'SUIT_CORE_1',item_name:'슈트 코어 1',image_url:'assets/items/suit-core-1-v2004.png',quantity:10}],description:'슈트 코어 1과 코인·마스터의 별을 사용해 합성합니다.'};
const energy={...core,id:80,name:'엠퍼러 에너지 제작',code:'QA_EMPEROR',category:'MATERIAL_CRAFT',output_ref:'EMPEROR_ENERGY',output_name:'엠퍼러 에너지',output_image:'assets/items/emperor-energy-v1.webp',output_quantity:1,materials:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[];let activePage;
try {
  for(const [width,height] of [[1440,1000],[390,844]]) {
    const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});activePage=page;
    const state={wallet:{coin:30000000000,cardShards:0,masterStars:1500},inventory:{SUIT_CORE_1:{quantity:205},SUIT_CORE_2:{quantity:0}},recipes:[energy,core],synthesis:[]};
    const writes=[],dialogs=[],receipts=new Map();let disconnect=width===1440,charges=0;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
    await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
    await page.route('**/api/workshop**',async route=>{
      if(route.request().method()==='GET')return route.fulfill({json:state});
      const body=route.request().postDataJSON();writes.push(body);assert.equal(body.recipeId,core.id);assert.equal(body.paymentType,'BOTH');
      if(!receipts.has(body.requestId)) {
        charges++;const attempts=body.attempts,successCount=Math.floor(attempts/3),quantity=successCount*core.output_quantity;
        state.wallet.coin-=attempts*core.coin_cost;state.wallet.masterStars-=attempts*core.master_star_cost;
        state.inventory.SUIT_CORE_1.quantity-=attempts*10;state.inventory.SUIT_CORE_2.quantity+=quantity;
        receipts.set(body.requestId,{ok:true,requestId:body.requestId,recipeId:core.id,recipeName:core.name,category:core.category,attempts,successCount,failureCount:attempts-successCount,success:successCount>0,output:successCount?{name:core.output_name,image:core.output_image,quantity}:null});
      }
      if(disconnect){disconnect=false;return route.abort('failed');}
      return route.fulfill({json:{...receipts.get(body.requestId),state}});
    });
    await page.goto(base+'/?screen=fusion',{waitUntil:'domcontentloaded'});
    const root=page.locator('#workshopRootV1881');await root.locator('.ws81-nav').waitFor();
    await root.locator('[data-ws-section="SUIT_CORE_SYNTHESIS"]').click();
    assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'1');
    await root.locator('#wsMaterialMore').click();assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'2');
    await root.locator('#wsMaterialLess').click();assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'1');
    const maximum=async expected=>{await root.locator('#wsMaterialMax').click();assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),String(expected));};
    const refresh=async()=>{const read=page.waitForResponse(r=>r.url().includes('/api/workshop')&&r.request().method()==='GET');await root.locator('[data-ws-refresh]').click();await read;await root.locator('#wsMaterialAttempts').waitFor();};
    await maximum(15); // stars limit
    state.wallet.coin=1000000000;await refresh();await maximum(5); // coin limit
    state.inventory.SUIT_CORE_1.quantity=25;await refresh();await maximum(2); // core limit
    state.wallet.coin=30000000000;state.wallet.masterStars=20000;state.inventory.SUIT_CORE_1.quantity=2000;
    await refresh();await maximum(100); // request cap
    state.wallet.masterStars=1500;state.inventory.SUIT_CORE_1.quantity=205;await refresh();
    for(const value of ['101','1.5','0','16']) {await root.locator('#wsMaterialAttempts').fill(value);assert.equal(await root.locator('#wsMaterialCraft').isDisabled(),true);}
    await root.locator('#wsMaterialAttempts').fill('10');
    assert.equal(await root.locator('#wsMaterialAttempts').evaluate(el=>document.activeElement===el),true);
    for(const [name,amount] of [['슈트 코어 1','100'],['코인','20억'],['마스터의 별','1,000']]) {
      assert.match(await root.locator('.ws22-cost').filter({has:page.locator('b',{hasText:name})}).locator('strong').innerText(),new RegExp(amount));
    }
    assert.equal(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.evaluate(()=>document.fonts.ready);
    await root.locator('#wsMaterialAttempts').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,width+'-quantity.png')});
    await root.locator('#wsMaterialCraft').click();
    if(width===1440) {
      await root.locator('#wsMaterialCraft').filter({hasText:'이전 제작 결과 확인'}).waitFor();
      assert.equal(await root.locator('#wsMaterialAttempts').isDisabled(),true);
      await page.goto(base+'/?screen=fusion',{waitUntil:'domcontentloaded'});await root.locator('.ws81-nav').waitFor();
      await root.locator('[data-ws-section="SUIT_CORE_SYNTHESIS"]').click();
      assert.equal(await root.locator('#wsMaterialAttempts').inputValue(),'10');
      await root.locator('#wsMaterialCraft').click();
      assert.deepEqual(writes[1],writes[0]);assert.equal(charges,1);
    }
    await page.locator('.ws81-material-result').waitFor();
    const summary=await page.locator('.ws28-material-summary').innerText();
    for(const label of ['제작 10회','성공 3회','실패 7회'])assert.ok(summary.includes(label),summary);
    assert.match(await page.locator('.ws81-material-result').innerText(),/슈트 코어 2 × 6/);
    await page.screenshot({path:path.join(out,width+'-result.png')});
    assert.ok(dialogs.some(value=>value.includes('10회 제작')&&value.includes('20억')&&value.includes('1,000')));
    await page.locator('.ws81-material-result button').click();
    assert.match(await root.locator('.ws22-item-output').innerText(),/현재 보유 6개/);
    await maximum(5);
    await root.locator('#wsMaterialAttempts').fill('1');await root.locator('#wsMaterialCraft').click();
    await page.locator('.ws81-material-result.is-failed').waitFor();
    assert.match(await page.locator('.ws28-material-summary').innerText(),/실패 1회/);
    await page.locator('.ws81-material-result button').click();
    await root.locator('[data-ws-section="MATERIAL_CRAFT"]').click();await maximum(4);
    assert.match(await root.locator('.ws22-item-head').innerText(),/엠퍼러 에너지/);
    checks.push({width,charges,requests:writes.length,limits:['core','coin','stars','100'],totalsAndResults:true,emperorBulkPreserved:true,recovery:width===1440});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2)+'\n');
  console.log(JSON.stringify({ok:true,out,checks}));
} catch(error) {
  if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(out,'failure.png')});console.error(JSON.stringify({url:activePage.url(),errors,body:(await activePage.locator('body').innerText()).slice(-2500)}));}
  throw error;
} finally {await browser.close();}
