// Real inventory UI with local account fixtures; no production API calls or rewards.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inventoryUiFixture} from './fixtures/inventory-ui-v2125.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.INVENTORY_GIFT_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'inventory-gift-qa-'));
fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const user={id:4242,serverUserId:4242,nickname:'인벤토리 검수',role:'USER',coin:1234567890,cardShards:1234,masterStars:2300,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const key='cnine:funding-gift:4242:pending',requestId='764c31d0-1ed8-493d-a65d-a1c0f182b001',checks=[];
const ready=async page=>{
  try{await page.waitForFunction(()=>document.querySelector('#inventoryVault')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('.iv25-item').length>0,{},{timeout:10000});}
  catch(error){await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,2400)}));throw error;}
};
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[],uses=[];
    const inventory=inventoryUiFixture();inventory.unseenTotal=0;
    inventory.items.push({code:'FUNDING_GIFT_BOX',name:'펀딩 사은품',category:'GIFT_BOX',rarity:'SPECIAL',image:'assets/ui/packs/funding-gift-box-v1.png',quantity:0,usable:true});
    let failNext=true;
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({user,key,requestId})=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-inventory-qa');
      if(!sessionStorage.getItem('gift-qa-seeded')){localStorage.setItem(key,requestId);sessionStorage.setItem('gift-qa-seeded','1');}
    },{user,key,requestId});
    await page.route('**/api/**',route=>{
      const endpoint=new URL(route.request().url()).pathname.slice(5);
      if(endpoint==='inventory/use'){
        uses.push(route.request().postDataJSON());
        if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'검수용 응답 유실'}});}
        return route.fulfill({json:{ok:true,replayed:true,rewards:{coin:300000000000,masterStar:5000000,repairCoupon:2,mysticEnergy:1000}}});
      }
      return route.fulfill({json:({inventory,'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}})[endpoint]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}}});
    });
    await page.goto(base+'/?screen=inventory',{waitUntil:'domcontentloaded'});await ready(page);
    if(process.env.INVENTORY_GIFT_QA_REPRO==='1'){
      assert.equal(await page.locator('#modal.funding-gift-modal').isVisible(),true);assert.match(await page.locator('.funding-gift-balance').innerText(),/보유 0개/);
      await page.screenshot({path:path.join(out,'before.png')});await page.locator('.funding-gift-close').click();await page.locator('#inventoryRefresh').click();await ready(page);
      assert.equal(await page.locator('#modal.funding-gift-modal').isVisible(),true);assert.equal(uses.length,0);checks.push({reproduced:true,zeroStock:true,reopensAfterClose:true});await page.close();break;
    }
    const recover=page.locator('[data-inventory-recover="FUNDING_GIFT_BOX"]');
    assert.equal(await page.locator('#modal').isVisible(),false);assert.equal(await recover.isVisible(),true);assert.equal(uses.length,0);
    await page.locator('#inventoryRefresh').click();await ready(page);await page.goto(base+'/?screen=inventory',{waitUntil:'domcontentloaded'});await ready(page);
    assert.equal(await page.locator('#modal').isVisible(),false);assert.equal(uses.length,0);
    await page.screenshot({path:path.join(out,'inventory-'+viewport.width+'.png')});
    await recover.click();assert.equal(await page.locator('#modal.funding-gift-modal').isVisible(),true);assert.equal(uses.length,0);
    await page.locator('.funding-gift-close').click();await page.locator('#inventoryRefresh').click();await ready(page);
    assert.equal(await page.locator('#modal').isVisible(),false);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),requestId);
    await recover.click();await page.locator('.funding-gift-confirm').click();await page.waitForFunction(()=>document.querySelector('.funding-gift-confirm')?.textContent==='개봉 결과 다시 확인');
    await page.locator('.funding-gift-close').click();await page.goto(base+'/?screen=inventory',{waitUntil:'domcontentloaded'});await ready(page);
    assert.equal(await page.locator('#modal').isVisible(),false);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),requestId);
    await recover.click();await page.locator('.funding-gift-confirm').click();await page.waitForFunction(()=>document.querySelector('.funding-gift-confirm')?.textContent==='인벤토리로 돌아가기'&&!document.querySelector('.funding-gift-confirm').disabled);
    assert.equal(uses.length,2);assert.ok(uses.every(body=>body.requestId===requestId&&body.itemCode==='FUNDING_GIFT_BOX'&&body.count===1));
    await page.screenshot({path:path.join(out,'recovered-'+viewport.width+'.png')});await page.locator('.funding-gift-confirm').click();await ready(page);
    assert.equal(await page.locator('#inventoryGiftRecovery').isVisible(),false);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);
    // The same explicit recovery path works for the other two gift boxes, without opening either automatically.
    await page.evaluate(()=>{localStorage.setItem('cnine:recruitment-gift:4242:pending','recruitment-pending');localStorage.setItem('cnine:tournament-gift:4242:pending','tournament-pending');});
    await page.locator('#inventoryRefresh').click();await ready(page);assert.equal(await page.locator('#modal').isVisible(),false);
    for(const [code,kind] of [['RECRUITMENT_GIFT_BOX','recruitment'],['TOURNAMENT_GIFT_BOX','tournament']]){
      await page.locator('[data-inventory-recover="'+code+'"]').click();assert.equal(await page.locator('#modal.'+kind+'-gift-modal').isVisible(),true);await page.locator('.'+kind+'-gift-close').click();
    }
    assert.equal(uses.length,2);assert.equal(await page.locator('#modal').isVisible(),false);
    const overflow=await page.locator('#inventoryVault').evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(overflow<=1);assert.deepEqual(errors,[]);
    checks.push({width:viewport.width,automaticPopups:0,manualRecovery:true,preservedRequestId:true,replayedWithZeroStock:true,otherGiftRecovery:true,overflow,errors});await page.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({ok:true,out,checks}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
