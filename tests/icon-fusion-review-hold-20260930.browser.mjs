import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin='http://127.0.0.1:8977',out=process.env.ICON_QA_OUT;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{for(const width of [1440,390]){
 await fetch(origin+'/__qa/reset',{method:'POST'});await fetch(origin+'/__qa/control',{method:'POST',body:JSON.stringify({enabled:false})});
 const before=await (await fetch(origin+'/__qa/state')).json();
 const page=await browser.newPage({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=iconfusion');await page.locator('.if-review-notice').waitFor();
 assert.equal(await page.locator('[data-target]').count(),7);assert.equal(await page.locator('.if-submit').isDisabled(),true);
 await page.locator('[data-target="ICON-AYOON"]').click();assert.equal(await page.locator('.if-stage-caption h2').textContent(),'아윤');
 await page.locator('[data-pick="SUPERSTAR"]').click();await page.locator('[data-material="CN-SUPER"]').click();
 await page.locator('[data-pick="FUR"]').click();await page.locator('[data-material="CN-FUR"]').click();
 assert.equal(await page.locator('.if-submit').isDisabled(),true);assert.equal(await page.locator('.if-ack input').isDisabled(),true);
 await page.locator('.if-submit').evaluate(b=>b.click());
 assert.deepEqual(await (await fetch(origin+'/__qa/state')).json(),before);
 await page.locator('.if-review-notice').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-visible-locked.png`)});
 await page.locator('.if-submit').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-locked-action.png`)});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 reports.push({width,publicCards:7,cardSelection:true,materialPreview:true,synthesisDisabled:true,currencyUnchanged:true,posts:0,errors});await page.close();
}fs.writeFileSync(path.join(out,'review-hold-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));}finally{await browser.close();}
