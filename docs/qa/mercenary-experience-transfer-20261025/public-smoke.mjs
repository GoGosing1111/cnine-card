import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[],posts=[],responses=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);});page.on('response',r=>{if(r.url().includes('/api/mercenaries/v3/leveling/state'))responses.push({status:r.status(),path:new URL(r.url()).pathname});});
 await page.goto('https://cnine-card.pages.dev/mercenary-codex/leveling/transfer.html',{waitUntil:'domcontentloaded',timeout:30000});await page.locator('#reload').waitFor();assert.match(await page.locator('#transfer-app').innerText(),/로그인이 필요/);
 const asset=await page.locator('.transfer-hero img').evaluate(async el=>{await el.decode();return {width:el.naturalWidth,height:el.naturalHeight,src:el.getAttribute('src')};});assert.equal(asset.width,512);
 assert.match(await page.locator('h1').innerText(),/경험치 이전 물약/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);assert(responses.some(r=>r.status===401));
 await page.screenshot({path:path.join(out,'public-mobile-auth-gate.png'),fullPage:true});const result={status:'PASSED',surface:'real public mobile page, anonymous session',asset,responses,productionAccountWrites:0,noHorizontalOverflow:true,pageErrors:errors};fs.writeFileSync(path.join(out,'public-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
