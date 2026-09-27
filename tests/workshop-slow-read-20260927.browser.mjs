// Run with the isolated serve-joint-account-qa server. No live writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8913';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local isolated server required');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'workshop-slow-read-20260927-'));
const state={wallet:{coin:9000000000,masterStars:10000,cardShards:15000000},inventory:{},recipes:[],synthesis:Array.from({length:16},(_,i)=>({recipe_id:i+1,name:'대량 보유 장비 '+(i+1),output_name:'합성 장비 '+(i+1),image_url:'assets/EQ/m'+(i%5+1)+'.jpeg',output_image:'assets/new myth/'+(i%6+20)+'.jpeg',rarity:'MYTHIC',output_rarity:'MYTHIC',quantity:2001,quantity_capped:true,input_quantity:20,success_rate:25,output_pve_power:250000,output_pvp_power:15000}))};
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],errors=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,deviceScaleFactor:width===390?2:1,hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:width===390?4:1});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-account-7'));
  let reads=0,mode='slow';const delayed=[];
  await page.route('**/api/workshop',async route=>{
   reads++;
   if(mode==='slow'){delayed.push(route);return}
   await new Promise(r=>setTimeout(r,300));
   await route.fulfill(mode==='fail'?{status:503,json:{error:'ISOLATED outage'}}:{json:state}).catch(()=>{});
  });
  await page.goto(base+'/?screen=home',{waitUntil:'networkidle'});
  const timing=await page.evaluate(async()=>{
   window.__wsStart=performance.now();
   const result=await window.SoopketmonV21RuntimeRouter.navigate('fusion');
   return {routeMs:performance.now()-window.__wsStart,result};
  });
  assert.equal(timing.result.ok,true,'slow data is owned by the view, not a missing-route error');
  const root=page.locator('#workshopRootV1881');await root.locator('.ws76-error').waitFor({timeout:15000});
  const timeoutMs=await page.evaluate(()=>performance.now()-window.__wsStart);
  assert.ok(timeoutMs<14500,'bounded waiting covers a stalled fetch');assert.equal(reads,1);
  assert.match(await root.innerText(),/제시간에 받지 못했습니다/);
  assert.ok(!(await page.locator('body').innerText()).includes('연결할 운영 화면을 찾지 못했습니다'));
  await page.screenshot({path:path.join(out,`${width}-timeout.png`)});
  mode='ok';const retryStart=Date.now();await root.locator('.ws76-error button').click();await root.locator('.ws81-nav').waitFor();
  const retryMs=Date.now()-retryStart;assert.equal(reads,2);
  assert.equal(await root.locator('[data-ws-section="SYNTHESIS"]').getAttribute('aria-pressed'),'true');
  assert.match(await root.locator('.ws81-synth-detail').innerText(),/2,001개 이상/);
  assert.match(await root.locator('.ws81-synth-detail').innerText(),/1개 이상 유지/);
  assert.equal(await root.locator('#wsSynthBulk').getAttribute('data-synth-attempts'),'100');
  assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:path.join(out,`${width}-ready.png`),fullPage:true});
  for(const route of delayed)await route.fulfill({json:{...state,synthesis:[]}}).catch(()=>{});
  await page.waitForTimeout(100);assert.equal(await root.locator('[data-synth]').count(),16,'old timed-out response cannot replace retry');
  mode='fail';await root.locator('[data-ws-refresh]').click();await root.locator('.ws76-error').waitFor();
  assert.match(await root.innerText(),/ISOLATED outage/);mode='ok';await root.locator('.ws76-error button').click();await root.locator('.ws81-nav').waitFor();
  results.push({width,cpu:width===390?4:1,routeMs:Math.round(timing.routeMs),timeoutMs:Math.round(timeoutMs),retryMs,reads,overflow:await root.evaluate(e=>e.scrollWidth-e.clientWidth)});
  await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({out,results,errors}));
}finally{await browser.close()}
