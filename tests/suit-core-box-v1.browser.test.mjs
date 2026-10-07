// Shipped main app and Prime bundle, with isolated accounts/API receipts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SUIT_CORE_BOX as product,SUIT_CORE_BOX_WEIGHTS} from '../shared/suit-core-box-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.SUIT_CORE_BOX_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'suit-core-box-'));
fs.mkdirSync(out,{recursive:true});
const entries=SUIT_CORE_BOX_WEIGHTS.map((r,i)=>({id:i+1,poolKey:'INVENTORY_ITEM:'+r.code,rewardType:'INVENTORY_ITEM',rewardRef:r.code,code:r.code,name:'슈트 코어 '+(i+1),category:'MATERIAL',rarity:'RARE',image:`assets/items/suit-core-${i+1}-${i===3?'v2066':'v2004'}.png`,drawWeight:r.weight,isExtra:true,removable:false,presentation:{enabled:false,tier:'STANDARD',effectKey:'NONE'}}));

async function fixture(t,viewport){
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});t.after(()=>browser.close());
  const page=await browser.newPage({viewport,serviceWorkers:'block',hasTouch:viewport.width<500}),errors=[],dialogs=[];
  page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
  const state={coin:2000000000000,owned:21,legacy:2,purchases:[],opens:[],receipts:new Map(),dropped:false,saved:null};
  const user=()=>({id:4242,serverUserId:4242,nickname:'슈트코어 검수',role:'USER',coin:state.coin,pigCoins:0,pigCoin:0,cardShards:0,masterStars:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true});
  const config=()=>({...product,coin:state.coin,balance:state.owned,openEnabled:true,maxOpen:500,maxPurchase:9007199,shop:{enabled:true,unitPrice:product.unitPrice},settings:{shopEnabled:true,openEnabled:true},pool:{entryCount:4,entries}});
  const legacy=()=>({...config(),kind:'equipment',name:'프라임 아머리 상자',subtitle:'PRIME ARMORY VAULT',itemCode:'PRIME_EQUIPMENT_SUPPLY_BOX',image:'assets/ui/packs/prime-armory-equipment-box-v1.png',balance:state.legacy,shop:{enabled:true,unitPrice:100000},poolVersion:'PRIME_EQUIPMENT_V1985_1'});
  await page.addInitScript(({user})=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','isolated-core-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1')},{user:user()});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!=='http://core-box.test')return route.abort();
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),body=route.request().method()==='POST'?route.request().postDataJSON():null;
      if(key==='suit-core-box/config')return route.fulfill({json:config()});
      if(key==='equipment/prime-supply-box/config')return route.fulfill({json:legacy()});
      if(key==='suit-core-box/purchase'){
        const cost=body.count*product.unitPrice;assert.ok(cost<=state.coin);assert.equal(body.expectedUnitPrice,product.unitPrice);
        state.purchases.push(body);state.coin-=cost;state.owned+=body.count;
        return route.fulfill({json:{ok:true,...body,itemCode:product.itemCode,totalPrice:cost,coin:state.coin,balance:state.owned}});
      }
      if(key==='suit-core-box/open'||key==='equipment/prime-supply-box/open'){
        state.opens.push({key,...body});let response=state.receipts.get(body.requestId);
        if(!response){
          const core=key==='suit-core-box/open',balance=core?'owned':'legacy';assert.ok(body.count<=500&&body.count<=state[balance]);state[balance]-=body.count;
          const low=Math.floor(body.count*.788),second=body.count-low;
          const counts=body.count>=500?[Math.floor(body.count*.788),Math.floor(body.count*.2),Math.floor(body.count*.01)]:null;
          const aggregated=counts?entries.map((r,i)=>({...r,count:i<3?counts[i]:body.count-counts.reduce((a,b)=>a+b,0)})):[{...entries[0],count:low||body.count},...(low?[{...entries[1],count:second}]:[])].filter(r=>r.count>0);
          response={ok:true,kind:core?'suit_core':'equipment',count:body.count,remainingQuantity:state[balance],poolVersion:core?product.poolVersion:legacy().poolVersion,aggregated,specialQueue:[],requestId:body.requestId};state.receipts.set(body.requestId,response);
          if(core&&body.count===500&&!state.dropped){state.dropped=true;return route.abort('connectionreset')}
        }
        return route.fulfill({json:response});
      }
      if(key==='admin/prime-draw/status')return route.fulfill({json:{suit_core:config(),equipment:legacy(),vehicle:{...legacy(),kind:'vehicle'},catalog:{inventory_item:entries}}});
      if(key==='admin/prime-draw/pool'){state.saved=body;return route.fulfill({json:config()})}
      const inventory={code:product.itemCode,name:product.name,description:product.description,category:'SUPPLY_BOX',rarity:'PRIME',image_url:product.image,image:product.image,quantity:state.owned,unseen_quantity:0,usable:true};
      const data={
        'service/status':{maintenance:{active:false}},'me/summary':{user:user(),prison:{incarcerated:false}},me:{user:user()},
        cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},inventory:{items:[inventory],totalQuantity:state.owned,ownedTypes:1,unseenTotal:0},
        'user/runtime-command':{lobbyBgm:{enabled:false,tracks:[]}},'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',remainingMs:86400000}},
        'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},
        'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
      return route.fulfill({json:data});
    }
    if(url.pathname==='/cms-fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#08111f;color:white;font:14px Arial,sans-serif}*{box-sizing:border-box}#cms{padding:16px}</style><link rel="stylesheet" href="/admin/prime-draw-admin-v1986.css"><link rel="stylesheet" href="/css/suit-core-box-v1.css"><div id="cms"><h1 id="pageTitle"></h1><section id="view-primedraw"><div id="primeDrawCmsV1986"></div></section></div><script>window.api=(p,o)=>fetch("/api/"+p,o).then(r=>r.json())</script><script src="/admin/prime-draw-admin-v1986.js"></script>'});
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    return route.fulfill({path:file});
  });
  return {browser,page,state,errors,dialogs};
}
async function shop(page){await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('buy'));await page.locator('[data-prime-buy="suit_core"][data-prime-count="1"]').waitFor();}
async function locked(page){await page.locator('#primeDrawWebglStage[data-prime-draw-state="locked"]').waitFor();}
async function result(page){await page.locator('#primeResultConfirm').waitFor();assert.equal(await page.locator('#primeDrawWebglStage').count(),0);}
async function swipe(page,mobile,partial=false,calm=true){
  const {width:w,height:h}=page.viewportSize(),dw=mobile?720:1280,dh=mobile?1280:720,s=Math.min(w/dw,h/dh),ox=(w-dw*s)/2,oy=(h-dh*s)/2;
  const th=mobile?82:68,tw=mobile?620:590,x=ox+((dw-tw)/2+th/2)*s,y=oy+(dh-(mobile?(calm?240:168):(calm?150:112))+th/2)*s,end=x+(tw-th)*s*(partial?.25:.94);
  if(mobile){const c=await page.context().newCDPSession(page);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*i/8,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
  else {await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(end,y,{steps:12});await page.mouse.up();}
}

for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  test(`${name}: bulk buy, real gentle swipe, repeat, receipt retry, inventory and CMS`,async t=>{
    const {page,state,errors}=await fixture(t,viewport),mobile=name==='mobile';
    await page.goto('http://core-box.test/?screen=buy');await page.locator('[data-prime-buy="suit_core"][data-prime-count="1000"]').waitFor();
    const panel=page.locator('#suitCoreBoxShop');await panel.scrollIntoViewIfNeeded();await panel.screenshot({path:path.join(out,name+'-shop.png')});
    assert.deepEqual(await panel.locator('.suit-core-box-odds small').allTextContents(),['78.8%','20%','1%','0.2%']);
    assert.match(await panel.innerText(),/1조/);await panel.locator('[data-prime-count="1000"]').click();
    await page.waitForFunction(()=>document.querySelector('#suitCoreBoxShop')?.textContent.includes('1,021개'));
    const input=page.locator('[data-prime-custom="suit_core"] input'),buy=page.locator('[data-prime-custom-buy="suit_core"]');
    await input.fill('9007200');assert.equal(await buy.isDisabled(),true);await input.fill('1.5');assert.equal(await buy.isDisabled(),true);
    await input.fill('200');assert.match(await buy.innerText(),/2,000억/);await buy.click();
    await page.waitForFunction(()=>document.querySelector('#suitCoreBoxShop')?.textContent.includes('1,221개'));
    assert.equal(state.coin,800000000000);assert.equal(await page.locator('[data-prime-buy="suit_core"][data-prime-count="1000"]').isDisabled(),true);
    await page.locator('[data-prime-open="suit_core"]').click();await page.locator('#primeDrawConfirm').click();await locked(page);
    await page.screenshot({path:path.join(out,name+'-unlock.png')});await swipe(page,mobile,true);await locked(page);await swipe(page,mobile);await result(page);
    assert.match(await page.locator('.supply-result-head').innerText(),/10개 일괄 개봉 완료/);await page.screenshot({path:path.join(out,name+'-result.png')});
    await page.locator('.supply-result-again').click();await locked(page);await page.locator('.prime-core-result-skip').click();await result(page);assert.equal(state.owned,1201);
    await page.locator('#primeResultConfirm').click();await page.locator('[data-inventory-select="SUIT_CORE_SUPPLY_BOX"]').click();await page.locator('[data-inventory-use="SUIT_CORE_SUPPLY_BOX"]:visible').waitFor();
    assert.equal(await page.locator('[data-inventory-use="SUIT_CORE_SUPPLY_BOX"]:visible').isDisabled(),false);
    await page.locator('[data-inventory-use="SUIT_CORE_SUPPLY_BOX"]:visible').click();await page.locator('[data-prime-open-count="1201"]').click();await page.locator('#primeDrawConfirm').click();await locked(page);
    if(mobile)await page.locator('.prime-core-result-skip').click();else await page.keyboard.press('Escape');await result(page);
    assert.match(await page.locator('.supply-result-head').innerText(),/1,201개 일괄 개봉 완료/);assert.equal(state.owned,0);
    assert.equal(await page.locator('.prime-result-card').count(),4);await page.screenshot({path:path.join(out,name+'-bulk-result.png')});
    const requests=state.opens.filter(r=>r.key==='suit-core-box/open');assert.deepEqual(requests.map(r=>r.count),[10,10,500,500,500,201]);assert.equal(requests[2].requestId,requests[3].requestId);assert.equal(new Set(requests.map(r=>r.requestId)).size,5);
    assert.equal(await page.locator('.supply-result-again').count(),0);await page.locator('#primeResultConfirm').click();
    if(mobile){state.owned=1;await page.emulateMedia({reducedMotion:'reduce'});await shop(page);await page.locator('[data-prime-open="suit_core"]').click();await page.locator('#primeDrawConfirm').click();await result(page);assert.equal(state.owned,0);await page.locator('#primeResultConfirm').click();await page.emulateMedia({reducedMotion:'no-preference'});}
    await shop(page);await page.locator('[data-prime-open="equipment"]').click();await page.locator('[data-prime-open-count="1"]').click();await page.locator('#primeDrawConfirm').click();await locked(page);assert.equal(await page.locator('.prime-core-result-skip').count(),0);await swipe(page,mobile,false,false);await result(page);assert.equal(state.legacy,1);await page.locator('#primeResultConfirm').click();
    await page.goto('http://core-box.test/cms-fixture');await page.locator('[data-prime-kind="suit_core"]').click();
    assert.equal(await page.locator('[data-prime-row]').count(),4);assert.equal(await page.locator('#primeDrawAddV1987').isVisible(),false);assert.equal(await page.locator('[data-prime-remove]').count(),0);assert.equal(await page.locator('[data-prime-presentation]:disabled').count(),4);
    await page.screenshot({path:path.join(out,name+'-cms.png'),fullPage:true});await page.locator('#primeDrawSaveV1986').click();await page.waitForFunction(()=>!document.querySelector('#primeDrawSaveV1986')?.disabled);
    assert.equal(state.saved.kind,'suit_core');assert.deepEqual(state.saved.entries.map(r=>r.drawWeight),[78.8,20,1,.2]);
    assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({screenshots:out,purchases:state.purchases.map(r=>r.count),coreRequests:requests.map(r=>r.count),pageErrors:errors}));
  });
}
