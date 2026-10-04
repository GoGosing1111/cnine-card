// Load the real cube and main-app pages. All account/API traffic stays in this fixture.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.MIRACLE_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'miracle-navigation-'));
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],writes=[];let page;
const user={id:4242,serverUserId:4242,nickname:'메뉴 검수 계정',role:'USER',coin:1234567890,cardShards:123456,masterStars:2300,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const endpoints={
 'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},
 cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},inventory:{items:[],balances:{}},
 'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},
 'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
 'magic/status':{visible:true,enabled:true,cards:[],loadouts:[],settings:{drawEnabled:false,drawCost:0,drawCoinCost:1000,packRewards:{magicCardWeight:100}}},
 'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},
 'miracle-cube/state':{accountId:4242,balance:0,isOwner:false,ready:false,openingEnabled:false,policy:{ranks:{C:0,B:0,A:0,S:0,SS:0,SSS:0}},catalog:[]}
};
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_api_token','local-navigation-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_battle_sound','OFF');},user);
  await page.route('**/api/**',route=>{
   const request=route.request(),key=new URL(request.url()).pathname.slice(5);
   if(!['GET','HEAD'].includes(request.method()))writes.push({key,method:request.method()});
   return route.fulfill({json:endpoints[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}}});
  });
  const menu=page.locator('soop-adventure-lobby');
  const category=async id=>{
   await menu.locator(width>980?`.sidebar [data-category="${id}"]`:'.mobile-dock [data-category="all"]').click();
   if(width<=980&&id!=='all')await menu.locator(`.category-jump[data-category="${id}"]`).click();
  };
  await page.goto(base+'/miracle-cube/',{waitUntil:'domcontentloaded'});await menu.waitFor();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('개봉 준비 중'));
  // Captures the original failure before any destination has a chance to load.
  await menu.locator(width>980?'.sidebar [data-category="all"]':'.mobile-dock [data-category="all"]').click();
  const initial={contractAvailable:await page.evaluate(()=>Boolean(window.SoopketmonV21NavigationContract)),menuCount:await menu.locator('.menu-result').count(),notice:await menu.locator('#result-count').innerText()};
  if(!initial.contractAvailable){await page.screenshot({path:path.join(out,'before-missing-menu.png')});fs.writeFileSync(path.join(out,'reproduction.json'),JSON.stringify(initial,null,2));}
  check(initial.contractAvailable&&initial.menuCount>20,name+' cube loads the full menu contract');
  for(const id of ['buy','inventory','magic','messages','pvp','mercenaryDex'])check(await menu.locator(`.menu-result[data-route="${id}"]`).count()===1,name+' menu includes '+id);
  check(!(await menu.locator('#result-count').innerText()).includes('불러오지 못했습니다'),name+' no menu loading error');
  await page.screenshot({path:path.join(out,name+'-cube-menu.png')});await menu.locator('#close-menu').click();
  for(const [id,group,ready] of [['magic','cards','[data-mw-section="draw"]'],['inventory','all','#inventoryResultsSummary'],['messages','rewards','#messageList']]){
   await category(group);await menu.locator(`.menu-result[data-route="${id}"]`).click();
   await page.waitForURL(base+'/?screen='+id);await page.locator(`.v21-production-shell[data-route="${id}"] ${ready}`).waitFor();
   if(id==='inventory')await page.waitForFunction(()=>!document.querySelector('#inventoryResultsSummary').textContent.includes('불러오는 중'));
   if(id==='messages')await page.waitForFunction(()=>!document.querySelector('#messageList').textContent.includes('불러오는 중'));
   check(new URL(page.url()).pathname==='/',name+' '+id+' loads the main app rather than remaining in cube');
   check(await page.locator('soop-adventure-lobby').count()===1,name+' '+id+' keeps one navigation shell');
   await page.screenshot({path:path.join(out,name+'-'+id+'.png')});
   await page.goBack({waitUntil:'domcontentloaded'});await menu.waitFor();await page.locator('#closed-cube').waitFor();
   check(new URL(page.url()).pathname==='/miracle-cube/',name+' back returns to cube from '+id);
  }
  await category('cards');await menu.locator('#menu-search').fill('마법카드');
  check(await menu.locator('.menu-result').count()===1,name+' menu search works after returning');await menu.locator('#close-menu').click();
  await menu.locator(width>980?'.sidebar [data-home]':'.mobile-dock [data-home]').click();
  await page.waitForURL(base+'/?screen=home');await page.locator('soop-adventure-lobby .stage-character').waitFor();
  check(await page.locator('.v21-production-shell').getAttribute('data-route')==='home',name+' return to lobby works');
  await page.close();page=null;
 }
 check(errors.length===0,'no browser errors');check(writes.length===0,'navigation makes no purchase/opening/reward requests');
 const result={checks,passed:checks.length,errors,writes,output:out};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
