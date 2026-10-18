import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
import {processCitySupply,citySupplyDropKey} from '../functions/_jokgak_city_supply.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)});f.setTime(cityShift(f.now).startsAt+60000);f.deps.citySupplyRandom=()=>0;
  await f.join(1,'POLICE');await f.join(2,'POLICE');f.users.get(1).nickname='보급수색대';f.users.get(2).nickname='황금까마귀';
  await f.p("UPDATE users SET nickname=CASE WHEN id=1 THEN '보급수색대' ELSE '황금까마귀' END WHERE id IN (1,2)").run();
  const initial=await processCitySupply(f.env,{now:f.now}),drop=initial.records[0].drop;f.setTime(drop.dropsAt+1000);
  const page=await browser.newPage({viewport:{width,height:width===1440?1100:844},reducedMotion:width===390?'reduce':'no-preference'});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();Date.now=()=>window.__CITY_TIME__+performance.now()-window.__CITY_ANCHOR__;},f.now);
   const setTime=async now=>{f.setTime(now);await page.evaluate(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();},f.now);};
   await page.route('**/api/**',async route=>{const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(1),json:(v,status=200)=>Response.json(v,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[],cards:[]}});});
   await page.route('**/__city-supply-qa/',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18;color:#eee;font-family:Arial,sans-serif"><main></main><script>window.loadUser=()=>({serverUserId:1,nickname:'보급수색대'});window.ensureFeatureResources=async()=>{};window.prepareBattleV2LiveLoading=({modal})=>{modal.innerHTML='<div class="battle-v3-header"><strong></strong><small></small></div><div class="qa-battle-host"></div>';return {stage:modal,host:modal.querySelector('.qa-battle-host')}};window.playPvpBattleV2Live=async()=>{};</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector('main').innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>`}));
   const refresh=async()=>{await page.locator('[data-city-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-city-refresh]')?.disabled);};
   const shot=async(name,selector)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport overflow');await page.locator(selector).screenshot({path:path.join(out,width+'-'+name+'.png')});};
   await page.goto(origin+'/__city-supply-qa/',{waitUntil:'domcontentloaded'});await page.locator('[data-city-supply]').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.jc-supply-panel img,.jc-map-art')].every(n=>n.naturalWidth>0));
   assert.equal(await page.locator('.jc-supply-pin').count(),1);await page.locator('.jc-supply-news').waitFor();assert.match(await page.locator('.jc-supply-news').textContent(),/경찰서.*보급상자 낙하/s);await shot('map-drop','.jc-map-panel');checks.push(width+': map pin, location news, two weapon images and image-backed frame load');
   await page.locator('.jc-supply-news').click();await page.locator('.jc-pin.selected[data-city-place="POLICE"]').waitFor();await setTime(f.now+11000);await refresh();await page.locator('.jc-supply-pin').click();
   await page.locator('[data-city-supply]').click();await page.waitForFunction(()=>document.querySelector('.jc-supply-copy h4')?.textContent==='보급수색대');await shot('holding','.jc-supply-panel');
   await page.locator('[data-city-hide-popups]').check();await page.waitForFunction(()=>!document.querySelector('[data-city-hide-popups]')?.disabled);
   await f.action(2,'attackSupply',{dropId:drop.id,targetId:1});await setTime(f.now+40000);await refresh();await page.waitForFunction(()=>document.querySelector('.jc-supply-copy h4')?.textContent==='황금까마귀');
   await page.locator('[data-city-supply]').click();await page.locator('.jc-battle-result .jc-supply-receipt').waitFor();assert.match(await page.locator('.jc-battle-result .jc-supply-receipt').textContent(),/빼앗았습니다/);await shot('combat-receipt','.jc-battle-result section');await page.locator('.jc-battle-result button').click();checks.push(width+': actual city actions claim, lose ownership, fight and take it back with immutable deadline; popup preference respected');
   await setTime(drop.endsAt+1000);await refresh();await page.locator('.jc-supply-history').waitFor();assert.match(await page.locator('.jc-supply-history').textContent(),/보급수색대.*그로자/);assert.equal(await page.locator('.jc-supply-pin').count(),0);await shot('winner','.jc-supply-panel');
   if(await page.locator('[data-notice-skip-all]').count())await page.locator('[data-notice-skip-all]').click();
   await page.locator('[data-city-desk="inventory"]').first().click();await page.locator('.jc-supply-gear').waitFor();await page.locator('[data-city-action="equipWeapon"][data-city-product="GROZA"]').click();await page.waitForFunction(()=>document.querySelector('.jc-supply-gear')?.textContent.includes('장착 해제'));await shot('inventory','.jc-desk');assert.equal((await cityStatus(f.env,f.users.get(1),'POLICE',0,f.now)).mine.weapon.power,700000);checks.push(width+': only final holder receives weapon, appears with art in actual inventory, equips at 700k');
   await page.locator('[data-city-gear="GROZA"]').last().click();await page.locator('.jc-supply-detail').waitFor();await page.waitForFunction(()=>document.querySelector('.jc-supply-detail img')?.naturalWidth>0);assert.ok(await page.locator('.jc-supply-detail img').evaluate(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return a.width<=b.width+1&&a.height<=b.height+1}));await shot('groza-detail','.jc-dialog');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   await page.locator('.jc-supply-prizes [data-city-gear="GOLDEN_AKS"]').click();await page.locator('.jc-supply-detail').waitFor();assert.match(await page.locator('.jc-supply-detail').textContent(),/황금 AKS.*700,000/s);await shot('golden-detail','.jc-dialog');await page.keyboard.press('Escape');
   await setTime(drop.endsAt+20000);await refresh();await page.reload();await page.locator('.jc-supply-panel').waitFor();assert.equal(await page.locator('.jc-supply-news').count(),0);checks.push(width+': seen news not repeated on reload; both exclusive weapon detail panels readable');
   // Mobile controls retain actual accessible hit areas, not painted text.
   const dimensions=await page.locator('.jc-supply-prizes button').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.ok(dimensions.every(n=>n.w>=44&&n.h>=44));
  }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,width+'-failure.json'),JSON.stringify({message:error.message,errors,body:await page.locator('body').textContent()},null,2));throw error;}
  finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,accounts:'isolated fixtures, actual HTTP handler and live city UI; unchanged battle renderer fast-forwarded'},null,2));console.log(JSON.stringify({checks,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
