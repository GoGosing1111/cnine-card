// Run against serve-joint-account-qa.mjs with JOINT_QA_NATIVE=1, JOINT_QA_PORT=8913.
// All workshop reads/writes are isolated fixtures; never use a live account here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8913';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local isolated QA server required');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'workshop-loading-20260925-'));
const baseline=execFileSync('git',['show',`${process.env.WORKSHOP_QA_BASE||'2f72fbfb'}:js/app.js`],{encoding:'utf8',maxBuffer:8*1024*1024});
const current=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const fixture=()=>({wallet:{coin:9000000000,masterStars:10000,cardShards:15000000},inventory:{},recipes:[
  {id:1,name:'솔라리스 오메가',category:'VEHICLE',output_type:'VEHICLE',output_name:'솔라리스 오메가',output_image:'assets/tire/solaris-omega-v1.png',success_rate:30,payment_mode:'COIN_OR_MASTER_STAR',coin_cost:5000000000,master_star_cost:1000,materials:[]},
  {id:2,name:'미스틱 에너지 제작',category:'MATERIAL_CRAFT',code:'WORKSHOP_MYSTIC_ENERGY',output_type:'INVENTORY_ITEM',output_ref:'STARLIGHT_ARMOR_CORE',output_name:'미스틱 에너지',output_image:'assets/items/starlight-armor-core-v1749.png',output_quantity:1,success_rate:10,payment_mode:'COIN_AND_CARD_SHARD',coin_cost:200000000,card_shard_cost:5000000,materials:[]}
],synthesis:Array.from({length:30},(_,i)=>({recipe_id:i+1,name:'금룡 돌격소총 '+i,output_name:'인피니티 AK '+i,image_url:'assets/ui/project-v/account-battle-suits/weapons/gilded-dragon-ar-v1.png',output_image:'assets/ui/project-v/account-battle-suits/weapons/infinity-ak-v1.png',rarity:'MYTHIC',output_rarity:'MYTHIC',quantity:30,input_quantity:3,success_rate:25,output_pve_power:250000,output_pvp_power:15000}))});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
try{
 for(const [version,width,height] of [['before',1440,900],['after',1440,900],['after',390,844]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  let reads=0,writes=0,failRead=false;const state=fixture();
  await page.addInitScript(()=>{
    localStorage.setItem('cnine_card_api_token','local-account-7');
    new MutationObserver(()=>{if(!window.workshopReadyAt&&document.querySelector('#workshopRootV1881 .ws81-nav'))window.workshopReadyAt=performance.now()}).observe(document,{subtree:true,childList:true});
  });
  await page.route('**/js/app.js?*',route=>route.fulfill({contentType:'text/javascript',body:version==='before'?baseline:current}));
  await page.route(/\/(?:js|css)\/workshop-[^?]+\?/,async route=>{
    await new Promise(resolve=>setTimeout(resolve,300));await route.continue();
  });
  await page.route('**/api/workshop**',async route=>{
    if(route.request().method()==='GET'){
      reads++;await new Promise(resolve=>setTimeout(resolve,400));
      return route.fulfill(failRead?{status:503,json:{error:'ISOLATED temporary outage'}}:{json:state});
    }
    writes++;const body=route.request().postDataJSON();assert.equal(body.recipeId,2);
    state.wallet.coin-=200000000;state.wallet.cardShards-=5000000;
    return route.fulfill({json:{ok:true,success:true,recipeId:2,requestId:body.requestId,output:{name:'미스틱 에너지',quantity:1},state}});
  });
  await page.goto(base+'/?screen=fusion',{waitUntil:'domcontentloaded'});
  const root=page.locator('#workshopRootV1881');await root.locator('.ws81-nav').waitFor();
  const timing=await page.evaluate(()=>{
    const r=performance.getEntriesByType('resource'),assets=r.filter(e=>/\/(css|js)\/workshop-/.test(e.name)),api=r.find(e=>new URL(e.name).pathname==='/api/workshop');
    return {ready:Math.round(window.workshopReadyAt),entry:Math.round(Math.min(...assets.map(e=>e.startTime))),apiStart:Math.round(api.startTime),apiMs:Math.round(api.duration),assetsEnd:Math.round(Math.max(...assets.map(e=>e.responseEnd)))};
  });
  timing.entryToReady=timing.ready-timing.entry;results.push({version,width,...timing,reads});
  assert.equal(reads,1,'single entry read');assert.equal(writes,0);
  if(version==='after'){
    assert.ok(timing.apiStart<timing.assetsEnd,'API overlaps assets');
    for(const category of ['SYNTHESIS','VEHICLE','MATERIAL_CRAFT','BATTLE_SUIT_CRAFT','SUIT_CORE_SYNTHESIS','ITEM_SYNTHESIS']){
      await root.locator(`[data-ws-section="${category}"]`).click();
      assert.equal(await root.locator(`[data-ws-section="${category}"]`).getAttribute('aria-pressed'),'true');
      assert.ok(await root.evaluate(e=>e.scrollWidth-e.clientWidth<=1),'no workshop overflow');
    }
    assert.equal(reads,1,'tab switches never refetch');
    await root.locator('[data-ws-section="SYNTHESIS"]').click();await page.screenshot({path:path.join(out,`${width}-workshop.png`)});
    failRead=true;await root.locator('[data-ws-refresh]').click();await root.locator('.ws76-error').waitFor();
    failRead=false;await root.locator('.ws76-error button').click();await root.locator('.ws81-nav').waitFor();
    if(width===1440){
      await root.locator('[data-ws-section="MATERIAL_CRAFT"]').click();await root.locator('#wsMaterialCraft').click();
      await page.locator('.ws81-material-result').waitFor();assert.equal(writes,1);
      assert.equal(await page.evaluate(()=>Number(window.loadUser()?.coin)),state.wallet.coin,'server balance applied');
      await page.locator('.ws81-material-result button').click();
      await page.evaluate(()=>window.renderShell('buy'));await page.evaluate(()=>window.renderShell('workshop'));
      await root.locator('.ws81-nav').waitFor();assert.equal(writes,1,'reentry never crafts');
    }
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 assert.ok(results[1].entryToReady<results[0].entryToReady-250,'controlled delayed network improves by at least 250ms');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({assetDelayMs:300,apiDelayMs:400,results,errors},null,2));
 console.log(JSON.stringify({out,results,errors}));
}finally{await browser.close()}
