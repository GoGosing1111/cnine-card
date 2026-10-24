import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const out=process.env.LOADING_QA_OUT||'C:/Users/User/.codex/worktrees/jokro-live/cnine-card/docs/qa/loading-screen-20261018';await fs.mkdir(out,{recursive:true});
const origin=process.env.LOADING_QA_ORIGIN||'http://127.0.0.1:8988',production=origin.startsWith('https:'),results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const sizes=process.env.LOADING_QA_SIZES?JSON.parse(process.env.LOADING_QA_SIZES):production?[[1440,900,false]]:[[1440,900,false],[963,588,false],[390,844,false],[320,568,false],[844,390,false],[320,568,true]];
try{for(const [width,height,fallback] of sizes){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});let release;const pending=new Promise(resolve=>{release=resolve;});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(fallback)await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.route('**/js/app.js?*',async route=>{await pending;await route.continue();});
 await page.goto(origin+'/',{waitUntil:'commit'});await page.locator('.boot-track').waitFor({state:'visible'});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('link[rel="stylesheet"]')).every(l=>!!l.sheet));
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.v21-renewal-boot img')].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 const geometry=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};const root=document.querySelector('.v21-renewal-boot');const textRange=document.createRange();textRange.selectNode(root.querySelector('.boot-title-art'));return {width:innerWidth,height:innerHeight,title:box('.v21-renewal-boot main'),footer:box('.boot-loading'),heading:box('.v21-renewal-boot h1'),headingText:textRange.getBoundingClientRect().toJSON(),overflow:root.scrollHeight>root.clientHeight||root.scrollWidth>root.clientWidth,scene:root.querySelector('.boot-scene img').currentSrc,rail:getComputedStyle(root.querySelector('.boot-track')).borderImageSource,animation:getComputedStyle(root.querySelector('.boot-track'),'::after').animationName,appVisibility:getComputedStyle(document.querySelector('#app')).visibility};});
 const label=`${width}x${height}${fallback?'-fallback':''}`;await page.screenshot({path:out+'/'+label+'.png'});results.push({label,geometry,errors});
 assert.equal(geometry.overflow,false,label+' overflows');assert(geometry.footer.bottom<=height,label+' footer clipped');assert(geometry.title.bottom<geometry.footer.y,label+' title overlaps footer');assert(geometry.headingText.right<width,label+' heading clipped');assert.equal(geometry.appVisibility,'hidden');
 if(width===390){await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.boot-track').evaluate(e=>getComputedStyle(e,'::after').animationName),'none');results.at(-1).reducedMotion=true;}
 release();await page.waitForLoadState('domcontentloaded');await page.locator('.v21-renewal-boot').waitFor({state:'hidden',timeout:25000});
 const ready=await page.evaluate(()=>({bootDisplay:getComputedStyle(document.querySelector('.v21-renewal-boot')).display,appVisibility:getComputedStyle(document.querySelector('#app')).visibility,login:!!document.querySelector('.v21-auth-screen,.login-wrap')}));
 results.at(-1).ready=ready;assert.equal(ready.appVisibility,'visible');assert(ready.login);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();await fs.writeFile(out+'/browser.json',JSON.stringify({origin,production,results},null,2)+'\n');}
console.log(JSON.stringify(results.map(({label,geometry,ready,errors})=>({label,overflow:geometry.overflow,ready,errors})),null,2));
