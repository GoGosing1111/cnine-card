import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(process.env.PLAYWRIGHT_MODULE_DIR?path.join(process.env.PLAYWRIGHT_MODULE_DIR,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
const origin='http://127.0.0.1:8916/preview/seal-battle-rework-20261021/';
const output=path.resolve('preview/seal-battle-rework-20261021/qa');await fs.mkdir(output,{recursive:true});
const evidence=[];
try {
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile',reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin);await page.locator('#sealRoleDetail').waitFor();await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('[role="tab"]').count(),3);
    assert.equal(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)),true);
    await page.locator('#sealTabATTACK').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#sealTabGUARD').getAttribute('aria-selected'),'true');
    assert.match(await page.locator('#sealRoleDetail').innerText(),/수호 봉인/);
    if(name==='mobile')await page.locator('#sealTabPURIFY').tap();else await page.locator('#sealTabPURIFY').click();assert.equal(await page.locator('#sealTabPURIFY').getAttribute('aria-selected'),'true');
    await page.locator('[data-seal-role]').click();await page.locator('[data-seal-cancel]').waitFor();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.sealPreviewCalls.some(x=>x.method==='POST')),false);
    await page.locator('#sealTabATTACK').click();await page.screenshot({path:path.join(output,`${name}-active.png`),fullPage:true});
    await page.locator('#sealRankings').click();await page.locator('#sealRankingList tr').first().waitFor();assert.equal(await page.locator('#sealRankingList tr').count(),30);
    assert.equal(await page.evaluate(()=>document.querySelector('.seal-ranking-scroll').scrollHeight>document.querySelector('.seal-ranking-scroll').clientHeight),true);
    await page.screenshot({path:path.join(output,`${name}-records.png`),fullPage:true});
    await page.locator('[data-rank-tab="GUARD"]').click();assert.match(await page.locator('#sealRankingList').innerText(),/아직 공헌 기록이 없습니다/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#sealRankings').evaluate(el=>el===document.activeElement),true);
    for(const scenario of ['no-charge','no-deck','complete','failed']){
      await page.selectOption('#scenario',scenario);await page.locator('#sealRoleDetail').waitFor();assert.equal(await page.locator('[data-seal-role]').isDisabled(),true);
      if(scenario==='complete'){
        assert.equal(await page.locator('#sealClearClaim').isDisabled(),false);
        await page.screenshot({path:path.join(output,`${name}-complete.png`),fullPage:true});
        await page.locator('#sealClearClaim').click();await page.locator('[data-seal-confirm]').click();await page.getByRole('heading',{name:'봉인 완료 보상 수령'}).waitFor();
        assert.match(await page.locator('.seal-dialog-panel').innerText(),/마스터의 별 200,000개/);await page.locator('[data-seal-confirm]').click();
      }
    }
    await page.selectOption('#scenario','active');await page.locator('#sealRoleDetail').waitFor();
    await page.locator('[data-seal-role]').click();await page.locator('[data-seal-confirm]').click();await page.locator('.seal-v3-error').waitFor();
    assert.equal(await page.evaluate(()=>window.sealPreviewCalls.some(x=>x.path.endsWith('participate'))),false,'renderer unavailable must not consume an attempt');
    await page.locator('.seal-v3-error button').click();
    await page.selectOption('#scenario','empty');await page.getByRole('heading',{name:'다음 봉인전을 기다리고 있습니다.'}).waitFor();
    await page.selectOption('#scenario','offline');await page.getByRole('heading',{name:'봉인전 정보를 불러오지 못했습니다.'}).waitFor();
    await page.goto(origin+'admin.html');await page.locator('#sealMode').waitFor();await page.waitForFunction(()=>document.querySelector('#sealMode').value==='ON');
    assert.equal(await page.locator('.seal-admin-rank-rewards').count(),0);assert.match(await page.locator('.seal-admin-retired-note').innerText(),/종료/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(output,`${name}-admin.png`),fullPage:true});
    await page.locator('#sealAdminSave').click();await page.waitForFunction(()=>window.sealAdminPreviewCalls.some(x=>x.method==='PATCH'));
    const saved=await page.evaluate(()=>window.sealAdminPreviewCalls.find(x=>x.method==='PATCH').body.settings);
    assert.deepEqual(saved.rankRewards,{enabled:false,rewardOnFailure:false,tiers:[]});assert.equal(saved.clearReward.masterStar,200000);assert.equal(saved.attemptReward.coin,100000000);
    assert.deepEqual(errors,[]);evidence.push({viewport:{width,height},name,checks:'role click/keyboard, confirm cancel, record scroll/filter, responsive images, eligibility states, clear reward notice, preflight no-charge, admin retired settings/save',pageErrors:errors});await page.close();
  }
  const small=await browser.newPage({viewport:{width:320,height:740},isMobile:true,hasTouch:true});await small.goto(origin);await small.locator('#sealRoleDetail').waitFor();
  assert.equal(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await small.screenshot({path:path.join(output,'mobile-320.png'),fullPage:true});await small.close();
  await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({at:new Date().toISOString(),source:'Actual player/admin modules with isolated example API fixtures; no live account writes',visualApproval:'USER_REVIEW_PENDING',evidence},null,2)+'\n');
  console.log('Seal player and CMS UI checks passed on desktop/mobile; 320px layout passed.');
} finally {await browser.close();}

