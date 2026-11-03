import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {startAuctionPreview} from './helpers/auction-user-preview-server-20261103.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const out=path.resolve(import.meta.dirname,'../../../../operations/auction-user-20261103/browser');fs.mkdirSync(out,{recursive:true});const report=[];
for(const profile of [{name:'desktop',width:1440,engine:chromium},{name:'mobile',width:390,engine:chromium},{name:'small',width:320,engine:chromium},{name:'webkit',width:390,engine:webkit}]){
 const server=await startAuctionPreview(),browser=await profile.engine.launch({headless:true,...(profile.engine===chromium?{channel:'chrome'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:profile.width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
  await page.goto(server.origin+'/preview/auction-user-20261103/index.html');await page.locator('#auc-amount').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,profile.name+'-live.png'),fullPage:true});
  const expected=[10000000,100000000000,1000000000000,10000000000000,100000000000000];assert.equal(await page.locator('[data-add]').count(),5);
  for(const amount of expected){await page.locator('#auc-amount').fill('');await page.locator(`[data-add="${amount}"]`).click();assert.equal(await page.locator('#auc-amount').inputValue(),String(amount));}
  await page.locator('[data-add="10000000"]').click();assert.equal(await page.locator('#auc-amount').inputValue(),'100000000000000');assert.match(await page.locator('[data-error]').innerText(),/최대 100조/);
  await page.locator('.auc-bid').click();await page.locator('.auc-dialog [data-submit]').click();await page.waitForFunction(()=>document.querySelector('.auc-current strong')?.textContent.includes('100조'));
  await page.locator('[data-host]').click();await page.locator('[data-kind="MERCENARY"]').click();await page.locator('[data-asset]').first().click();
  await page.locator('.auc-host-form [name="quantity"]').fill('1');await page.locator('.auc-host-form [name="startPrice"]').fill('1000000000000');assert.match(await page.locator('[data-net]').innerText(),/8,000억/);
  await page.screenshot({path:path.join(out,profile.name+'-host.png'),fullPage:true});
  const before=server.fixture.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='AUCTION_HOST_TICKET'").quantity;
  await page.locator('.auc-host-form [data-submit]').click();await page.locator('.auc-dialog').waitFor({state:'detached'});assert.equal(server.fixture.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='AUCTION_HOST_TICKET'").quantity,before-1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,profile.name+'-queue.png'),fullPage:true});
  await page.locator('[data-tab="MINE"]').click();await page.locator('[data-cancel]').click();await page.waitForFunction(()=>document.querySelector('.auc-queue-status')?.textContent.includes('예약 취소'));
  await page.locator('[data-lobby]').click();await page.locator('.auc-opening[open]').waitFor();await page.screenshot({path:path.join(out,profile.name+'-notice.png'),fullPage:true});
  await page.locator('.auc-opening [data-close]').click();await page.locator('#review-enter').click();await page.locator('[data-lobby]').click();await page.waitForTimeout(150);assert.equal(await page.locator('.auc-opening[open]').count(),0);
  await page.reload();await page.locator('[data-lobby]').click();await page.waitForTimeout(150);assert.equal(await page.locator('.auc-opening[open]').count(),0);
  assert.equal(server.fixture.row('SELECT COUNT(*) n FROM auction_user_notices_v1 WHERE user_id=2').n,1);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);report.push({profile:profile.name,width:profile.width,quickButtons:5,maximumBid:1e14,hosted:true,queueCancelled:true,noticeOnce:true,overflow:false,pageErrors:errors,failedResponses:failed});
 }finally{await browser.close();await server.close();}
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
