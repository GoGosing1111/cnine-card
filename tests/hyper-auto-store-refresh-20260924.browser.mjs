// Real index, shop router, wallet listener and auto-opening module. All API
// traffic is mocked; this test never opens a production pack.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'hyper-auto-store-'));
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  const user={id:4242,serverUserId:4242,nickname:'자동개봉 검수',role:'USER',coin:1000000000000,cardShards:0,masterStars:0,magicCrystals:0,pigCoins:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
  const posts=[],receipts=new Map();let postDelay=35,summaryDelay=15,lostResponse=false,receiptReads=0;
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','hyper-local-qa');},user);
  await page.route('**/api/**',async r=>{
   const url=new URL(r.request().url()),key=url.pathname.slice(5);
   if(key==='mercenary-cards/feature')return r.fulfill({json:{connected:true,userOpeningEnabled:true}});
   if(key==='mercenaries/v3/state')return r.fulfill({json:{accountId:user.id,openingAvailable:true}});
   if(key==='mercenaries/v3/receipt'){receiptReads++;const receipt=receipts.get(url.searchParams.get('requestId'));return r.fulfill({status:receipt?200:404,json:receipt||{code:'JOINT_NOT_FOUND'}});}
   if(['mercenary-cards/open','mercenary-cards/open-batch'].includes(key)){
    const body=r.request().postDataJSON();posts.push(body);await new Promise(resolve=>setTimeout(resolve,postDelay));
    if(!receipts.has(body.requestId)){user.coin-=body.count*500000000;user.masterStars+=body.count*3;receipts.set(body.requestId,{requestId:body.requestId,accountId:user.id,status:'COMPLETED',coinCost:body.count*500000000,draws:Array.from({length:body.count},()=>({outcomeId:'MASTER_STAR',quantity:3}))});}
    if(lostResponse){lostResponse=false;return r.fulfill({status:200,body:''});}
    return r.fulfill({json:receipts.get(body.requestId)});
   }
   if(key==='me/summary'){await new Promise(resolve=>setTimeout(resolve,summaryDelay));return r.fulfill({json:{user:{...user},prison:{incarcerated:false}}});}
   const fixtures={'service/status':{maintenance:{active:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true}},'live-operations':{items:[],serverNow:new Date().toISOString()},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},'loot-shop/balance':{pigCoins:0}};
   return r.fulfill({json:fixtures[key]||{visible:false,enabled:false,items:[],cards:[],loadouts:[],settings:{}}});
  });
  await page.goto(base+'/?pack=hyper',{waitUntil:'domcontentloaded'});await page.locator('soop-adventure-lobby').waitFor();
  await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('buy'));await page.locator('[data-mercenary-auto]:not([disabled])').waitFor();
  await page.evaluate(()=>{window.hyperRouteEvents=[];window.addEventListener('cnine:route-will-change',event=>hyperRouteEvents.push(event.detail));});
  const start=async(count,batch='10')=>{await page.locator('[data-mercenary-auto]').click();await page.locator('[data-auto-total]').fill(String(count));await page.locator('[data-auto-batch]').selectOption(batch);await page.locator('[data-auto-start]').click();};
  const done=()=>page.waitForFunction(()=>document.querySelector('.mercenary-auto-dialog')?.dataset.autoPhase==='done');
  check(posts.length===0,'shop entry never spends '+viewport.width);
  await start(37);await done();
  const status=await page.locator('.mercenary-auto-status').innerText();
  check(status.includes('37 / 37회 완료')&&status.includes('자동 개봉 완료'),'real shop wallet refresh does not stop auto '+viewport.width+': '+status);
  check(JSON.stringify(posts.map(p=>p.count))==='[10,10,10,7]','exact selected count and remainder '+viewport.width);
  check(new Set(posts.map(p=>p.requestId)).size===4,'one distinct receipt per authorized batch '+viewport.width);
  await page.waitForFunction(expected=>loadUser().coin===expected,user.coin);
  check(user.coin===981500000000&&user.masterStars===111,'exact debit and rewards '+viewport.width);
  check(await page.locator('soop-adventure-lobby').locator('#wallet-coin').getAttribute('aria-label')==='981,500,000,000','live wallet reflects completed openings '+viewport.width);
  check(await page.evaluate(()=>hyperRouteEvents.length)===0,'wallet refresh emits no route cleanup '+viewport.width);
  check(await page.locator('.mercenary-auto-results li').count()===20,'bounded quick results '+viewport.width);
  check(await page.locator('.mercenary-auto-dialog canvas,.mercenary-auto-dialog video,.mercenary-auto-dialog img').count()===0,'auto remains results-only '+viewport.width);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+viewport.width);
  await page.screenshot({path:path.join(out,'complete-'+viewport.width+'.png'),fullPage:true});
  await page.locator('[data-auto-close]').click();
  const before=posts.length;postDelay=200;summaryDelay=80;await start(5,'1');await page.waitForFunction(()=>document.querySelector('.mercenary-auto-dialog')?.dataset.autoPhase==='running');
  while(posts.length===before)await page.waitForTimeout(10);
  await page.locator('[data-auto-stop]').click();await done();await page.waitForTimeout(250);
  check(posts.length===before+1,'manual stop finishes current receipt only '+viewport.width);
  await page.locator('[data-auto-close]').click();
  lostResponse=true;postDelay=35;summaryDelay=15;const recoveryStart=posts.length;await start(12);await done();
  check((await page.locator('.mercenary-auto-status').innerText()).includes('12 / 12회 완료'),'lost response recovery continues in real shop '+viewport.width);
  check(posts.length===recoveryStart+2&&receiptReads===1,'recovery queries same receipt without extra POST '+viewport.width);
  await page.locator('[data-auto-close]').click();
  const leaveStart=posts.length;postDelay=220;await start(5,'1');while(posts.length===leaveStart)await page.waitForTimeout(10);
  await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('dailyquest'));await done();await page.waitForTimeout(300);
  check(posts.length===leaveStart+1,'actual navigation still stops additional purchases '+viewport.width);
  await page.close();
 }
 check(errors.length===0,'no uncaught browser errors: '+errors.join('; '));
 console.log(JSON.stringify({passed:checks.length,out,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
