// Focused reward view and completed-session QA. Real game shell, loopback fixtures, sound OFF.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.FACTION_QA_ORIGIN||'http://127.0.0.1:8966';
const out=fs.mkdtempSync(path.join(os.tmpdir(),'faction-rewards-20261001-'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const reports=[],errors=[];
try{
 for(const viewport of[{width:1440,height:1000},{width:390,height:844}]){
  assert.equal((await fetch(origin+'/api/preview/reset',{method:'POST'})).ok,true);
  const context=await browser.newContext({viewport,serviceWorkers:'block',isMobile:viewport.width<700,hasTouch:viewport.width<700});
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.route(origin+'/api/loot-shop/balance**',route=>route.fulfill({json:{pigCoins:0}}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/review-live/');await page.waitForFunction(()=>typeof renderShell==='function');
  await page.evaluate(()=>renderShell('clan'));
  await page.locator('.clan-tabs [data-clan-tab="faction"]').click();await page.locator('.fw-session-strip').waitFor();
  await page.locator('[data-fw-tab="treasury"]').first().click();await page.locator('.fw-vault').waitFor();
  const vault=page.locator('.fw-vault');
  assert.match(await vault.locator('strong').first().textContent(),/300억/);
  assert.match(await vault.locator('[data-fw-reward="MASTER_STAR"]').textContent(),/마스터의 별.*300,000/);
  assert.match(await vault.locator('[data-fw-reward="STARLIGHT_ARMOR_CORE"]').textContent(),/미스틱 에너지.*300/);
  assert.match(await vault.textContent(),/해당 회차 참여 클랜원/);
  await vault.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'reward-'+viewport.width+'.png'),fullPage:true});
  assert.equal((await fetch(origin+'/api/preview/session?phase=end',{method:'POST'})).ok,true);
  await page.locator('[data-fw-reload]').first().click();
  const history=page.locator('.fw-session-result').first();await history.waitFor();
  assert.match(await history.textContent(),/300억.*메시지함 지급/);
  assert.match(await history.locator('[data-fw-reward="MASTER_STAR"]').textContent(),/300,000/);
  assert.match(await history.locator('[data-fw-reward="STARLIGHT_ARMOR_CORE"]').textContent(),/300/);
  await history.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'history-'+viewport.width+'.png'),fullPage:true});
  const layout=await page.evaluate(()=>({pageOverflow:document.documentElement.scrollWidth>innerWidth,textOverflow:[...document.querySelectorAll('.fw-vault,.fw-session-result')].filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>node.className)}));
  assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.textOverflow,[]);
  reports.push({width:viewport.width,existingCoin:true,masterStars:300000,mysticEnergy:300,completedSession:true,layout});
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({out,reports,errors},null,2));
}finally{await browser.close();}
