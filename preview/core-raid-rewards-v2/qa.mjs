import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8973',out=path.resolve(process.env.QA_OUTPUT||'../qa-core-rewards-v2');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
const url=base+'/preview/core-raid-rewards-v2/index.html';
try{
  for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844],['small-mobile',320,568],['short-desktop',1100,600]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,recordVideo:{dir:out,size:{width,height}}});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(name+': '+error.message));
    let gameRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))gameRequests++;});
    await page.goto(url);await page.locator('.is-ready').waitFor();await page.waitForTimeout(1000);
    await page.screenshot({path:path.join(out,name+'-selection.png')});
    for(const box of await page.locator('[data-slot]').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})))assert(box.x>=-1&&box.x+box.w<=width+1&&box.y>50&&box.y+box.h<height-50,name+' visible selection');
    await page.locator('[data-slot="1"]').click();await page.waitForTimeout(1300);await page.screenshot({path:path.join(out,name+'-opening.png')});
    await page.locator('.is-revealed').waitFor();await page.waitForTimeout(2000);
    assert.match(await page.locator('.reliquary-result').innerText(),/오메가-X/);
    const button=await page.locator('.reliquary-done').boundingBox();assert(button.y>0&&button.y+button.height<height-65,name+' visible result action');
    const image=await page.locator('.reliquary-prize-image').evaluate(img=>({loaded:img.complete&&img.naturalWidth>0,rect:img.getBoundingClientRect().toJSON()}));assert(image.loaded);assert(image.rect.y>45);
    await page.screenshot({path:path.join(out,name+'-reward.png')});
    await page.locator('.reliquary-done').click();assert.equal(await page.locator('dialog,canvas').count(),0);
    if(name==='desktop'||name==='mobile')for(const sample of ['star','coin','material']){
      await page.locator('#sample').selectOption(sample);await page.locator('#play').click();await page.locator('.is-ready').waitFor();await page.locator('[data-slot="0"]').click();await page.locator('.is-revealed').waitFor();await page.waitForTimeout(1800);
      assert.equal(await page.locator('.reliquary-prize-image').evaluate(img=>img.complete&&img.naturalWidth>0),true);
      await page.screenshot({path:path.join(out,name+'-'+sample+'.png')});await page.locator('.reliquary-done').click();
    }
    assert.equal(gameRequests,0);checks.push(name+': visible selection, opening, result, cleanup; no game API calls');await context.close();
  }
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'?manual');
  await page.evaluate(async()=>{
    const {showCoreRewardPickerV2}=await import('./picker.mjs');window.openReview=showCoreRewardPickerV2;window.claims=[];
    window.receipt={selectedIndex:2,reward:{coin:10000000000},choiceReward:{rewardType:'COIN',name:'코인',quantity:100000000}};
    window.resultPromise=window.openReview({offer:{offerId:'RETRY',baseReward:{coin:10000000000}},claim:async request=>{window.claims.push(request);if(window.claims.length===1)throw Error('테스트: 응답 확인 실패');return window.receipt;}});
  });
  await page.locator('.is-ready').waitFor();await page.locator('[data-slot="2"]').click();await page.locator('.reliquary-retry').waitFor();assert.equal(await page.locator('[data-slot]:disabled').count(),3);
  await page.waitForTimeout(800);await page.locator('.reliquary-retry').click();await page.locator('.is-revealed').waitFor();assert.deepEqual(await page.evaluate(()=>window.claims.map(c=>[c.selectedIndex,c.requestId])),[[2,'RETRY-CLAIM'],[2,'RETRY-CLAIM']]);
  await page.locator('.reliquary-close').click();
  // Closing while a claim is pending must leave no canvas, audio or live tweens.
  await page.evaluate(()=>{window.resultPromise=window.openReview({offer:{offerId:'CANCEL'},claim:()=>new Promise(resolve=>setTimeout(()=>resolve(window.receipt),300))});});
  await page.locator('.is-ready').waitFor();await page.locator('[data-slot="0"]').click();await page.locator('.reliquary-close').click();await page.waitForTimeout(700);
  assert.equal(await page.locator('dialog,canvas').count(),0);assert.equal(await page.evaluate(()=>window.CNineUiFxVendor.gsap.globalTimeline.getChildren(true,true,true).filter(tween=>tween.isActive()).length),0);
  checks.push('retry preserves selection/request ID; cancel during pending claim disposes canvas and active tweens');
  // A destroyed renderer must not invalidate the shared source texture on replay.
  for(let i=0;i<3;i++){await page.locator('#play').click();await page.locator('.is-ready').waitFor();await page.locator('.reliquary-close').click();}
  assert.equal(await page.locator('dialog,canvas').count(),0);checks.push('three repeated open/close cycles');await context.close();
  const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}}),reducedPage=await reduced.newPage();reducedPage.on('pageerror',error=>errors.push(error.message));
  await reducedPage.goto(url);await reducedPage.locator('.is-ready').waitFor();await reducedPage.locator('[data-slot="0"]').click();await reducedPage.locator('.is-revealed').waitFor({timeout:2000});await reducedPage.locator('.reliquary-done').click();checks.push('reduced motion');await reduced.close();
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));
}finally{await browser.close();}
