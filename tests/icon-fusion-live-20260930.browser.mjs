import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8977';assert.equal(new URL(origin).hostname,'127.0.0.1');
const out=process.env.ICON_QA_OUT||fs.mkdtempSync(path.join(os.tmpdir(),'icon-fusion-20260930-'));fs.mkdirSync(out,{recursive:true});
const control=async(p,body)=>{const r=await fetch(origin+'/__qa/'+p,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json();};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390]){
  await control('reset',{});const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',()=>assert.fail('Unexpected popup'));
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
  await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));await page.locator('[data-target]').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('.if-availability')?.textContent.includes('각 1장 필요'));
  assert.equal(await page.locator('[data-target]').count(),7);
  assert.match(await page.locator('.if-checkout').innerText(),/500만/);assert.match(await page.locator('.if-checkout').innerText(),/1천억/);
  await page.evaluate(()=>document.fonts.ready);await page.locator('.if-hero-card img').first().evaluate(img=>img.decode());
  assert.equal(await page.locator('#iconFusionRoot').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.locator('#iconFusionRoot').screenshot({path:path.join(out,`${width}-ready.png`)});
  async function select(){for(const grade of ['SUPERSTAR','FUR']){await page.locator(`[data-pick="${grade}"]`).click();await page.locator('[data-material]:not(:disabled)').first().click();}await page.locator('.if-ack input').check();}
  await page.locator('[data-target="ICON-ORIKKUNG"]').click();await select();assert.equal(await page.locator('.if-submit').isEnabled(),true);
  await page.locator('#iconFusionRoot').screenshot({path:path.join(out,`${width}-selected.png`)});
  await page.locator('.if-submit').evaluate(b=>{b.click();b.click();});
  await page.locator('.if-stage.is-converging').waitFor();await page.locator('.if-stage').screenshot({path:path.join(out,`${width}-charging.png`)});
  await page.locator('.if-stage.is-success').waitFor();assert.equal(await page.locator('.if-stage h2').innerText(),'오리꿍');
  const success=await control('state');assert.equal(success.posts,1);assert.equal(success.coin,200000000000);assert.ok(success.cards.some(c=>c.card_id==='CN-1C000005'&&c.quantity===1));
  assert.equal(await page.locator('video').count(),0);assert.equal(await page.locator('dialog[open]').count(),0);
  await page.locator('#iconFusionRoot').screenshot({path:path.join(out,`${width}-success.png`)});
  // A committed failure with a lost HTTP response is restored without another charge.
  await control('control',{roll:999999,rearm:true,lose:true});await page.locator('.if-again').click();await select();await page.locator('.if-submit').click();
  await page.locator('.if-resume:visible').waitFor();await page.locator('.if-resume').click();await page.locator('.if-stage.is-failed').waitFor();
  const failed=await control('state');assert.equal(failed.posts,2);assert.equal(failed.coin,100000000000);assert.equal(failed.stars,5000000);
  await page.locator('#iconFusionRoot').screenshot({path:path.join(out,`${width}-failure.png`)});
  // Video decode errors release the inline stage; leaving during animation keeps the receipt.
  await control('control',{roll:0,rearm:true,video:true});await page.locator('.if-again').click();await select();await page.locator('.if-submit').click();await page.locator('.if-stage.is-converging').waitFor();
  if(width===1440){await page.evaluate(()=>window.renderShell('dex'));await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));}
  await page.locator('.if-stage.is-success').waitFor();assert.equal((await control('state')).posts,3);assert.equal(await page.locator('video').count(),0);
  const synced=await page.evaluate(()=>window.loadUser());assert.equal(synced.coin,0);assert.equal(synced.quantities['CN-1C000005'],2);
  await page.goto(origin+'/__qa/cms');await page.locator('.ic-fusion-controls input[type="checkbox"]').waitFor();
  await page.screenshot({path:path.join(out,`${width}-cms.png`),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  assert.deepEqual(errors,[]);reports.push({width,success:true,failure:true,lostResponseRecovered:true,inlineVideoFallback:true,accountSynced:true,overflow,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({out,reports},null,2));
}finally{await browser.close();}
