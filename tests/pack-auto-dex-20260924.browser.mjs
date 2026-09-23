// Local-only UI/transaction simulation. No request is forwarded to production.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'pack-auto-dex-'));
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const hero=app.slice(app.indexOf('function hyperPackHero()'),app.indexOf('function recentCards('));
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>개봉 UI 로컬 검수</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/hyper-pack-v2076.css"><link rel="stylesheet" href="/css/black-miracle-v1485.css"><body><main id="shop" style="max-width:1100px;margin:24px auto"></main><div id="modal" class="modal"></div><script>
window.qa={accountId:7,enabled:true,coin:1000000000000,posts:[],receipts:{},fxMs:70,delay:0,fail:false};
window.loadUser=()=>({serverUserId:qa.accountId});
window.getPack=()=>({});window.packArt=()=>'<img style="max-width:220px;width:80%" src="/assets/ui/packs/hyper-pack-v2076.png" alt="하이퍼팩">';
${hero}
document.getElementById('shop').innerHTML=hyperPackHero();
const realFetch=window.fetch.bind(window);window.fetch=async(input,options={})=>{
 const url=String(input);if(!url.startsWith('/api/'))return realFetch(input,options);
 const key=url.slice(5);let value={};
 if(key==='mercenary-cards/feature')value={userOpeningEnabled:qa.enabled};
 else if(key==='mercenaries/v3/state')value={accountId:qa.accountId,openingAvailable:qa.enabled};
 else if(key.startsWith('mercenaries/v3/receipt?')){value=qa.receipts[new URLSearchParams(key.split('?')[1]).get('requestId')];if(!value)return new Response('{}',{status:404});}
 else if(options.method==='POST'){
  const body=JSON.parse(options.body);qa.posts.push(body);await new Promise(r=>setTimeout(r,qa.delay));
  if(qa.fail)return new Response(JSON.stringify({error:'잔액 부족',code:'MERCENARY_FUNDS'}),{status:400});
  if(!qa.receipts[body.requestId]){qa.coin-=body.count*500000000;qa.receipts[body.requestId]={requestId:body.requestId,status:'COMPLETED',coinCost:body.count*500000000,draws:Array.from({length:body.count},()=>({outcomeId:'MASTER_STAR',quantity:3}))};}
  value=qa.receipts[body.requestId];
 }
 return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
};
window.CNineUiFxVendor={};window.HyperPackFX={version:2145,create:(host,emit)=>{let finish;const fx={running:false,paused:false,init:async()=>{},play:()=>{fx.running=true;emit({state:'playing'});return new Promise(r=>{finish=()=>{fx.running=false;emit({state:'complete'});r();};setTimeout(()=>finish?.(),qa.fxMs);});},pause:()=>{fx.paused=!fx.paused;emit({state:fx.paused?'paused':'playing'});},skip:()=>finish?.(),destroy:()=>finish?.()};return fx;}};
window.blackTest=(overrides={})=>{window.blackCalls=[];window.blackRemaining=5;window.blackReceipts={};window.blackSaved=0;return window.blackController=BlackMiracleOpeningV1926.open({ownedQuantity:5,loadUser,reducedMotion:true,saveUser:()=>blackSaved++,apiUserToLocal:user=>user,...overrides,apiRequest:async(path,options)=>{const body=JSON.parse(options.body);blackCalls.push(body);await new Promise(r=>setTimeout(r,qa.delay));if(qa.fail)throw Error('network interrupted');return blackReceipts[body.requestId]||(blackReceipts[body.requestId]={user:{serverUserId:7},reward:{type:'COIN',amount:1000000,label:'코인'},remaining:--blackRemaining});}});};
</script><script src="/js/black-miracle-opening-v1926.js"></script><script type="module" src="/js/mercenary-pack-live.mjs"></script></body></html>`;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/qa.html'){res.setHeader('content-type','text/html;charset=utf-8');res.end(html);return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log(JSON.stringify({base,out}));}else{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const page=await browser.newPage({viewport,serviceWorkers:'block',reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
   const reset=async()=>{await page.goto(base+'/qa.html');await page.locator('[data-mercenary-auto]:not([disabled])').waitFor();};
   const start=async(count,batch='10')=>{await page.locator('[data-mercenary-auto]').click();await page.locator('[data-auto-total]').fill(String(count));await page.locator('[data-auto-batch]').selectOption(batch);await page.locator('[data-auto-start]').click();};
   await reset();check(await page.evaluate(()=>qa.posts.length)===0,'entering shop never spends');
   await page.locator('[data-mercenary-auto]').click();await page.locator('[data-auto-total]').fill('12');
   await page.screenshot({path:path.join(out,'hyper-'+viewport.width+'.png'),fullPage:true});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'hyper configuration fits '+viewport.width);
   await page.locator('[data-auto-start]').click();await page.waitForFunction(()=>qa.posts.length===2&&document.querySelector('.mercenary-auto-status').textContent.includes('개봉 완료'));
   check(JSON.stringify(await page.evaluate(()=>qa.posts.map(p=>p.count)))==='[10,2]','exact total with remainder '+viewport.width);
   check(await page.evaluate(()=>new Set(qa.posts.map(p=>p.requestId)).size)===2,'unique receipt for each batch');
   check(await page.evaluate(()=>qa.coin)===994000000000,'charges only selected 12 draws');
   await reset();await page.evaluate(()=>qa.fxMs=800);await start(10,'1');await page.locator('.mercenary-pack-dialog:not(.mercenary-auto-dialog) [data-auto-stop]').click();await page.waitForTimeout(1200);
   check(await page.evaluate(()=>qa.posts.length)===1,'stop prevents next purchase '+viewport.width);
   await reset();await page.evaluate(()=>qa.fail=true);await start(10,'1');await page.waitForFunction(()=>document.querySelector('.mercenary-auto-status').textContent.includes('잔액 부족'));check(await page.evaluate(()=>qa.posts.length)===1,'funds/error stops without retry');
   if(viewport.width===1440){
    await reset();await page.evaluate(()=>{qa.fxMs=300;});await start(3,'1');await page.waitForFunction(()=>qa.posts.length===1);await page.evaluate(()=>{qa.accountId=8;});await page.waitForTimeout(1300);check(await page.evaluate(()=>qa.posts.length)===1,'account switch stops later purchases');
    await reset();await page.evaluate(()=>{qa.fxMs=300;});await start(3,'1');await page.waitForFunction(()=>qa.posts.length===1);await page.evaluate(()=>window.dispatchEvent(new Event('cnine:route-will-change')));await page.waitForTimeout(700);check(await page.evaluate(()=>qa.posts.length)===1,'route change stops later purchases');
    await reset();await page.locator('[data-mercenary-auto]').click();await page.locator('[data-auto-total]').fill('0');check(await page.locator('[data-auto-start]').isDisabled(),'invalid count cannot start');await page.locator('[data-auto-close]').click();check(await page.evaluate(()=>qa.posts.length)===0,'cancel configuration never spends');
   }
   await reset();await page.evaluate(()=>blackTest());await page.screenshot({path:path.join(out,'black-intro-'+viewport.width+'.png'),fullPage:true});
   check(await page.evaluate(()=>blackCalls.length)===0,'black intro does not consume');
   await page.locator('[data-black-miracle-auto-count]').fill('2');await page.locator('[data-black-miracle-auto-start]').click();
   await page.waitForFunction(()=>document.querySelector('.black-miracle-auto-progress span').textContent.includes('개봉 완료'));
   check(await page.evaluate(()=>blackCalls.length)===2,'black opens exact selected total '+viewport.width);
   check(await page.locator('[data-black-miracle-choice="0"]').getAttribute('aria-pressed')==='true','black always reveals first slot');
   check(await page.evaluate(()=>new Set(blackCalls.map(p=>p.requestId)).size)===2,'black new receipt only after completion');
   await page.screenshot({path:path.join(out,'black-result-'+viewport.width+'.png'),fullPage:true});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'black fits '+viewport.width);
   await reset();await page.evaluate(()=>{qa.delay=300;blackTest();});await page.locator('[data-black-miracle-auto-count]').fill('3');await page.locator('[data-black-miracle-auto-start]').click();await page.locator('.black-miracle-auto-progress button').click();await page.waitForFunction(()=>blackController.phase==='revealed');await page.waitForTimeout(200);
   check(await page.evaluate(()=>blackCalls.length)===1,'black stop finishes current reward only');
   if(viewport.width===1440){
    await reset();await page.evaluate(()=>{qa.delay=300;blackTest();});await page.locator('[data-black-miracle-auto-start]').click();await page.waitForFunction(()=>blackCalls.length===1);await page.evaluate(()=>qa.accountId=8);await page.waitForFunction(()=>blackController.phase==='revealed');await page.waitForTimeout(250);check(await page.evaluate(()=>blackCalls.length)===1,'black account change never starts another request');check(await page.evaluate(()=>blackSaved)===0,'old account response never overwrites the new account');
    await reset();await page.evaluate(()=>blackTest());await page.locator('[data-black-miracle-open]').click();await page.waitForFunction(()=>blackController.phase==='choice');await page.locator('[data-black-miracle-choice="3"]').click();await page.waitForFunction(()=>blackController.phase==='revealed');check(await page.locator('[data-black-miracle-choice="3"]').getAttribute('aria-pressed')==='true','manual choice remains available');
   }
   await reset();await page.evaluate(()=>{qa.fail=true;blackTest();});await page.locator('[data-black-miracle-auto-start]').click();await page.waitForFunction(()=>blackController.phase==='error');
   const retryId=await page.evaluate(()=>blackCalls[0].requestId);await page.evaluate(()=>qa.fail=false);await page.locator('[data-black-miracle-open]').click();await page.waitForFunction(()=>blackController.phase==='choice');await page.locator('[data-black-miracle-choice="0"]').click();await page.waitForFunction(()=>blackController.phase==='revealed');check(await page.evaluate(()=>blackCalls[1].requestId)===retryId,'black uncertain retry reuses receipt');
   await page.close();
  }
  check(!errors.length,'no browser errors: '+errors.join(' | '));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close();}
}
