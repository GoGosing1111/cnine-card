import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import path from 'node:path';
const root=process.cwd(),out='docs/qa/pet-rework-20261114',browser=await chromium.launch({channel:'chrome',headless:true});
const samples=[];
async function uiReady(page){await page.locator('[data-pg-action="roll"]:not([disabled])').waitFor();}
async function imagesReady(page){await page.evaluate(async()=>Promise.all([...document.querySelectorAll('.pet-growth img')].map(x=>x.decode().catch(()=>{}))));}
try{
 for(const variant of ['source-png','runtime-webp'])for(let trial=0;trial<3;trial++){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  await page.setExtraHTTPHeaders({'X-Pet-Asset-Variant':variant});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:1500000,uploadThroughput:750000});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const navStart=Date.now();await page.goto('http://127.0.0.1:18874/pet-codex/');await page.locator('[data-pet-growth-open]').waitFor();
  const firstStart=Date.now();await page.locator('[data-pet-growth-open]').click();await uiReady(page);const firstInteractiveMs=Date.now()-firstStart;
  await imagesReady(page);const firstImagesMs=Date.now()-firstStart;
  await page.locator('[data-pg-action="close"]').click();const secondStart=Date.now();await page.locator('[data-pet-growth-open]').click();await uiReady(page);const reentryInteractiveMs=Date.now()-secondStart;await imagesReady(page);
  const waits=await page.evaluate(()=>performance.getEntriesByType('resource').sort((a,b)=>b.duration-a.duration).slice(0,5).map(x=>({name:new URL(x.name).pathname,ms:Math.round(x.duration),bytes:x.transferSize})));
  samples.push({variant,trial:trial+1,firstInteractiveMs,firstImagesMs,reentryInteractiveMs,reentryImagesMs:Date.now()-secondStart,navigationAndTwoEntriesMs:Date.now()-navStart,largestResourceWaits:waits});
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:18874/pet-codex/');await page.locator('[data-pet-growth-open]').click();await uiReady(page);
 await page.locator('[data-pg-action="effect"]').click();await page.locator('[data-fx-play]').waitFor();await page.waitForTimeout(2400);
 const framePromise=page.evaluate(()=>new Promise(resolve=>{
  const frames=[],longTasks=[];let previous=performance.now(),start=previous;
  const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(x=>x.duration)));observer.observe({type:'longtask'});
  function frame(now){frames.push(now-previous);previous=now;if(now-start<2800)requestAnimationFrame(frame);else{observer.disconnect();const sorted=[...frames].sort((a,b)=>a-b);resolve({samples:frames.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),framesOver50Ms:frames.filter(x=>x>50).length,longTasks});}}
  requestAnimationFrame(frame);
 }));
 await page.locator('[data-fx-play]').click();const frames=await framePromise;
 await page.locator('[data-pg-action="close"]').click();const stopped=await page.evaluate(()=>({active:window.__petGrowthDemo.getActiveFx(),updates:window.__petFxUpdates||0}));
 await page.waitForTimeout(700);const later=await page.evaluate(()=>({active:window.__petGrowthDemo.getActiveFx(),updates:window.__petFxUpdates||0}));assert.deepEqual(later,stopped);assert.equal(later.active,0);
 const median=arr=>[...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)],summary={};
 for(const variant of ['source-png','runtime-webp']){const rows=samples.filter(x=>x.variant===variant);summary[variant]=Object.fromEntries(['firstInteractiveMs','firstImagesMs','reentryInteractiveMs','reentryImagesMs'].map(key=>[key,median(rows.map(x=>x[key]))]));}
 const report={conditions:{entry:'/pet-codex/ in local isolated review, same existing codex module',loading:'390x844 Chrome headless; CPU 4x, latency 80 ms, download 1.5 MB/s; three fresh contexts per variant; same UI and account fixture',comparison:'Original ImageGen dice PNGs versus proportionally resized runtime WebP icons; new UI unchanged',frames:'390x844 Chrome headless, unthrottled Windows host, warm single ASSAULT playback; not physical mobile',server:'Local in-memory test adapter, production server/database performance not measured'},summary,samples,frames,afterExit:later};
 await fs.writeFile(out+'/performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify({summary,frames,afterExit:later}));
}finally{await browser.close();}
