import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true}),samples=[],out='docs/qa/pet-rework-20261114/unified';
const ready=page=>page.locator('[data-pg-action="roll"][data-kind="stats"]:not([disabled])').waitFor();
const imageReady=page=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.pet-codex-v3 img')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().left<innerWidth).map(x=>x.decode().catch(()=>{})));});
try{
 for(const variant of ['source-png','runtime-webp'])for(let trial=1;trial<=3;trial++){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  await page.setExtraHTTPHeaders({'X-Pet-Asset-Variant':variant});const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:1500000,uploadThroughput:750000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const start=Date.now();await page.goto('http://127.0.0.1:18874/pet-codex/',{waitUntil:'domcontentloaded'});await ready(page);const firstInteractiveMs=Date.now()-start;await imageReady(page);const firstImagesMs=Date.now()-start;
  await page.locator('[data-pc-pet]').nth(1).click();await page.locator('.pg-unowned').waitFor();
  const reentry=Date.now();await page.locator('[data-pc-pet="PET-HEUKGU"]').click();await ready(page);const reentryInteractiveMs=Date.now()-reentry;await imageReady(page);const reentryImagesMs=Date.now()-reentry;
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/')).map(x=>({name:new URL(x.name).pathname,ms:Math.round(x.duration),bytes:x.transferSize})));
  samples.push({variant,trial,firstInteractiveMs,firstImagesMs,reentryInteractiveMs,reentryImagesMs,assetTransferBytes:resources.reduce((n,x)=>n+x.bytes,0),largestWaits:resources.sort((a,b)=>b.ms-a.ms).slice(0,5)});
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:18874/pet-codex/');await ready(page);
 const frames=page.evaluate(()=>new Promise(resolve=>{
  const values=[],tasks=[];let prev=performance.now(),start=prev;
  const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(x=>x.duration)));observer.observe({type:'longtask'});
  const next=now=>{values.push(now-prev);prev=now;if(now-start<2500)requestAnimationFrame(next);else{observer.disconnect();const a=[...values].sort((x,y)=>x-y);resolve({samples:a.length,p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1),over50ms:a.filter(x=>x>50).length,longTasks:tasks});}};requestAnimationFrame(next);
 }));
 await page.locator('[data-pg-action="roll"][data-kind="stats"]').click();await page.locator('[data-pg-action="apply"]').waitFor();const timing=await frames;
 await page.locator('[data-pg-action="keep"]').click();await ready(page);
 await page.locator('[data-pg-action="roll"][data-kind="trait"]').click();await page.locator('[data-dice-phase="rolling"]').waitFor();await page.evaluate(()=>window.__petGrowthDemo.dispose());
 const afterExit=await page.evaluate(()=>({dice:window.__petCodexReview.animation(),effects:window.__petGrowthDemo.getActiveFx()}));await page.waitForTimeout(1300);assert.deepEqual(await page.evaluate(()=>({dice:window.__petCodexReview.animation(),effects:window.__petGrowthDemo.getActiveFx()})),afterExit);
 const summary={};for(const variant of ['source-png','runtime-webp']){const rows=samples.filter(x=>x.variant===variant);summary[variant]=Object.fromEntries(['firstInteractiveMs','firstImagesMs','reentryInteractiveMs','reentryImagesMs','assetTransferBytes'].map(key=>[key,rows.map(x=>x[key]).sort((a,b)=>a-b)[1]]));}
 const report={conditions:{loading:'Windows Chrome headless, 390x844 viewport, CPU 4x, latency 80ms, 1.5MB/s download; three fresh contexts per variant',entry:'Direct /pet-codex/ navigation to actionable stats + trait buttons; reentry is another pet then Heukgu in same screen',comparison:'Same new UI, server serves original pet PNGs and dice icon PNGs vs resized WebP assets. Actual HTTP transfer, no browser route interception.',frames:'Unthrottled Windows Chrome headless, 390x844; a real stat roll and result render; not physical mobile',production:'No live DB/API, server or native game client measurement'},summary,samples,diceFrames:timing,afterExit};
 await fs.writeFile(out+'/performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify({summary,frames:timing,afterExit}));
}finally{await browser.close();}

