import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),origin='http://127.0.0.1:8977';
const out=fs.mkdtempSync(path.join(os.tmpdir(),'icon-guarantee-'));console.log(out);
const control=async(name,body)=>{const r=await fetch(origin+'/__qa/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{for(const width of [1440,390]){
 await control('reset',{});await control('control',{guarantee:true,roll:999999});
 const page=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));
 await page.waitForFunction(()=>document.querySelector('.if-odds')?.textContent.includes('100%'));
 assert.match(await page.locator('.if-odds').innerText(),/다음 1회 확정/);
 await page.locator('.if-checkout').screenshot({path:path.join(out,width+'.png')});
 for(const grade of ['SUPERSTAR','FUR']){await page.locator(`[data-pick="${grade}"]`).click();await page.locator('[data-material]:not(:disabled)').first().click();}
 await page.locator('.if-ack input').check();await page.locator('.if-submit').click();await page.locator('.if-stage.is-success').waitFor({timeout:30000});
 await page.locator('.if-again').click();await page.waitForFunction(()=>document.querySelector('.if-odds')?.textContent.includes('10%'));
 await page.close();console.log(width+' one-shot success and ordinary rate restored');
}}finally{await browser.close();}
