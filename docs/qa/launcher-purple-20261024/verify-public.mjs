import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/User/.codex/worktrees/launcher-purple/cnine-card',out='C:/Users/User/Downloads/upload/cnine-card/output/launcher-purple-20261024',origin='https://cnine-card.pages.dev';
const files=['assets/ui/loading/reverse-call-purple-20261024/scene-wide.webp','assets/ui/loading/reverse-call-purple-20261024/scene-mobile.webp','assets/ui/loading/reverse-call-purple-20261024/title.webp'];
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[];
for(const file of files){const r=await fetch(origin+'/'+file+'?verify=purple-20261024',{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,file);const b=Buffer.from(await r.arrayBuffer());assert.equal(hash(b),hash(await fs.readFile(path.join(root,file))),file+' public hash');results.push({file,status:r.status,bytes:b.length,sha256:hash(b)});}
const browser=await chromium.launch({channel:'chrome',headless:true});let release;
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const gate=new Promise(resolve=>release=resolve);await page.route('**/js/app.js?*',async r=>{await gate;await r.continue();});
 await page.goto(origin+'/?theme=purple-20261024',{waitUntil:'commit'});await page.locator('.boot-title-art').waitFor({state:'visible'});
 await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.v21-renewal-boot img')].map(i=>i.decode()));await document.fonts.ready;});
 const boot=await page.evaluate(()=>{const art=document.querySelector('.boot-title-art'),r=art.getBoundingClientRect();return {title:art.currentSrc,titleSize:[r.width,r.height],scene:document.querySelector('.boot-scene img').currentSrc,logo:document.querySelector('.boot-identity img').currentSrc,overflow:document.documentElement.scrollWidth>innerWidth};});
 assert(boot.title.includes('/reverse-call-purple-20261024/title.webp'));assert.equal(boot.overflow,false);await page.screenshot({path:path.join(out,'production-loading.png')});
 release();await page.waitForLoadState('domcontentloaded');await page.locator('.v21-renewal-boot').waitFor({state:'hidden',timeout:30000});
 const ready=await page.evaluate(()=>({appVisibility:getComputedStyle(document.querySelector('#app')).visibility,bodyReady:document.body.classList.contains('v21-ui-ready')}));assert.equal(ready.appVisibility,'visible');assert.equal(ready.bodyReady,true);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'production-verification.json'),JSON.stringify({at:new Date().toISOString(),origin,files:results,boot,ready,errors},null,2)+'\n');console.log(JSON.stringify({files:results.length,boot,ready,errors},null,2));
}finally{release?.();await browser.close();}
