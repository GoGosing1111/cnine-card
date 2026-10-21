import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR||path.join(root,'docs/qa/jokgak-city-disguise-20261022');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 for(const width of [1440,390,320]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),actor=f.roles.CITIZEN,source=f.roles.POLICE;
  let viewer=actor;
  await f.join(actor);await f.join(source);await f.p('UPDATE users SET nickname=? WHERE id=?','위장대상 <안전한 이름>',source).run();f.users.get(source).nickname='위장대상 <안전한 이름>';
  const page=await browser.newPage({viewport:{width,height:width===1440?1100:844},reducedMotion:width<600?'reduce':'no-preference'});
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();Date.now=()=>window.__CITY_TIME__+performance.now()-window.__CITY_ANCHOR__;},f.now);
   await page.route('**/api/**',async route=>{
    const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(viewer),json:(v,status=200)=>Response.json(v,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
    await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[],cards:[]}});
   });
   await page.route('**/__city-disguise-qa/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18;color:#eee;font-family:Arial,sans-serif"><main></main><script>window.loadUser=()=>({serverUserId:'+actor+',nickname:"검수"});window.ensureFeatureResources=async()=>{};</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
   const advance=async ms=>{f.advance(ms);await page.evaluate(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();},f.now);};
   const shot=async(name,selector)=>{
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport overflow');
    const box=page.locator(selector);assert.ok(await box.evaluate(el=>el.scrollWidth<=el.clientWidth+2),'panel overflow');
    await box.screenshot({path:path.join(out,width+'-'+name+'.png')});
   };
   const closeResult=async()=>{await page.locator('.jc-dialog [data-city-dialog-close]').last().click();await page.waitForFunction(()=>!document.querySelector('.jc-dialog'));};
   const openInventory=async()=>{
    if(await page.locator('.jc-desk').count())await page.locator('.jc-desk [data-city-desk="inventory"]').click();
    else await page.locator('[data-city-desk="inventory"]').first().click();
    await page.locator('.jc-disguise-inventory').waitFor();
   };
   await page.goto(origin+'/__city-disguise-qa/',{waitUntil:'domcontentloaded'});await page.locator('.jc-dashboard').waitFor();
   await page.locator('[data-city-hide-popups]').check();
   await page.locator('.jc-pin[data-city-place="MARKET"]').click();await page.locator('[data-city-desk="services"]').click();
   await page.locator('.jc-disguise-card').first().waitFor();await page.waitForFunction(()=>document.querySelector('.jc-disguise-card img')?.naturalWidth>0);
   await shot('market','.jc-desk');
   const buy=page.locator('.jc-desk [data-city-action="buy"][data-city-product="DISGUISE_ID"]');
   await buy.click();await page.locator('.jc-disguise-dialog').waitFor();await shot('purchase-confirm','.jc-disguise-dialog');
   await page.locator('.jc-dialog [data-city-confirm]').click();await page.locator('.jc-disguise-result').waitFor();
   assert.match(await page.locator('.jc-disguise-result').textContent(),/1개 구매/);await closeResult();await advance(6000);
   await openInventory();await page.waitForFunction(()=>!document.querySelector('.jc-disguise-inventory [data-city-action="use"]').disabled);
   await page.locator('.jc-disguise-inventory [data-city-action="use"]').click();await page.locator('.jc-disguise-result').waitFor();
   assert.match(await page.locator('.jc-disguise-result').textContent(),/위장대상 <안전한 이름>/);await shot('identity-result','.jc-disguise-dialog');await closeResult();
   await shot('inventory-active','.jc-desk');
   const until=(await cityStatus(f.env,f.users.get(actor),'MARKET',0,f.now)).mine.disguise.active.until;
   const clock=await page.locator('.jc-disguise-inventory [data-disguise-clock]').textContent();
   await page.waitForFunction(value=>document.querySelector('.jc-disguise-inventory [data-disguise-clock]')?.textContent!==value,clock);
   await page.locator('[data-city-desk-close]').click();await shot('identity-active','.jc');
   await page.reload();await page.locator('.jc-disguise-status').waitFor();assert.match(await page.locator('.jc-disguise-status').textContent(),/위장대상 <안전한 이름>/);
   await openInventory();await advance(until-f.now);
   await page.waitForFunction(()=>!document.querySelector('.jc-disguise-status')&&!document.querySelector('.jc-disguise-inventory [data-disguise-clock]'));
   await shot('expired','.jc-desk');
   viewer=source;await page.reload();await page.locator('.jc-dashboard').waitFor();await openInventory();
   assert.equal(await page.locator('.jc-disguise-inventory [data-city-action="use"]').isDisabled(),true);
   assert.match(await page.locator('.jc-disguise-inventory [data-city-action="use"]').textContent(),/경찰 사용 불가/);
   await shot('police-disabled','.jc-desk');
   checks.push({width,purchase3000:true,inventoryUse:true,aliasEscaped:true,artLoaded:true,liveCountdown:true,reloadPreserves:true,expiryRestores:true,policeDisabled:true,overflow:false});
  }catch(error){console.error(JSON.stringify({width,errors}));await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});throw error;}
  finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,accounts:'isolated fixtures; actual HTTP handler and city UI'},null,2)+'\n');console.log(JSON.stringify({checks,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
