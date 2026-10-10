import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.CITY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],requests=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),id=f.roles.CITIZEN,attacker=f.roles.GANG;
  await f.join(id);await f.join(attacker);const pages=[];
  const makePage=async userId=>{
   const actor=f.users.get(userId),page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});pages.push(page);
   await page.addInitScript(({actor,now})=>{window.loadUser=()=>({serverUserId:actor.id,nickname:actor.nickname});window.__now=now;Date.now=()=>window.__now;},{actor,now:f.now});
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),body=req.postData();const response=await handleJokgakCity({path:url.pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(value,status=200)=>Response.json(value,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body})})});requests.push({width,userId,path:url.pathname,status:response?.status});await route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});});
   await page.route('**/__city-comms-qa/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18"><main></main><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
   await page.goto(origin+'/__city-comms-qa/',{waitUntil:'domcontentloaded'});await page.locator('.jc-comms-tools').waitFor();return page;
  };
  const page=await makePage(id),notice=page.locator('.jc-dispatch[role=alertdialog]');
  const clock=async()=>{for(const p of pages)await p.evaluate(now=>window.__now=now,f.now);};
  const poll=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/jokgak-city/notifications'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await response;};
  const attack=async()=>{f.advance(1);await clock();await f.p('UPDATE jokgak_city_players_v1 SET health=100,next_action_at=0,protected_until=0 WHERE user_id IN (?,?)',id,attacker).run();return f.action(attacker,'attack',{targetId:id});};
  const clickAndWait=async(locator,endpoint)=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/jokgak-city/'+endpoint));await locator.click();return (await pending).json();};
  try{
   for(let n=0;n<13;n++)await attack();
   await clickAndWait(page.locator('[data-city-hide-popups]'),'notice-settings');await poll();assert.equal(await notice.count(),0);
   await page.reload();await page.locator('.jc-comms-tools').waitFor();assert.equal(await page.locator('[data-city-hide-popups]').isChecked(),true);await poll();assert.equal(await notice.count(),0);
   checks.push(width+': hide preference saves for production-shaped account and survives reload without dismissing records');
   await page.locator('.jc-comms-tools [data-city-desk=logs]').click();await page.locator('.jc-activity-list .is-incoming').first().waitFor();assert.equal(await page.locator('.jc-activity-list .is-incoming').count(),13);
   await page.screenshot({path:path.join(out,width+'-activity-log.png')});await clickAndWait(page.locator('[data-city-notice-skip-all]'),'ack-all');await poll();assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_notifications_v1 WHERE user_id=? AND read_at=0',id).first()).n,0);assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_notifications_v1 WHERE user_id=?',id).first()).n,13);
   checks.push(width+': separate activity log retains skipped alerts; skip-all acknowledges all 13 rather than only the first page');
   await page.locator('[data-city-desk-close]').click();await attack();await poll();assert.equal(await notice.count(),0);
   await clickAndWait(page.locator('[data-city-hide-popups]'),'notice-settings');await poll();await notice.waitFor();await clickAndWait(page.locator('[data-notice-skip-all]'),'ack-all');await notice.waitFor({state:'detached'});
   checks.push(width+': unchecking restores popups and the popup itself offers a working skip-all button');
   const before=(await cityStatus(f.env,f.users.get(id),'MARKET',0,f.now)).mine.cash;
   await page.locator('.jc-service-launch[data-city-desk=services]').click();await page.locator('.jc-megaphone-shop').waitFor();await page.locator('.jc-megaphone-shop').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-megaphone-market.png')});
   await page.locator('[data-city-action=buyMegaphone]').click();await clickAndWait(page.locator('[data-city-confirm]'),'buyMegaphone');
   await page.waitForFunction(()=>document.querySelector('.jc-megaphone-shop span')?.textContent.includes('보유 1개'));
   const bought=(await cityStatus(f.env,f.users.get(id),'MARKET',0,f.now)).mine;assert.equal(bought.cash,before-500);assert.equal(bought.megaphoneCount,1);
   checks.push(width+': real market UI displays custom megaphone art and purchases one for exactly 500 city cash');
   await page.locator('.jc-desk-tabs [data-city-desk=broadcast]').click();const text='모두 시장으로 모여주세요! <img src=x onerror=alert(1)> 함께 출발해요.';
   await page.locator('[data-city-broadcast-text]').fill(text);await page.screenshot({path:path.join(out,width+'-broadcast-composer.png')});await clickAndWait(page.locator('[data-city-send-broadcast]'),'broadcast');await page.locator('.jc-desk').waitFor({state:'detached'});
   await page.locator('.jc-airwave').waitFor();await page.locator('.jc-map-broadcast').scrollIntoViewIfNeeded();assert.equal(await page.locator('.jc-airwave-copy p').textContent(),text);assert.equal(await page.locator('.jc-airwave img').count(),1);await page.screenshot({path:path.join(out,width+'-map-broadcast.png')});
   assert.equal((await cityStatus(f.env,f.users.get(id),'MARKET',0,f.now)).mine.megaphoneCount,0);
   const observer=await makePage(attacker);await observer.locator('.jc-airwave').waitFor();assert.equal(await observer.locator('.jc-airwave-copy p').textContent(),text);assert.equal(await observer.locator('.jc-airwave-copy b').textContent(),f.users.get(id).nickname);
   checks.push(width+': sending consumes one item and both sender/other account see escaped sender/message in the map broadcast animation');
   await attack();await poll();await notice.waitFor();
   f.setTime(cityShift(f.now).endsAt);await clock();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await notice.waitFor({state:'detached'});await page.locator('.jc-airwave').waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('[data-city-action=join]'));
   await poll();assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_players_v1 WHERE active=1').first()).n,0);assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_notifications_v1').first()).n,0);assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_actions_v1').first()).n,0);
   await page.locator('.jc-comms-tools [data-city-desk=logs]').click();await page.locator('.jc-log-empty').waitFor();await page.screenshot({path:path.join(out,width+'-new-round.png')});await page.locator('[data-city-desk-close]').click();
   checks.push(width+': rotation removes visible popup and broadcast, exits every account and deletes prior city history');
   await page.locator('[data-city-action=join]').click();await clickAndWait(page.locator('[data-city-confirm]'),'join');await page.locator('[data-city-action=leave]').waitFor();assert.equal((await cityStatus(f.env,f.users.get(id),'MARKET',0,f.now)).mine.megaphoneCount,0);assert.equal((await cityStatus(f.env,f.users.get(attacker),'MARKET',0,f.now)).mine.active,false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   checks.push(width+': fresh round requires an explicit join; the other account stays out and no old stock or popup returns');
  }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,width+'-failure.json'),JSON.stringify({error:error.stack,errors,requests,body:await page.locator('body').textContent()},null,2));throw error;}
  finally{for(const p of pages)await p.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.status===200));fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,requests,environment:'Chrome desktop/mobile viewports, real city handler and isolated SQLite; real local serverUserId shape; server and client clocks advanced to shift boundary'},null,2));console.log(JSON.stringify({checks:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
