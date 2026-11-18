import assert from 'node:assert/strict';import path from 'node:path';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {out,save} from './common.mjs';
const [device='pc',phase='after']=process.argv.slice(2),before=phase==='before',mobile=['android','ios','h5'].includes(device),qaOrigin='http://127.0.0.1:'+(before?19972:19973),origin=phase==='public'?'https://cnine-card.pages.dev':qaOrigin;
await fetch(qaOrigin+'/__qa/clear');
const browser=await(device==='ios'?webkit:chromium).launch({headless:true,...(device==='ios'?{}:{channel:'chrome',args:['--mute-audio','--enable-unsafe-swiftshader']})});
const report={at:new Date().toISOString(),device,phase,condition:'Windows headless Chrome/WebKit; actual lobby and account/card navigation, isolated API fixtures. Mobile viewport/touch, Windows launcher URL and H5 iframe emulation; not physical devices. Local resource timings exclude production service latency. Fixtures exercise full/partial avatar collection without operating account writes.',visits:[],errors:[],failedAssets:[]};let page;
try{
 const context=await browser.newContext({viewport:{width:mobile?390:1440,height:mobile?844:960},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',locale:'ko-KR'});page=await context.newPage();page.setDefaultTimeout(30000);
 if(phase==='public')await context.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),r=await fetch(qaOrigin+url.pathname+url.search,{method:req.method(),headers:{'content-type':'application/json'},body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});await route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});});
 if(phase==='public')report.condition='Windows headless Chrome; actual production CDN assets and lobby -> account -> player-card navigation. Every API request intercepted to isolated local fixtures, with no operating account writes. Timings include CDN latency and exclude production API latency. Not a physical-device or installed-app test.';
 const {user}=await(await fetch(qaOrigin+'/__qa/user')).json();await context.addInitScript(u=>{
  localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','isolated-trophy-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');localStorage.setItem('cnine_soop_watch_notice:20261026-v1:1','shown');
  window.ONEstoreH5={initializeAsync:async()=>{},setLoadingProgress:()=>{},startGameAsync:async()=>{},getUserIdAsync:async()=>({userId:'isolated'})};
 },user);
 page.on('pageerror',e=>report.errors.push(e.message));const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('response',r=>{if(r.status()>=400&&/player-card/.test(r.url()))report.failedAssets.push({url:r.url(),status:r.status()});});
 await page.goto(origin+(device==='h5'?'/__qa/host':'/?screen=home'+(device==='windows'?'&source=windows-client':'')),{waitUntil:'domcontentloaded'});
 const p=device==='h5'?page.frames().find(f=>f!==page.mainFrame()):page,scope=device==='h5'?page.frameLocator('iframe'):page;
 await page.addLocatorHandler(scope.locator('.soop-consent-dialog[open]'),d=>d.locator('[data-soop-close]').first().click());
 await p.locator('soop-adventure-lobby #account-shortcut:visible').waitFor();report.firstLaunchMs=await p.evaluate(()=>performance.now());
 for(let visit=0;visit<2;visit++){
  if(!before)await fetch(qaOrigin+'/__qa/progress?n='+(visit===0?4:3));
  const start=Date.now();await p.locator('soop-adventure-lobby #account-shortcut:visible').click();
  // The real account panel contains the public calling-card name button.
  const name=p.locator('[data-player-id="1"]:visible').first();await name.waitFor();await name.click();
  await p.locator('#player-card-dialog .pc-shelf-nav').waitFor();const readyMs=Date.now()-start;
  const shelf=p.locator('[data-pc-shelf]:not([hidden])');await shelf.locator('img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
  const imageReadyMs=Date.now()-start,loadedImages=requests.filter(s=>/\/player-card\/.*\.(webp|png)$/.test(s));
  assert.equal(await p.locator('[data-pc-shelf-count]').textContent(),before?'1 / 4':'1 / 5');
  if(!before){const vip=shelf.locator('[data-pc-trophy="0"]');assert.match(await vip.textContent(),/씨나인 VIP/);assert.equal(await vip.evaluate(e=>e.classList.contains('is-owned')),visit===0);await vip.click();const text=await p.locator('#pc-trophy-detail').textContent();for(const n of ['하이희야','나무늘봉순','오조은','딜러 남수댕','기존 산타걸 남수댕'])assert(text.includes(n),n);assert.match(text,visit===0?/4 \/ 4종/:/3 \/ 4종/);}
  await p.evaluate(()=>{const s=window.qaFrames={last:performance.now(),values:[]};const tick=t=>{s.values.push(t-s.last);s.last=t;s.raf=requestAnimationFrame(tick);};s.raf=requestAnimationFrame(tick);});
  await shelf.scrollIntoViewIfNeeded();await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,'ui-'+device+'-'+phase+'-'+visit+'.png')});
  await p.locator('[data-pc-page=next]').click();await p.locator('[data-pc-shelf]:not([hidden]) img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
  while(!await p.locator('[data-pc-page=next]').isDisabled())await p.locator('[data-pc-page=next]').click();
  assert.equal(await p.locator('[data-pc-shelf-count]').textContent(),before?'4 / 4':'5 / 5');
  assert(await p.locator('#player-card-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  const frames=await p.evaluate(()=>{const s=qaFrames;cancelAnimationFrame(s.raf);const a=s.values.sort((a,b)=>a-b);return{count:a.length,p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1),over50:a.filter(n=>n>50).length};});
  await p.locator('#player-card-dialog [data-pc-close]').click();await p.locator('#player-card-dialog').waitFor({state:'hidden'});
  const n=requests.length;await page.waitForTimeout(1000);const exit=await p.evaluate(()=>({canvases:document.querySelectorAll('#player-card-dialog canvas').length,cardAnimations:document.getAnimations().filter(a=>a.effect?.target?.closest?.('#player-card-dialog')).length}));
  assert.equal(exit.canvases,0);assert.equal(exit.cardAnimations,0);const postExitCalls=requests.slice(n).filter(s=>s.includes('player-card')).length;assert.equal(postExitCalls,0);
  await p.evaluate(()=>renderShell('home'));await p.locator('soop-adventure-lobby #account-shortcut:visible').waitFor();
  report.visits.push({readyMs,imageReadyMs,loadedImages,frames,exit,postExitCalls,exitObservationMs:1000});
 }
 assert.deepEqual(report.failedAssets,[]);save('ui-'+device+'-'+phase,report);console.log(JSON.stringify(report));
}catch(e){report.failure=e.message;if(page){report.text=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:path.join(out,'ui-'+device+'-'+phase+'-failure.png')}).catch(()=>{});}save('ui-'+device+'-'+phase+'-failure',report);throw e;}finally{await browser.close();}
