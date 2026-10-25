// Anonymous, read-only production codex verification. No fixtures or credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=process.argv[2]||path.join(process.cwd(),'docs/qa/jokro-power-2200000-20261025');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const errors=[],blocked=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const request=route.request();
  if(!['GET','HEAD'].includes(request.method())){blocked.push({method:request.method(),url:request.url()});return route.abort();}
  return route.continue();
 });
 const url='https://cnine-card.pages.dev/mercenary-codex/?view=limited&q='+encodeURIComponent('족로')+'&qa=jokro2200000';
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 const entry=page.locator('[data-code="V-979"]');
 await entry.waitFor({state:'visible',timeout:30000});
 await entry.click();
 assert.equal(await page.locator('.stage-heading h2').innerText(),'족로');
 await page.locator('#portraitDisplay img').first().evaluate(img=>img.decode());
 await page.locator('.combat-details > summary').click();
 const panel=page.locator('.combat-panel');
 await panel.waitFor({state:'visible'});
 const text=await panel.innerText();
 assert.match(text,/2,200,000/);assert.match(text,/청룡단천/);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 assert.equal(overflow,false);
 await page.locator('.combat-panel .power-summary').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(out,'public-mobile-codex.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 const result={status:'PASS',checkedAt:new Date().toISOString(),url,viewport:{width:390,height:844},anonymous:true,readOnly:true,fixture:false,name:'족로',basePower:2200000,skill:'청룡단천',overflow,errors,blockedWrites:blocked};
 fs.writeFileSync(path.join(out,'public-browser-verification.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{await browser.close();}
