import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LAND_PRIZES,storedLandWeights} from '../functions/_soopket_land.js';
const out=process.env.SOOPKETLAND_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'soopketland-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const base=process.env.SOOPKETLAND_PREVIEW_ORIGIN||'http://127.0.0.1:4186';
const failures=[];
const rewardsOnly=process.env.SOOPKETLAND_REWARDS_QA==='1';
try{
  for(const viewport of (process.env.QA_PUBLIC_BASE?[{width:390,height:844}]:[{width:1440,height:1080},{width:390,height:844}])){
    const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',e=>failures.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});await page.goto(`${base}/preview/soopketland-v2039/`);await page.waitForFunction(()=>window.SoopketLand?.diagnostics().webgl);
    await page.screenshot({path:path.join(out,`idle-${viewport.width}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    assert.equal(await page.locator('.sl-prize').count(),6);
    assert.equal(await page.locator('.sl-prize').filter({hasText:/슈퍼스타|블랙미라클|하이퍼버닝|제니스|ZENITH|FUR/}).count(),0);
    for(const key of ['SUPERSTAR_GUARANTEED_PACK','BLACK_MIRACLE_PACK','SOOPKETLAND_HYPER_BURNING_TICKET','ZENITH_RANDOM_CARD','FUR_RANDOM_CARD'])assert.equal(await page.locator(`#previewPrize option[value="${key}"]`).count(),0);
    assert.doesNotMatch(await page.locator('.sl-use-note').innerText(),/하이퍼버닝/);
    assert.match(await page.locator('.sl-guest').innerText(),/하루 최대 10회.*남은 이용권 이월 없음/);
    for(const label of ['1,000억 ~ 3조','5 ~ 25개','5,000 ~ 5,000,000개','5 ~ 5,000개'])assert.ok((await page.locator('.sl-prizes').innerText()).includes(label));
    for(const [label,percent] of [['코인','60.00%'],['마스터의 별','14.00%']])assert.ok((await page.locator('.sl-prize').filter({hasText:label}).innerText()).includes(percent));
    const repair=page.locator('.sl-prize').filter({hasText:'핑두 리페어 쿠폰'});assert.match(await repair.innerText(),/1개[\s\S]*10\.00%/);assert.ok(await repair.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));
    assert.match(await page.locator('.sl-prize').filter({hasText:'핑두의 감사 선물'}).innerText(),/5개[\s\S]*1\.00%/);
    await page.locator('.sl-prizes').screenshot({path:path.join(out,`prizes-${viewport.width}.png`)});
    assert.match(await page.locator('.sl-prize').filter({hasText:'엠퍼러 에너지'}).innerText(),/5\.00%/);
    assert.match(await page.locator('.sl-prize').filter({hasText:'미스틱 에너지'}).innerText(),/10\.00%/);
    await page.locator('[data-sl-play]').click();
    if(rewardsOnly){await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();}else{
    await page.waitForTimeout(2200);
    await page.locator('[data-sl-canvas]').screenshot({path:path.join(out,`balls-${viewport.width}.png`)});
    await page.waitForTimeout(2900);await page.locator('[data-sl-canvas]').screenshot({path:path.join(out,`reels-${viewport.width}.png`)});}
    await page.locator('[data-sl-result] .sl-receipt').waitFor({timeout:15000});
    assert.match(await page.locator('[data-sl-result]').innerText(),/3조 코인/);
    assert.equal(await page.locator('[data-sl-balance]').innerText(),'9개');
    await page.screenshot({path:path.join(out,`result-${viewport.width}.png`),fullPage:true});
    await page.selectOption('#previewPrize','MASTER_STAR');await page.locator('[data-sl-play]').click();await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();
    await page.waitForFunction(()=>document.querySelector('[data-sl-result]')?.textContent.includes('5,000,000개'));
    assert.equal(await page.locator('[data-sl-balance]').innerText(),'8개');
    assert.equal(await page.evaluate(()=>window.SoopketLand.diagnostics().busy),false);
    for(const [key,amount] of [['EMPEROR_ENERGY','25개'],['STARLIGHT_ARMOR_CORE','5,000개'],['PINGDU_THANKS_GIFT_BOX','5개'],['PINGDU_REPAIR_COUPON','1개']]){
      await page.selectOption('#previewPrize',key);await page.locator('[data-sl-play]').click();await page.waitForTimeout(300);await page.locator('[data-sl-skip]').click();
      await page.waitForFunction(()=>!window.SoopketLand.diagnostics().busy);
      assert.ok((await page.locator('[data-sl-result]').innerText()).includes(amount));
      if(key==='PINGDU_REPAIR_COUPON'){assert.ok(await page.locator('[data-sl-result] img.sl-reward-art').evaluate(img=>img.complete&&img.naturalWidth>0));await page.locator('[data-sl-result]').screenshot({path:path.join(out,`repair-result-${viewport.width}.png`)});await page.locator('[data-sl-canvas]').screenshot({path:path.join(out,`repair-reels-${viewport.width}.png`)});}
    }
    for(let remaining=3;remaining>=0;remaining--){
      await page.locator('[data-sl-play]').click();await page.locator('[data-sl-skip]').click();await page.waitForFunction(()=>!window.SoopketLand.diagnostics().busy);
      assert.equal(await page.locator('[data-sl-balance]').innerText(),remaining+'개');
    }
    assert.equal(await page.locator('[data-sl-play]').isDisabled(),true);
    assert.match(await page.locator('[data-sl-guest-balance]').innerText(),/^0\s*EVENT PASSES$/);
    assert.match(await page.locator('.sl-use-note').innerText(),/오늘 이용권을 모두 사용/);
    await page.screenshot({path:path.join(out,`exhausted-${viewport.width}.png`),fullPage:true});
    const weights=storedLandWeights(null),total=Object.values(weights).reduce((a,b)=>a+b,0);
    await page.evaluate(async data=>window.SoopketLand.preview(async()=>data,document.querySelector('#previewRoot')),{access:{allowed:true,isOwner:true},dailyAllowance:{enabled:true,quantity:10,couponUses:150},defaultCouponUses:150,tickets:0,nextCouponUses:0,prizes:LAND_PRIZES.map(p=>({...p,percent:weights[p.key]/total*100})),history:[],owner:{accounts:[],missing:[],self:{id:1,nickname:'검수 OWNER'},weights,coupons:[]}});
    await page.locator('.sl-owner summary').click();await page.locator('[data-sl-weights]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-sl-grant] input[name="quantity"]').getAttribute('max'),'10');
    assert.equal(await page.locator('[data-sl-weights] input').count(),6);
    for(const key of ['SUPERSTAR_GUARANTEED_PACK','BLACK_MIRACLE_PACK','SOOPKETLAND_HYPER_BURNING_TICKET','ZENITH_RANDOM_CARD','FUR_RANDOM_CARD'])assert.equal(await page.locator(`[data-sl-weights] input[name="${key}"]`).count(),0);
    assert.ok((await page.locator('[data-sl-weights]').innerText()).includes('슈퍼스타팩 확정권·블랙미라클·하이퍼버닝 발동권은 신규 추첨에서 제외'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('.sl-owner').screenshot({path:path.join(out,`owner-${viewport.width}.png`)});
    await page.close();
  }
  if(!rewardsOnly){const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await reduced.goto(`${base}/preview/soopketland-v2039/`);await reduced.waitForFunction(()=>window.SoopketLand?.diagnostics().webgl);await reduced.locator('[data-sl-play]').click();await reduced.locator('[data-sl-result] .sl-receipt').waitFor({timeout:5000});await reduced.close();
  const slow=await browser.newPage({viewport:{width:390,height:844}});slow.on('pageerror',e=>failures.push(e.message));
  await slow.route('**/cabinet-v1.webp',async route=>{await new Promise(resolve=>setTimeout(resolve,7000));await route.fulfill({status:503,body:'Simulated unavailable cabinet'})});
  await slow.goto(`${base}/preview/soopketland-v2039/`,{waitUntil:'domcontentloaded'});await slow.locator('[data-sl-play]').click();await slow.locator('[data-sl-result] .sl-receipt').waitFor({timeout:6000});
  assert.match(await slow.locator('[data-sl-result]').innerText(),/3조 코인/);await slow.close();}
  assert.deepEqual(failures,[]);console.log(JSON.stringify({ok:true,out,viewports:[1440,390],checks:rewardsOnly?['six prizes','60/5/14/10/1/10 odds','3조/25-emperor/5000000-star/5000-mystic/5-thanks-gift results','no retired prize selection','repair image in lineup/result/reels','owner weights','no overflow','no page errors']:['WebGL','balls/reels/results','two consecutive spins','skip','reduced motion','no overflow','no page errors']}));
}finally{await browser.close()}
