// Real app/router/read queue with isolated GET fixtures; never spends live resources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8964';
assert.equal(new URL(base).hostname,'127.0.0.1','local disposable account required');
const out=process.env.WORKSHOP_QA_OUT||fs.mkdtempSync(path.join(os.tmpdir(),'workshop-first-entry-20261021-'));
fs.mkdirSync(out,{recursive:true});
const baseline=process.env.WORKSHOP_QA_BASE||'bff9114f3';
const before=execFileSync('git',['show',`${baseline}:js/app.js`],{encoding:'utf8',maxBuffer:8*1024*1024});
const state={wallet:{coin:9000000000,masterStars:10000,cardShards:15000000},inventory:{},recipes:[],synthesis:Array.from({length:16},(_,i)=>({recipe_id:i+1,name:'대량 보유 장비 '+(i+1),output_name:'합성 장비 '+(i+1),image_url:'assets/EQ/m'+(i%5+1)+'.jpeg',output_image:'assets/new myth/'+(i%6+20)+'.jpeg',rarity:'MYTHIC',output_rarity:'MYTHIC',quantity:2001,quantity_capped:true,input_quantity:20,success_rate:25,output_pve_power:250000,output_pvp_power:15000}))};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),results=[],errors=[];
try{
 for(const width of [1440,390])for(const version of ['before','after']){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,deviceScaleFactor:width===390?2:1,hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:width===390?4:1});
  page.on('pageerror',e=>errors.push({version,width,message:e.message}));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF')});
  if(version==='before')await page.route('**/js/app.js?*',route=>route.fulfill({contentType:'text/javascript',body:before}));
  let reads=0,writes=0,mode='ok';const queue=[];
  await page.route('**/api/__workshop_queue_*',route=>{queue.push(route)});
  await page.route('**/api/workshop',async route=>{
   if(route.request().method()!=='GET'){writes++;return route.abort()}
   reads++;
   const fail=mode==='fail'||mode==='transient';if(mode==='transient')mode='ok';
   await new Promise(resolve=>setTimeout(resolve,150));
   return route.fulfill(fail?{status:503,json:{error:'ISOLATED temporary outage'}}:{json:state}).catch(()=>{});
  });
  await page.goto(base+'/?screen=home',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>API_READ_ACTIVE===0);
  await page.evaluate(()=>{
   window.__workshopQueueReads=Array.from({length:6},(_,i)=>fetchWithTimeout('/api/__workshop_queue_'+i,{},25000).catch(()=>null));
  });
  await page.waitForFunction(()=>API_READ_ACTIVE===6);assert.equal(queue.length,6);
  const start=Date.now();
  await page.evaluate(()=>{
   window.__workshopErrorsSeen=0;
   new MutationObserver(()=>{if(document.querySelector('#workshopRootV1881 .ws76-error'))window.__workshopErrorsSeen++}).observe(document,{subtree:true,childList:true});
   void window.SoopketmonV21RuntimeRouter.navigate('fusion');
  });
  const root=page.locator('#workshopRootV1881');
  await root.waitFor();
  if(version==='before'){
   await root.locator('.ws76-error').waitFor({timeout:15000});
   assert.match(await root.innerText(),/제시간에 받지 못했습니다/);
   assert.equal(reads,0,'old total deadline fails while still in the queue');
  }else{
   await page.waitForTimeout(Math.max(0,13000-(Date.now()-start)));
   assert.equal(await root.locator('.ws76-error').count(),0,'first entry survives the old deadline');
   assert.equal(reads,0,'the actual GET still waits behind six reads');
  }
  const queuedMs=Date.now()-start;
  if(version==='before')await page.screenshot({path:path.join(out,`${width}-before.png`)});
  for(const route of queue)await route.fulfill({json:{ok:true}}).catch(()=>{});
  if(version==='after'){
   await root.locator('[data-ws-section="SYNTHESIS"][aria-pressed="true"]').waitFor();
   assert.equal(reads,1);assert.equal(await page.evaluate(()=>window.__workshopErrorsSeen),0);
   assert.match(await root.locator('.ws81-synth-detail').innerText(),/2,001개 이상/);
   assert.equal(await root.locator('#wsSynthBulk').getAttribute('data-synth-attempts'),'100');
   assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:path.join(out,`${width}-after.png`),fullPage:true});
   const recoveredMs=Date.now()-start;
   mode='transient';let prior=reads;const previousNav=await root.locator('.ws81-nav').elementHandle();await root.locator('[data-ws-refresh]').click();
   await page.waitForFunction(previous=>!previous.isConnected,previousNav);
   await root.locator('.ws81-nav').waitFor();assert.equal(reads,prior+2,'a transient GET failure recovers once');
   assert.equal(await page.evaluate(()=>window.__workshopErrorsSeen),0,'automatic recovery never paints an error');
   mode='fail';prior=reads;await root.locator('[data-ws-refresh]').click();await root.locator('.ws76-error').waitFor();
   assert.equal(reads,prior+2,'persistent failure stops after two attempts');
   mode='ok';prior=reads;await root.locator('.ws76-error button').click();await root.locator('.ws81-nav').waitFor();
   assert.equal(reads,prior+1,'manual retry reads current state');
   assert.equal(await root.locator('[data-ws-section="SYNTHESIS"]').getAttribute('aria-pressed'),'true');
   assert.equal(writes,0);results.push({version,width,cpu:width===390?4:1,queuedMs,recoveredMs,transientAttempts:2,persistentAttempts:2,manualRetryAttempts:1,writes,overflow:await root.evaluate(e=>e.scrollWidth-e.clientWidth)});
  }else results.push({version,width,cpu:width===390?4:1,queuedMs,errorBeforeRequest:true,writes});
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({baseline,results,errors},null,2)+'\n');
 console.log(JSON.stringify({out,results,errors}));
}finally{await browser.close()}
