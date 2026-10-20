import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
import {processCitySupply} from '../functions/_jokgak_city_supply.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {citySupplyWeaponExpiresAt} from '../shared/jokgak-city-supply-v1.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)});f.setTime(cityShift(f.now).startsAt+60000);f.deps.citySupplyRandom=()=>0;
  await f.join(1,'POLICE');
  const d=(await processCitySupply(f.env,{now:f.now})).records[0].drop;
  f.setTime(d.dropsAt+1000);await f.action(1,'claimSupply',{dropId:d.id});f.setTime(d.endsAt);await processCitySupply(f.env,{now:f.now});await f.action(1,'equipWeapon',{product:d.weaponCode});
  const expiry=citySupplyWeaponExpiresAt(d.endsAt);f.setTime(expiry-60000);
  const page=await browser.newPage({viewport:{width,height:width===1440?1100:844},reducedMotion:width===390?'reduce':'no-preference'});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();Date.now=()=>window.__CITY_TIME__+performance.now()-window.__CITY_ANCHOR__;},f.now);
   await page.route('**/api/**',async route=>{const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(1),json:(v,status=200)=>Response.json(v,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[],cards:[]}});});
   await page.route('**/__city-expiry-qa/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18;color:#eee;font-family:Arial,sans-serif"><main></main><script>window.loadUser=()=>({serverUserId:1,nickname:"검수"});window.ensureFeatureResources=async()=>{};</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
   const shot=async(name,selector)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport overflow');await page.locator(selector).screenshot({path:path.join(out,width+'-'+name+'.png')});};
   await page.goto(origin+'/__city-expiry-qa/',{waitUntil:'domcontentloaded'});await page.locator('.jc-supply-help').waitFor();
   assert.match(await page.locator('.jc-supply-help').textContent(),/획득 후 45분/);
   await page.locator('[data-city-hide-popups]').check();
   await page.waitForFunction(()=>!document.querySelector('[data-city-hide-popups]')?.disabled&&!document.querySelector('.jc-dispatch'));
   await page.locator('[data-city-desk="inventory"]').first().click();await page.locator('.jc-supply-gear').waitFor();await page.waitForFunction(()=>document.querySelector('.jc-supply-gear img')?.naturalWidth>0);
   assert.match(await page.locator('.jc-supply-gear').textContent(),/남은 사용 시간.*장착 해제/s);
   await shot('inventory-countdown','.jc-desk');
   await page.locator('.jc-supply-gear [data-city-gear]').click();await page.locator('.jc-supply-detail').waitFor();assert.match(await page.locator('.jc-supply-detail').textContent(),/남은 사용 시간.*획득 후 45분/s);await shot('detail-countdown','.jc-dialog');await page.keyboard.press('Escape');
   const countdown=await page.locator('.jc-supply-gear [data-supply-weapon-clock]').textContent();
   await page.waitForFunction(value=>document.querySelector('.jc-supply-gear [data-supply-weapon-clock]')?.textContent!==value,countdown);
   f.setTime(expiry);await page.evaluate(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();},f.now);
   await page.waitForFunction(()=>!document.querySelector('.jc-supply-gear')&&document.querySelector('.jc-kit-summary')?.textContent.includes('맨손'));
   await shot('expired-inventory','.jc-desk');
   let state=await cityStatus(f.env,f.users.get(1),'POLICE',0,f.now);assert.equal(state.mine.weapon.code,null);assert.deepEqual(state.mine.ownedWeapons,[]);
   await page.reload();await page.locator('.jc-supply-panel').waitFor();await page.locator('[data-city-desk="inventory"]').first().click();assert.equal(await page.locator('.jc-supply-gear').count(),0);
   checks.push({width,countdown:true,artLoaded:true,detail45Minutes:true,autoExpiredWithoutRefresh:true,unequipped:true,reloadStaysExpired:true,overflow:false});
  }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});throw error;}
  finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,accounts:'isolated fixtures; actual HTTP handler and city UI'},null,2));console.log(JSON.stringify({checks,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
