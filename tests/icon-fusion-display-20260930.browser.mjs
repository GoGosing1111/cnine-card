import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin='http://127.0.0.1:8977',out=process.env.ICON_QA_OUT;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{for(const width of [1440,390]){
 await fetch(origin+'/__qa/reset',{method:'POST'});
 const page=await browser.newPage({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));await page.waitForFunction(()=>document.querySelector('.if-availability')?.textContent.includes('각 1장 필요'));
 await page.locator('.if-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-viewport-top.png`)});
 await page.locator('.if-submit').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-viewport-action.png`)});
 assert.equal(await page.locator('.if-submit').evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
 await page.goto(origin+'/__qa/cms');await page.locator('[data-if-save]:enabled').waitFor();
 await page.locator('[data-if-video]').fill('assets/videos/icon-fusion-success.mp4');await page.locator('[data-if-duration]').fill('18');await page.locator('[data-if-save]').click();
 await page.waitForFunction(()=>document.querySelector('[data-if-status]')?.textContent.includes('저장 버전 2'));
 await page.reload();await page.locator('[data-if-save]:enabled').waitFor();assert.equal(await page.locator('[data-if-video]').inputValue(),'/assets/videos/icon-fusion-success.mp4');assert.equal(await page.locator('[data-if-duration]').inputValue(),'18');
 assert.equal(await page.locator('[data-if-enabled]').isChecked(),true);await page.screenshot({path:path.join(out,`${width}-cms-verified.png`),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);reports.push({width,cmsSaved:true,cmsReloaded:true,actionReachable:true,errors});await page.close();
}fs.writeFileSync(path.join(out,'display-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));}finally{await browser.close();}
