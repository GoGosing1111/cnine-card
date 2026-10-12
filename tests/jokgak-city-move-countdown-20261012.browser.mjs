import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;
assert(out&&!path.resolve(out).startsWith(path.resolve(root)));fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
try{
  for(const width of [1440,390]){
    const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),id=f.roles.CITIZEN,actor=f.users.get(id),moves=[];
    const policy=JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='jokgak_city_settings_v1'").first()).value);policy.rules.moveCooldownMs=12000;
    await f.p("UPDATE app_meta SET value=? WHERE key='jokgak_city_settings_v1'",JSON.stringify(policy)).run();await f.join(id);await f.action(id,'move',{location:'HOME'});
    const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.addInitScript(now=>{window.__CITY_TIME__=now+120000;window.__CITY_ANCHOR__=performance.now();Date.now=()=>window.__CITY_TIME__+performance.now()-window.__CITY_ANCHOR__;localStorage.setItem('cnine_battle_sound','OFF');},f.now);
      const advance=async ms=>{f.advance(ms);await page.evaluate(now=>{window.__CITY_TIME__=now+120000;window.__CITY_ANCHOR__=performance.now();},f.now);};
      await page.route('**/api/**',async route=>{
        const req=route.request(),url=new URL(req.url());if(url.pathname==='/api/jokgak-city/move')moves.push(req.postDataJSON());
        const response=await handleJokgakCity({path:url.pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(value,status=200)=>Response.json(value,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
        await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[]}});
      });
      await page.route('**/__city-move-qa/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18;color:#eee;font-family:Arial,sans-serif"><main></main><script>window.loadUser=()=>({serverUserId:${id},nickname:${JSON.stringify(actor.nickname)}});</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector('main').innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>`}));
      const button=page.locator('[data-city-action="move"]'),clock=page.locator('[data-city-move-clock]');
      const choose=async location=>{await page.locator(`.jc-pin[data-city-place="${location}"]`).click();await page.locator(`.jc-pin.selected[data-city-place="${location}"]`).waitFor();};
      await page.goto(origin+'/__city-move-qa/',{waitUntil:'domcontentloaded'});await clock.waitFor();assert(await button.isDisabled());assert.match(await button.textContent(),/\d+초 후 이동 가능/);
      await button.evaluate(node=>node.click());assert.equal(moves.length,0);
      await advance(5000);await page.waitForFunction(()=>parseInt(document.querySelector('[data-city-move-label]')?.textContent)<=7);
      assert.match(await clock.textContent(),/다음 이동까지 [67]초/);
      await button.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-button.png')});
      await advance(8000);await page.waitForFunction(()=>!document.querySelector('[data-city-action="move"]').disabled);assert(await clock.isHidden());
      await button.click();await page.locator('.jc-pin.current[data-city-place="MARKET"]').waitFor();await choose('SHOP');assert(await button.isDisabled());
      await advance(12000);await page.waitForFunction(()=>!document.querySelector('[data-city-action="move"]').disabled);
      // Another session renews the server deadline after this page's last read.
      await f.p('UPDATE jokgak_city_players_v1 SET next_move_at=? WHERE user_id=?',f.now+9000,id).run();await button.click();
      const dialogClock=page.locator('[data-city-move-ready-at]');await dialogClock.waitFor();assert.match(await dialogClock.textContent(),/[89]초/);assert(await button.isDisabled());
      await page.screenshot({path:path.join(out,width+'-dialog.png')});
      await advance(5000);await page.waitForFunction(()=>parseInt(document.querySelector('[data-city-move-ready-at]')?.textContent)<=4);assert.match(await dialogClock.textContent(),/[34]초/);
      await advance(4000);await page.waitForFunction(()=>document.querySelector('[data-city-move-ready-at]')?.textContent==='대기 완료');
      await page.locator('.jc-dialog footer [data-city-dialog-close]').click();assert(await button.isEnabled());await button.click();await page.locator('.jc-pin.current[data-city-place="SHOP"]').waitFor();
      assert.equal(moves.length,3);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      checks.push({width,passed:['server clock despite 2-minute device skew','visible seconds','no request while disabled','automatic unlock','server race popup seconds','popup countdown and expiry','movement succeeds after wait','no horizontal overflow']});
    }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});throw error;}
    finally{await page.close();for(const fn of cleanup)await fn();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
