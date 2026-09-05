import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=process.env.SOOPKETLAND_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'soopketland-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.SOOPKETLAND_PREVIEW_ORIGIN||'http://127.0.0.1:4186';
const failures=[];
try{
  for(const viewport of [{width:1440,height:1080},{width:390,height:844}]){
    const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',e=>failures.push(e.message));
    await page.goto(`${base}/preview/soopketland-v2039/`);await page.waitForFunction(()=>window.SoopketLand?.diagnostics().webgl);
    await page.screenshot({path:path.join(out,`idle-${viewport.width}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    assert.equal(await page.locator('.sl-prize').count(),8);
    assert.match(await page.locator('.sl-prize').filter({hasText:'이예준 카드'}).innerText(),/1장[\s\S]*3\.00%/);
    await page.locator('[data-sl-play]').click();await page.waitForTimeout(2200);
    await page.locator('[data-sl-canvas]').screenshot({path:path.join(out,`balls-${viewport.width}.png`)});
    await page.waitForTimeout(2900);await page.locator('[data-sl-canvas]').screenshot({path:path.join(out,`reels-${viewport.width}.png`)});
    await page.locator('[data-sl-result] .sl-receipt').waitFor({timeout:15000});
    assert.match(await page.locator('[data-sl-result]').innerText(),/20억 코인/);
    assert.equal(await page.locator('[data-sl-balance]').innerText(),'11개');
    await page.screenshot({path:path.join(out,`result-${viewport.width}.png`),fullPage:true});
    await page.selectOption('#previewPrize','ZENITH_RANDOM_CARD');await page.locator('[data-sl-play]').click();await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();
    await page.waitForFunction(()=>document.querySelector('[data-sl-result]')?.textContent.includes('제니스 랜덤카드'));
    assert.equal(await page.locator('[data-sl-balance]').innerText(),'10개');
    assert.equal(await page.evaluate(()=>window.SoopketLand.diagnostics().busy),false);
    for(const [key,amount] of [['IYEJUN_CARD','1장'],['FUR_RANDOM_CARD','5장'],['MASTER_STAR','15,000개'],['BLACK_MIRACLE_PACK','10개']]){
      await page.selectOption('#previewPrize',key);await page.locator('[data-sl-play]').click();await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();
      await page.waitForFunction(()=>!window.SoopketLand.diagnostics().busy);
      assert.ok((await page.locator('[data-sl-result]').innerText()).includes(amount));
    }
    await page.close();
  }
  const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await reduced.goto(`${base}/preview/soopketland-v2039/`);await reduced.waitForFunction(()=>window.SoopketLand?.diagnostics().webgl);await reduced.locator('[data-sl-play]').click();await reduced.locator('[data-sl-result] .sl-receipt').waitFor({timeout:5000});await reduced.close();
  const slow=await browser.newPage({viewport:{width:390,height:844}});slow.on('pageerror',e=>failures.push(e.message));
  await slow.route('**/cabinet-v1.webp',async route=>{await new Promise(resolve=>setTimeout(resolve,7000));await route.fulfill({status:503,body:'Simulated unavailable cabinet'})});
  await slow.goto(`${base}/preview/soopketland-v2039/`,{waitUntil:'domcontentloaded'});await slow.locator('[data-sl-play]').click();await slow.locator('[data-sl-result] .sl-receipt').waitFor({timeout:6000});
  assert.match(await slow.locator('[data-sl-result]').innerText(),/20억 코인/);await slow.close();
  assert.deepEqual(failures,[]);console.log(JSON.stringify({ok:true,out,viewports:[1440,390],checks:['WebGL','balls/reels/results','two consecutive spins','skip','reduced motion','no overflow','no page errors']}));
}finally{await browser.close()}
