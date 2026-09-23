import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LAND_PRIZES,storedLandWeights} from '../functions/_soopket_land.js';
const out=process.env.SOOPKETLAND_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'soopketland-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.SOOPKETLAND_PREVIEW_ORIGIN||'http://127.0.0.1:4186';
const failures=[];
const rewardsOnly=process.env.SOOPKETLAND_REWARDS_QA==='1';
try{
  for(const viewport of [{width:1440,height:1080},{width:390,height:844}]){
    const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',e=>failures.push(e.message));
    await page.goto(`${base}/preview/soopketland-v2039/`);await page.waitForFunction(()=>window.SoopketLand?.diagnostics().webgl);
    await page.screenshot({path:path.join(out,`idle-${viewport.width}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    assert.equal(await page.locator('.sl-prize').count(),4);
    assert.equal(await page.locator('.sl-prize').filter({hasText:/블랙미라클|하이퍼버닝|제니스|ZENITH|FUR/}).count(),0);
    for(const key of ['BLACK_MIRACLE_PACK','SOOPKETLAND_HYPER_BURNING_TICKET','ZENITH_RANDOM_CARD','FUR_RANDOM_CARD'])assert.equal(await page.locator(`#previewPrize option[value="${key}"]`).count(),0);
    assert.doesNotMatch(await page.locator('.sl-use-note').innerText(),/하이퍼버닝/);
    for(const label of ['1억 ~ 300억','1,000 ~ 50,000개','1 ~ 50개'])assert.ok((await page.locator('.sl-prizes').innerText()).includes(label));
    for(const label of ['코인','마스터의 별'])assert.match(await page.locator('.sl-prize').filter({hasText:label}).innerText(),/42\.50%/);
    await page.locator('.sl-prizes').screenshot({path:path.join(out,`prizes-${viewport.width}.png`)});
    assert.match(await page.locator('.sl-prize').filter({hasText:'슈퍼스타팩 확정권'}).innerText(),/5\.00%/);
    assert.match(await page.locator('.sl-prize').filter({hasText:'미스틱 에너지'}).innerText(),/10\.00%/);
    await page.locator('[data-sl-play]').click();
    if(rewardsOnly){await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();}else{
    await page.waitForTimeout(2200);
    await page.locator('[data-sl-canvas]').screenshot({path:path.join(out,`balls-${viewport.width}.png`)});
    await page.waitForTimeout(2900);await page.locator('[data-sl-canvas]').screenshot({path:path.join(out,`reels-${viewport.width}.png`)});}
    await page.locator('[data-sl-result] .sl-receipt').waitFor({timeout:15000});
    assert.match(await page.locator('[data-sl-result]').innerText(),/300억 코인/);
    assert.equal(await page.locator('[data-sl-balance]').innerText(),'11개');
    await page.screenshot({path:path.join(out,`result-${viewport.width}.png`),fullPage:true});
    await page.selectOption('#previewPrize','MASTER_STAR');await page.locator('[data-sl-play]').click();await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();
    await page.waitForFunction(()=>document.querySelector('[data-sl-result]')?.textContent.includes('50,000개'));
    assert.equal(await page.locator('[data-sl-balance]').innerText(),'10개');
    assert.equal(await page.evaluate(()=>window.SoopketLand.diagnostics().busy),false);
    for(const [key,amount] of rewardsOnly?[]:[['SUPERSTAR_GUARANTEED_PACK','1개'],['STARLIGHT_ARMOR_CORE','50개'],['MASTER_STAR','50,000개']]){
      await page.selectOption('#previewPrize',key);await page.locator('[data-sl-play]').click();await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();
      await page.waitForFunction(()=>!window.SoopketLand.diagnostics().busy);
      assert.ok((await page.locator('[data-sl-result]').innerText()).includes(amount));
    }
    const weights=storedLandWeights(null),total=Object.values(weights).reduce((a,b)=>a+b,0);
    await page.evaluate(async data=>window.SoopketLand.preview(async()=>data,document.querySelector('#previewRoot')),{access:{allowed:true,isOwner:true},tickets:0,nextCouponUses:0,prizes:LAND_PRIZES.map(p=>({...p,percent:weights[p.key]/total*100})),history:[],owner:{accounts:[],missing:[],self:{id:1,nickname:'검수 OWNER'},weights,coupons:[]}});
    await page.locator('.sl-owner summary').click();await page.locator('[data-sl-weights]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-sl-weights] input').count(),4);
    for(const key of ['BLACK_MIRACLE_PACK','SOOPKETLAND_HYPER_BURNING_TICKET','ZENITH_RANDOM_CARD','FUR_RANDOM_CARD'])assert.equal(await page.locator(`[data-sl-weights] input[name="${key}"]`).count(),0);
    assert.ok((await page.locator('[data-sl-weights]').innerText()).includes('블랙미라클과 하이퍼버닝 발동권은 신규 추첨에서 제외'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('.sl-owner').screenshot({path:path.join(out,`owner-${viewport.width}.png`)});
    await page.close();
  }
  if(!rewardsOnly){const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await reduced.goto(`${base}/preview/soopketland-v2039/`);await reduced.waitForFunction(()=>window.SoopketLand?.diagnostics().webgl);await reduced.locator('[data-sl-play]').click();await reduced.locator('[data-sl-result] .sl-receipt').waitFor({timeout:5000});await reduced.close();
  const slow=await browser.newPage({viewport:{width:390,height:844}});slow.on('pageerror',e=>failures.push(e.message));
  await slow.route('**/cabinet-v1.webp',async route=>{await new Promise(resolve=>setTimeout(resolve,7000));await route.fulfill({status:503,body:'Simulated unavailable cabinet'})});
  await slow.goto(`${base}/preview/soopketland-v2039/`,{waitUntil:'domcontentloaded'});await slow.locator('[data-sl-play]').click();await slow.locator('[data-sl-result] .sl-receipt').waitFor({timeout:6000});
  assert.match(await slow.locator('[data-sl-result]').innerText(),/300억 코인/);await slow.close();}
  assert.deepEqual(failures,[]);console.log(JSON.stringify({ok:true,out,viewports:[1440,390],checks:rewardsOnly?['four prizes','42.5/5/42.5/10 odds','300억/50000-star results','no Black Miracle selection','owner weights','no overflow','no page errors']:['WebGL','balls/reels/results','two consecutive spins','skip','reduced motion','no overflow','no page errors']}));
}finally{await browser.close()}
