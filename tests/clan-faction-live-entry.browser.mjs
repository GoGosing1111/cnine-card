// Real index, shared navigation, ClanV1 and V3 renderer. API writes stay in a synthetic loopback DB.
import fs from 'node:fs';import assert from 'node:assert/strict';
import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
import {factionReviewCards} from './helpers/clan-faction-fixture.mjs';
const base=process.env.FACTION_QA_ORIGIN||'http://127.0.0.1:8960',source=process.env.FACTION_LIVE_ORIGIN||base,out=process.env.FACTION_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'clan-faction-qa-'));
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'}),headless:true});
const user={id:1,serverUserId:1,nickname:'DK 지휘관',role:'OWNER',coin:1234567890,cardShards:123456,masterStars:2300,pigCoin:0,owned:factionReviewCards.map(c=>c.id),quantities:Object.fromEntries(factionReviewCards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const errors=[],checks=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await fetch(base+'/api/preview/reset',{method:'POST'});
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','faction-local-qa');},user);
  await page.route('**/api/**',async route=>{
   const key=new URL(route.request().url()).pathname.slice(5),method=route.request().method();
   if(key==='clan/overview'||key.startsWith('clan/faction/')){
    const response=await fetch(base+'/api/'+key,{method,body:method==='GET'?undefined:route.request().postData(),headers:{'content-type':'application/json'}});
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   }
   const data={
    'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:factionReviewCards},packs:{packs:[]},messages:{messages:[],unread:0},
    'chief/status':{chief:{active:true,ordinal:3,nickname:'오늘의 족장',startsAt:new Date(Date.now()-86400000).toISOString(),remainingMs:86400000}},
    'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]},
    'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},
   }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   return route.fulfill({json:data});
  });
  await page.goto(source+'/');const lobby=page.locator('soop-adventure-lobby');await lobby.locator('.stage-character').waitFor();
  if(viewport.width>980)await lobby.locator('.sidebar [data-category="social"]').click();
  else{await lobby.locator('.mobile-dock [data-category="all"]').click();}
  await lobby.locator('.menu-result[data-route="clan"]').click();await page.locator('.clan-tabs [data-clan-tab="faction"]').click();await page.locator('.fw-zone').first().waitFor();checks.push(viewport.width+' live menu → faction');
  assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1));
  await page.locator('[data-fw-zone="11680"]').click();await page.locator('[data-fw-launch]').click();await page.locator('[data-fw-strike]').waitFor();await page.locator('[data-fw-strike]').click();
  await page.locator('#modal canvas').first().waitFor({timeout:60000});checks.push(viewport.width+' shared V3 canvas');
  await page.waitForFunction(()=>!document.querySelector('#modal.battle-v3-preparing'),{},{timeout:60000});
  assert.match(await page.locator('.battle-v3-header strong').textContent(),/세력전 · 강남구/);
  await page.screenshot({path:out+'/live-battle-'+viewport.width+'.png'});
  await page.locator('[data-fw-battle-close]').waitFor({timeout:120000});
  await page.locator('[data-fw-battle-close]').click();await page.locator('.fw-notice').filter({hasText:'공유 HP'}).waitFor();checks.push(viewport.width+' battle → result → return');
  assert.equal(await page.locator('#modal canvas').count(),0);
  await page.screenshot({path:out+'/live-return-'+viewport.width+'.png'});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/live-entry-results.json',JSON.stringify({source,checks,errors},null,2));console.log({checks,errors});
}finally{await browser.close();}
