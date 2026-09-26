// Real shell/router and production assets; disposable local account and API fixtures only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8913';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Only isolated local QA is allowed');
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const out=fs.mkdtempSync(path.join(os.tmpdir(),'workshop-entry-20260926-'));
const baseline=process.env.WORKSHOP_QA_BASE||'4450b0df';
const files=['js/app.js','js/workshop-v1881.js','js/workshop-recipes-v1.js','js/soopketmon-v21-runtime-router.js'];
const before=Object.fromEntries(files.map(file=>[file,execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8',maxBuffer:8*1024*1024})]));
const fixture=()=>({wallet:{coin:9000000000,masterStars:10000,cardShards:15000000},inventory:{},recipes:[
 ...['458.jpeg','461.jpeg','lamborghini-veneno-showroom-v1.png','1321312.jpg','solaris-omega-v1.png'].map((name,i)=>({id:i+1,name:'차량 제작 '+(i+1),category:'VEHICLE',output_type:'VEHICLE',output_name:'제작 차량 '+(i+1),output_image:'assets/tire/'+name,output_rarity:'MYTHIC',output_pve:10000,success_rate:30,payment_mode:'COIN_OR_MASTER_STAR',coin_cost:5000000000,master_star_cost:1000,materials:[]})),
 {id:80,name:'미스틱 에너지 제작',category:'MATERIAL_CRAFT',code:'WORKSHOP_MYSTIC_ENERGY',output_type:'INVENTORY_ITEM',output_ref:'STARLIGHT_ARMOR_CORE',output_name:'미스틱 에너지',output_image:'assets/items/starlight-armor-core-v1749.png',output_quantity:1,success_rate:10,payment_mode:'COIN_AND_CARD_SHARD',coin_cost:200000000,card_shard_cost:5000000,materials:[]},
 {id:81,name:'H-BODY 제작',category:'BATTLE_SUIT_CRAFT',output_type:'EQUIPMENT',output_name:'H-BODY',output_image:'assets/items/h-body-v2066.png',success_rate:15,payment_mode:'BOTH',coin_cost:5000000000,master_star_cost:1000,materials:[]}
],synthesis:Array.from({length:16},(_,i)=>({recipe_id:i+1,name:'장비 '+(i+1),output_name:'합성 장비 '+(i+1),image_url:'assets/EQ/m'+(i%5+1)+'.jpeg',output_image:'assets/new myth/'+(i%6+20)+'.jpeg',rarity:'MYTHIC',output_rarity:'MYTHIC',quantity:30,input_quantity:3,success_rate:25,output_pve_power:250000,output_pvp_power:15000}))});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
try{
 for(const width of [1440,390])for(const version of process.env.WORKSHOP_QA_AFTER_ONLY?['after']:['before','after']){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,deviceScaleFactor:width===390?2:1,hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:width===390?4:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  let reads=0,writes=0,failRead=false,readDelay=400;
  const state=fixture(),requests=[];
  page.on('request',req=>requests.push({path:new URL(req.url()).pathname,type:req.resourceType()}));
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-account-7'));
  for(const file of files)await page.route('**/'+file+'?*',async route=>{
   if(file==='js/workshop-v1881.js')await new Promise(r=>setTimeout(r,1600));
   return version==='before'?route.fulfill({contentType:'text/javascript',body:before[file]}):route.continue();
  });
  await page.route('**/api/workshop**',async route=>{
   if(route.request().method()==='GET'){
    reads++;await new Promise(r=>setTimeout(r,readDelay));
    return route.fulfill(failRead?{status:503,json:{error:'ISOLATED temporary outage'}}:{json:state});
   }
   writes++;assert.equal(route.request().postDataJSON().recipeId,80);
   state.wallet.coin-=200000000;state.wallet.cardShards-=5000000;
   return route.fulfill({json:{ok:true,success:true,output:{name:'미스틱 에너지',quantity:1},state}});
  });
  await page.goto(base+'/?screen=home',{waitUntil:'networkidle'});
  requests.length=0;
  const timing=await page.evaluate(async()=>{
   const start=performance.now();let firstSection='';let renders=0;
   const observer=new MutationObserver(()=>{const active=document.querySelector('#workshopRootV1881 [data-ws-section].active');if(active){firstSection ||= active.dataset.wsSection;renders++;}});
   observer.observe(document,{childList:true,subtree:true});
   await window.SoopketmonV21RuntimeRouter.navigate('fusion');
   observer.disconnect();return {entryToReady:Math.round(performance.now()-start),firstSection,renders};
  }).catch(async error=>{console.log(JSON.stringify({version,width,errors,diagnostic:await page.evaluate(()=>({body:document.body.innerText.slice(-2000),binder:typeof window.bindWorkshopView,render:typeof window.renderShell}))}));throw error});
  const ws=page.locator('#workshopRootV1881');
  await ws.locator('[data-ws-section="SYNTHESIS"][aria-pressed="true"]').waitFor();
  await page.waitForTimeout(100);
  const images=[...new Set(requests.filter(r=>r.type==='image'&&/^\/assets\/(EQ|items|new|tire|ui\/(workshop|character-loadout))/.test(r.path)).map(r=>decodeURIComponent(r.path)))];
  const imageBytes=images.reduce((sum,p)=>sum+fs.statSync(path.join(root,p)).size,0);
  results.push({version,width,cpu:width===390?4:1,assetDelayMs:1600,apiDelayMs:400,...timing,reads,imageBytes,imageCount:images.length,vehicleRequests:images.filter(p=>p.includes('/tire/')||p.includes('/ui/workshop/vehicle-part')).length});
  if(version==='after'){
   assert.equal(reads,1,'slow asset loading consumes one API response');
   assert.equal(timing.firstSection,'SYNTHESIS','first paint is already the requested section');
   assert.equal(results.at(-1).vehicleRequests,0,'no discarded vehicle image requests');
   await page.evaluate(()=>window.renderShell('workshop'));
   await ws.locator('.ws81-nav').waitFor();assert.equal(reads,1,'immediate summary remount reuses state');
   const same=await page.evaluate(()=>{const root=document.querySelector('#workshopRootV1881'),image=root.querySelector('img');root.querySelector('[data-ws-section="SYNTHESIS"]').click();return image===root.querySelector('img')});
   assert.equal(same,true,'active section click keeps the existing DOM');
   await page.screenshot({path:path.join(out,`${width}-equipment.png`),fullPage:true});
   for(const section of ['VEHICLE','MATERIAL_CRAFT','BATTLE_SUIT_CRAFT','SUIT_CORE_SYNTHESIS','ITEM_SYNTHESIS','SYNTHESIS']){
    await ws.locator(`[data-ws-section="${section}"]`).click();
    assert.ok(await ws.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'no workshop overflow');
    assert.equal(await ws.locator(`[data-ws-section="${section}"]`).getAttribute('aria-pressed'),'true');
   }
   await ws.locator('#wsRecipeSearch').fill('장비 16');assert.equal(await ws.locator('[data-synth]').count(),1);
   await ws.locator('[data-ws-reset]').click();
   await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('vehicle'));await ws.locator('[data-part-code]').first().waitFor();
   assert.ok((await ws.locator('[data-part-code] img').evaluateAll(imgs=>imgs.map(i=>i.getAttribute('src')))).every(p=>p.includes('/thumbnails/')));
   await page.screenshot({path:path.join(out,`${width}-vehicle.png`),fullPage:true});
   failRead=true;await ws.locator('[data-ws-refresh]').click();await ws.locator('.ws76-error').waitFor();
   failRead=false;await ws.locator('.ws76-error button').click();await ws.locator('.ws81-nav').waitFor();
   if(width===1440){
    await ws.locator('[data-ws-section="MATERIAL_CRAFT"]').click();await ws.locator('#wsMaterialCraft').click();
    await page.locator('.ws81-material-result').waitFor();assert.equal(writes,1);
    assert.equal(await page.evaluate(()=>Number(window.loadUser()?.coin)),state.wallet.coin);
    await page.locator('.ws81-material-result button').click();
   }
   const previous=reads;readDelay=650;
   await page.evaluate(()=>{window.renderShell('buy');window.renderShell('workshop')});
   await page.waitForTimeout(100);await page.evaluate(()=>window.renderShell('buy'));
   await page.waitForTimeout(750);assert.equal(await page.locator('#workshopRootV1881').count(),0,'late response never restores an exited view');
   await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('fusion'));await ws.locator('.ws81-nav').waitFor();
   assert.equal(reads,previous+2,'both genuine reentries fetch current state');
   // A shell summary remount while the lazy module is still downloading must
   // preserve the requested equipment section on cold direct links as well.
   await page.addInitScript(()=>{
    let refreshed=false;
    new MutationObserver(()=>{
     if(!refreshed&&document.querySelector('.route-feature-loader')?.textContent.includes('제작소')){refreshed=true;window.__workshopQaRemounted=true;window.renderShell('workshop');}
    }).observe(document,{subtree:true,childList:true});
   });
   const coldReads=reads;
   await page.goto(base+'/?screen=fusion',{waitUntil:'domcontentloaded'});
   await ws.locator('[data-ws-section="SYNTHESIS"][aria-pressed="true"]').waitFor();
   assert.equal(await page.evaluate(()=>window.__workshopQaRemounted),true,'summary remount ran during resource loading');
   assert.equal(reads,coldReads+1,'cold deep link with summary remount makes one read');
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 for(const width of process.env.WORKSHOP_QA_AFTER_ONLY?[]:[1440,390]){
  const old=results.find(r=>r.width===width&&r.version==='before'),next=results.find(r=>r.width===width&&r.version==='after');
  assert.ok(next.imageBytes<old.imageBytes/5,'entry image bytes cut by at least 80%');
  assert.ok(next.entryToReady<old.entryToReady,'same delayed-network entry improves');
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({out,results,errors}));
}finally{await browser.close()}
