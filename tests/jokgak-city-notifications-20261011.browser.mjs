import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.CITY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],requests=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),defender=f.roles.CITIZEN,attacker=f.roles.GANG,actor=f.users.get(defender);
  await f.join(defender);await f.join(attacker);
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  let hold=null;
  page.on('pageerror',e=>errors.push(e.message));
  try{
   // Exact production local-user shape: serverUserId exists; id does not.
   await page.addInitScript(({actor,now})=>{
    window.__noticeUser={serverUserId:actor.id,nickname:actor.nickname};window.loadUser=()=>window.__noticeUser;Date.now=()=>now;
    window.__hidden=false;Object.defineProperty(document,'hidden',{get:()=>window.__hidden,configurable:true});
    window.__beats=0;setInterval(()=>window.__beats++,40);
   },{actor,now:f.now});
   await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),body=req.postData();
    const result=await handleJokgakCity({path:url.pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(x,status=200)=>Response.json(x,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body})})});
    if(url.pathname.endsWith('/notifications')&&hold){const gate=hold;hold=null;gate.started();await gate.wait;}
    requests.push({width,path:url.pathname,status:result?.status,body});
    await route.fulfill(result?{status:result.status,body:await result.text(),contentType:'application/json'}:{json:{}});
   });
   await page.route('**/__city-notices-qa/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18"><main></main><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
   const go=async()=>{await page.goto(origin+'/__city-notices-qa/',{waitUntil:'domcontentloaded'});await page.locator('.jc-desk-launchers').waitFor();};
   const poll=()=>page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   const attack=async()=>{
    f.advance(1); // Preserve chronological queue order despite the fixture's fixed clock.
    await f.p('UPDATE jokgak_city_players_v1 SET health=100,next_action_at=0,protected_until=0 WHERE user_id IN (?,?)',attacker,defender).run();
    return f.action(attacker,'attack',{targetId:defender});
   };
   const readAt=async receipt=>(await f.p('SELECT read_at FROM jokgak_city_notifications_v1 WHERE request_id=?',receipt.requestId).first()).read_at;
   const notice=()=>page.locator('.jc-dispatch[role="alertdialog"]');
   const ready=async receipt=>{
    await page.locator('[data-city-notice-id="'+receipt.requestId+':notice"]').waitFor();
    await page.waitForFunction(()=>{const b=document.querySelector('[data-notice-dismiss]');if(!b)return false;const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
    assert.equal(await readAt(receipt),0,'display alone must not acknowledge');
    assert.equal(await notice().getAttribute('aria-modal'),'false');
    assert.ok(await notice().evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
   };
   const dismiss=async receipt=>{
    const ack=page.waitForResponse(r=>r.url().endsWith('/api/jokgak-city/ack'));
    await page.locator('[data-notice-dismiss]').click();await ack;await notice().waitFor({state:'detached'});
    assert.ok(await readAt(receipt)>0);
   };
   await go();await page.locator('.jc-desk-launchers [data-city-desk="inventory"]').click();
   const first=await attack();await poll();await ready(first);
   await page.screenshot({path:path.join(out,width+'-inventory-alert.png')});
   checks.push(width+': production serverUserId-only login polls and shows clickable alert over inventory; remains unread');
   const before=await page.evaluate(()=>window.__beats);
   await page.evaluate(()=>{
    const d=document.createElement('dialog');d.id='notice-overlay';d.style.cssText='background:#142337;color:white;padding:24px;width:70vw;height:55vh';
    d.innerHTML='<h2>다른 콘텐츠</h2><label>진행 중 <input id="keep-focus"></label><button id="close-overlay" style="position:absolute;bottom:24px;left:24px">계속하기</button>';
    d.querySelector('button').onclick=()=>{d.close();d.remove();};document.body.append(d);d.showModal();d.querySelector('input').focus();
   });
   await ready(first);assert.equal(await page.locator('.jc-dispatch').evaluate(n=>n.parentElement.id),'notice-overlay');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'keep-focus');
   await page.locator('#close-overlay').click();await ready(first);
   assert.equal(await notice().evaluate(n=>n.parentElement.classList.contains('jc-desk')),true);
   assert.ok(await page.evaluate(()=>window.__beats)>before);await dismiss(first);
   checks.push(width+': alert follows a newly opened/closed modal without stealing input focus or stopping the running timer');
   await page.keyboard.press('Escape');await page.locator('.jc-desk').waitFor({state:'detached'});
   await page.evaluate(()=>{window.dispatchEvent(new Event('cnine:route-will-change'));document.querySelector('main').innerHTML='<section id="other-content" style="color:white;padding:30px"><h1>진행 중인 다른 콘텐츠</h1><button id="continue-content" style="margin-top:380px">계속 진행</button></section>';window.__clicks=0;document.querySelector('#continue-content').onclick=()=>window.__clicks++;});
   const second=await attack(),third=await attack();await poll();await ready(second);
   await page.locator('#continue-content').click();assert.equal(await page.evaluate(()=>window.__clicks),1);
   await page.screenshot({path:path.join(out,width+'-other-content-alert.png')});
   await dismiss(second);await ready(third);
   await page.locator('[data-notice-record]').click();await page.locator('.jc-dialog').filter({hasText:'방어 패배'}).waitFor();assert.ok(await readAt(third)>0);
   await page.locator('.jc-dialog footer [data-city-dialog-close]').click();
   checks.push(width+': other content stays usable; two real attacks queue in order and acknowledge only on dismiss/record');
   const fourth=await attack();await poll();await ready(fourth);
   await go();await ready(fourth);await dismiss(fourth);
   checks.push(width+': reload restores an unacknowledged attack instead of silently losing it');
   const fifth=await attack();
   let start,release;const started=new Promise(r=>start=r),wait=new Promise(r=>release=r);hold={started:start,wait};
   await poll();await started;await page.evaluate(()=>{window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));});release();
   await page.waitForTimeout(150);assert.equal(await notice().count(),0);assert.equal(await readAt(fifth),0);
   await page.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});await ready(fifth);await dismiss(fifth);
   checks.push(width+': response arriving in background stays unread and appears on foreground return');
   await page.evaluate(()=>{HTMLElement.prototype.showPopover=undefined;});
   await page.locator('.jc-desk-launchers [data-city-desk="inventory"]').click();const sixth=await attack();await poll();await ready(sixth);
   assert.equal(await notice().evaluate(n=>n.classList.contains('is-inline-notice')),true);await dismiss(sixth);
   checks.push(width+': browsers without Popover API show an interactive alert inside the open dialog');
   const seventh=await attack();await poll();await ready(seventh);
   await page.evaluate(()=>{window.__noticeUser=null;window.dispatchEvent(new Event('cnine:player-updated'));});
   await notice().waitFor({state:'detached'});assert.equal(await readAt(seventh),0);
   checks.push(width+': logout removes the old account alert without acknowledging it');
  }catch(error){
   await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,width+'-failure.json'),JSON.stringify({error:error.stack,errors,body:await page.locator('body').textContent()},null,2));throw error;
  }finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.status===200));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,requests,accountModel:'Real local serverUserId shape; actual city handler and isolated SQLite; background visibility transition simulated; other-content timer fixture'},null,2));
 console.log(JSON.stringify({checks:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
