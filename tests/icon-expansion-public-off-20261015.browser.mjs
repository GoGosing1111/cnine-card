import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8979';assert.equal(new URL(origin).hostname,'127.0.0.1');
const out='docs/qa/icon-expansion-public-off-20261015';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),report=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1100},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));await page.locator('[data-upcoming-icon]').first().waitFor();
 await page.waitForFunction(()=>document.querySelector('.if-availability')?.textContent.includes('각 1장 필요'));
 assert.equal(await page.locator('[data-target]').count(),8);assert.equal(await page.locator('[data-upcoming-icon]').count(),2);
 assert.match(await page.locator('.if-checkout').innerText(),/5천억/);assert.match(await page.locator('.if-checkout').innerText(),/500만/);
 for(const code of ['ICON-NAMSUDAENG','ICON-DIIM-REDCAP']){
  const card=page.locator('[data-upcoming-icon="'+code+'"]');assert.match(await card.innerText(),/1조/);assert.match(await card.innerText(),/500만/);assert.match(await card.innerText(),/10%/);assert.match(await card.innerText(),/제작·획득·편성 OFF/);assert.equal(await card.locator('[data-target],button').count(),0);
 }
 await page.locator('.if-upcoming').scrollIntoViewIfNeeded();await page.locator('.if-upcoming').evaluate(async el=>Promise.all([...el.querySelectorAll('img')].map(img=>img.decode())));
 assert.equal(await page.locator('#iconFusionRoot').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 await page.locator('.if-upcoming').screenshot({path:out+'/'+width+'-upcoming.png'});
 await page.goto(origin+'/__qa/cms');await page.locator('[data-prepared-icon="ICON-NAMSUDAENG"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-it-status]')?.textContent.includes('초안 버전'));
 assert.equal(await page.locator('[data-it-field="cooldownActions"]').inputValue(),'2');assert.match(await page.locator('[data-prepared-icon]').innerText(),/1조/);
 await page.locator('.it-studio').screenshot({path:out+'/'+width+'-cms-crown.png'});
 await page.locator('[data-it-select="AUTONOMOUS_WEAPON"]').click();assert.equal(await page.locator('[data-it-field="attackPercent"]').inputValue(),'80');
 assert.equal(await page.locator('[data-it-field="hpPercent"]').inputValue(),'50');assert.match(await page.locator('[data-prepared-icon]').innerText(),/덱 최대 2장 유지/);
 await page.locator('.it-studio').screenshot({path:out+'/'+width+'-cms-weapon.png'});
 assert.equal(await page.locator('.it-studio').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 assert.deepEqual(errors,[]);report.push({width,liveFusionChoices:8,upcomingOff:2,coin:'1조',masterStars:'500만',successRate:'10%',deckLimit:2,errors});await context.close();
}}finally{await browser.close();}
fs.writeFileSync(out+'/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
