// Real game shell and inventory, with isolated local account/API fixtures.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {inventoryUiFixture} from './fixtures/inventory-ui-v2125.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.INVENTORY_QA_ORIGIN||'http://127.0.0.1:8910';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Use the local QA server, including for production static-file checks');
const out=process.env.INVENTORY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'inventory-v2125-browser-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const tiles=page=>page.locator('#inventoryGrid [data-inventory-select]');
const ready=page=>page.locator('#inventoryVault[aria-busy="false"]').waitFor();
const tile=(page,code)=>page.locator('#inventoryGrid [data-inventory-select="'+code+'"]');
async function launch(viewport){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
  const state={inventory:inventoryUiFixture(),writes:[],reads:0,fail:false,hold:false,release:null};
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-account-7'));
  await page.route('**/api/**',async r=>{
    const key=new URL(r.request().url()).pathname.slice(5),method=r.request().method();
    if(method==='POST')state.writes.push({key,body:r.request().postDataJSON()});
    if(key==='inventory'){
      state.reads++;
      if(state.hold)await new Promise(resolve=>{state.release=resolve;});
      return r.fulfill(state.fail?{status:503,json:{error:'인벤토리 연결 검수 오류'}}:{json:state.inventory});
    }
    if(key==='inventory/use'){
      const body=r.request().postDataJSON(),item=state.inventory.items.find(x=>x.code===body.itemCode);
      assert.equal(body.itemCode,'PREMIUM_CUBE');assert.equal(body.count,10);assert.ok(body.requestId);item.quantity-=body.count;
      const user=await (await page.request.get(base+'/api/me')).json();
      const catalog=await (await page.request.get(base+'/api/cards')).json();
      const card={...catalog.cards[0],grade:'FUR'};
      return r.fulfill({json:{count:10,remaining:item.quantity,results:Array.from({length:10},()=>({card,duplicate:true})),summary:{duplicates:10,newCards:0,gradeCounts:{FUR:10}},user:user.user}});
    }
    return r.continue();
  });
  await page.goto(base+'/?screen=inventory',{waitUntil:'domcontentloaded'});await ready(page);await page.evaluate(()=>document.fonts.ready);
  return {page,state};
}
async function bounds(page,size){
  const result=await page.evaluate(()=>{
    const body=document.querySelector('.v21-route-body'),host=document.querySelector('soop-adventure-lobby');
    return {overflow:body.scrollWidth-body.clientWidth,shared:!!host,
      tileOverflow:[...document.querySelectorAll('.iv25-item')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.dataset.inventorySelect),
      images:[...document.querySelectorAll('#inventoryGrid img')].filter(e=>e.complete&&!e.naturalWidth&&!e.hidden).map(e=>e.src)};
  });
  check(result.shared,size+' keeps the actual common navigation');
  check(result.overflow<=1,size+' has no horizontal content clipping');
  check(!result.tileOverflow.length,size+' slot labels and quantities fit: '+result.tileOverflow);
  check(!result.images.length,size+' loaded item images are valid');
}
try{
  const {page,state}=await launch({width:1440,height:900});
  const owned=state.inventory.items.filter(x=>x.quantity>0).length;
  check(await tiles(page).count()===owned,'initial view shows owned inventory only');
  await page.locator('#inventorySearch').fill('슈트 코어');
  check(await tiles(page).count()===6,'search finds all six released suit cores');
  check(await page.locator('#inventorySearch').evaluate(e=>e===document.activeElement),'typing preserves input focus');
  await page.locator('#inventoryNewOnly').click();check(await tiles(page).count()===2,'new filter combines with search');
  await page.locator('#inventoryNewOnly').click();await page.locator('#inventorySearch').fill('없는 아이템');
  check(await page.locator('.iv25-empty').innerText().then(s=>s.includes('검색 결과가 없습니다')),'no-match message is actionable');
  await page.locator('[data-inventory-reset]').click();check(await tiles(page).count()===state.inventory.items.length,'empty-state reset restores the full catalog');
  await page.locator('#inventoryOwnedOnly').check();await page.locator('#inventorySort').selectOption('QUANTITY');
  check(await tiles(page).first().getAttribute('data-inventory-select')==='MASTER_STAR','quantity sort orders the largest stack first');
  await tile(page,'MASTER_STAR').click();check((await page.locator('#inventoryDetail .iv25-quantity').innerText()).includes('1,234,567,890'),'detail retains exact quantity');
  check((await tile(page,'MASTER_STAR').innerText()).includes('12.3억'),'large tile quantity is readable');
  for(const code of ['SUIT_CORE_6','SKILL_CHIP_ROCKET_LAUNCHER','CORE_RAID_ENTRY_TICKET','PINGDU_WISH_TICKET','UNIQUE_ADVANCEMENT_PASS','BLACK_MIRACLE_PACK']){
    await tile(page,code).click();check(await page.locator('#inventoryDetail .iv25-use').isDisabled(),code+' retains server/crafting restrictions');
  }
  check(!state.writes.some(x=>x.key==='inventory/use'),'selection and restricted items consume nothing');
  await page.locator('#inventorySort').selectOption('DEFAULT');await page.locator('[data-inventory-filter="PACK"]').click();await tile(page,'PREMIUM_CUBE').click();
  await page.locator('#inventoryDetail .iv25-use').click();await page.locator('#inventoryOpenConfirm').waitFor();
  check(await page.locator('[data-cube-open-count]').count()===3,'original cube confirmation keeps 1/10/100 choices');
  check(!state.writes.some(x=>x.key==='inventory/use'),'opening the confirmation consumes nothing');
  await page.locator('#inventoryOpenClose').click();check(await page.locator('#modal').isHidden(),'cancel closes original confirmation');
  await tile(page,'PRIME_EQUIPMENT_SUPPLY_BOX').click();await page.locator('#inventoryDetail .iv25-use').click();await page.locator('#primeDrawClose').waitFor();
  check((await page.locator('#modal h2').innerText()).includes('프라임 아머리'),'prime item uses the existing prime opening flow');await page.locator('#primeDrawClose').click();
  await tile(page,'PREMIUM_CUBE').click();await page.locator('#inventoryDetail .iv25-use').click();await page.locator('[data-cube-open-count="10"]').click();await page.locator('#inventoryOpenConfirm').click();
  await page.locator('#inventoryResultConfirm').waitFor();await page.locator('#inventoryResultConfirm').click();await ready(page);
  check(state.writes.filter(x=>x.key==='inventory/use').length===1,'one confirmed batch makes one inventory/use request');
  check(await page.locator('[data-inventory-filter="PACK"]').getAttribute('aria-pressed')==='true','category survives opening/return');
  check(await tile(page,'PREMIUM_CUBE').getAttribute('aria-pressed')==='true','selection survives opening/return');
  check((await page.locator('#inventoryDetail .iv25-quantity').innerText()).includes('118'),'successful opening reloads authoritative inventory quantity');
  state.fail=true;await page.locator('#inventoryRefresh').click();await page.locator('#inventoryRetry').waitFor();
  check((await page.locator('#inventoryGrid').innerText()).includes('인벤토리 연결 검수 오류'),'failed fetch shows readable server error and retry');
  state.fail=false;await page.locator('#inventoryRetry').click();await ready(page);check(await tiles(page).count()===6,'retry restores the active category');
  state.hold=true;await page.locator('#inventoryRefresh').click();await page.waitForFunction(()=>document.querySelector('#inventoryVault').getAttribute('aria-busy')==='true');
  check(await page.locator('#inventoryRefresh').isDisabled(),'refresh indicates the pending read');
  await page.locator('#inventoryDetail .iv25-use').click();check(await page.locator('#modal').isHidden(),'pending refresh cannot open an action on stale ownership');
  await page.locator('soop-adventure-lobby .sidebar [data-home]').click();
  while(!state.release)await new Promise(resolve=>setTimeout(resolve,20));state.hold=false;state.release();
  await page.locator('soop-adventure-lobby .stage-character').waitFor();
  check(await page.locator('#inventoryVault').count()===0,'late inventory response cannot replace another route');
  await page.locator('soop-adventure-lobby .sidebar [data-route="inventory"]').click();await ready(page);
  await page.locator('[data-inventory-filter="ALL"]').click();await page.locator('#inventorySort').selectOption('DEFAULT');
  await bounds(page,'1440x900');await tile(page,'PREMIUM_CUBE').click();
  check(await page.locator('#inventoryDetail .iv25-use').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'desktop opening action fits within the first screen');
  await page.screenshot({path:path.join(out,'inventory-1440x900.png')});
  await page.route('**/assets/inventory-qa-missing.png',r=>r.fulfill({status:404,body:'missing'}));
  state.inventory.items.find(x=>x.code==='SUIT_CORE_1').image='/assets/inventory-qa-missing.png';
  await page.locator('#inventoryRefresh').click();await ready(page);await tile(page,'SUIT_CORE_1').click();
  await page.waitForFunction(()=>document.querySelector('#inventoryDetail .iv25-detail-art img').hidden);
  check(await page.locator('#inventoryDetail .iv25-art-fallback').isVisible(),'failed item art has a usable placeholder');
  state.inventory.items=[];await page.locator('#inventoryRefresh').click();await ready(page);
  check(await tiles(page).count()===0&&(await page.locator('.iv25-empty').innerText()).includes('표시할 아이템이 없습니다'),'empty account has an explicit inventory state');
  check((await page.locator('#inventoryOwnedSummary').innerText()).includes('0종 보유'),'empty account clears prior quantity summary');
  await page.close();

  for(const viewport of [{width:1024,height:768},{width:390,height:844},{width:320,height:740},{width:1440,height:560}]){
    const {page,state}=await launch(viewport),size=viewport.width+'x'+viewport.height;
    await bounds(page,size);await page.screenshot({path:path.join(out,'inventory-'+size+'.png')});
    await page.locator('[data-inventory-filter="MATERIAL"]').click();await tile(page,'SUIT_CORE_6').click();
    const mobile=viewport.width<=700,detail=page.locator(mobile?'#inventoryDetailDialog':'#inventoryDetail');
    check(await detail.isVisible(),size+' selection opens readable detail');
    check((await detail.innerText()).includes('Z-BODY'),size+' shows the actual sixth core description');
    check(await detail.locator('.iv25-use').isDisabled(),size+' material is not directly consumable');
    if(mobile){
      check(await detail.evaluate(e=>e.scrollWidth<=e.clientWidth+1),size+' bottom sheet has no horizontal clipping');
      await page.screenshot({path:path.join(out,'detail-'+size+'.png')});
      await page.keyboard.press('Escape');check(!await detail.isVisible(),size+' Escape closes detail');
      check(await tile(page,'SUIT_CORE_6').evaluate(e=>e===document.activeElement),size+' focus returns to selected item');
      await page.locator('[data-inventory-filter="PACK"]').click();await tile(page,'PREMIUM_CUBE').click();await detail.locator('.iv25-use').click();
      check(!await detail.isVisible(),size+' sheet closes before the existing confirmation');
      await page.locator('#inventoryOpenClose').click();check(!state.writes.some(x=>x.key==='inventory/use'),size+' cancel leaves quantity intact');
      await page.locator('[data-inventory-filter="REROLL"]').click();check(await tiles(page).count()===2,size+' horizontal category tabs remain reachable');
    }else{
      await page.locator('#inventoryDetail .iv25-use').scrollIntoViewIfNeeded();check(await page.locator('#inventoryDetail .iv25-use').isVisible(),size+' short window can scroll to the detail action');
    }
    await page.close();
  }
  check(!errors.length,'no application JavaScript exceptions: '+errors.join(' | '));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out,errors}));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));throw error;}finally{await browser.close();}
