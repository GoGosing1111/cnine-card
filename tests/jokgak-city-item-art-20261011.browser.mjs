import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=process.env.CITY_QA_DIR;
assert.ok(out,'CITY_QA_DIR must point outside the checkout');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],assets=new Set(),requests=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),id=f.roles.POLICE;
  await f.join(id);
  const life=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
  life.wallets.ON.balance=80000;life.hunger=25;life.wellness=45;
  await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(life),cityLifeKey(id)).run();
  await f.p('UPDATE jokgak_city_players_v1 SET health=90 WHERE user_id=?',id).run();
  const actor=f.users.get(id),page=await browser.newPage({viewport:{width,height:960},deviceScaleFactor:width===390?2:1,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/items-v1/')){assets.add(new URL(r.url()).pathname);if(r.status()!==200)errors.push(r.status()+' '+r.url());}});
  try{
   await page.addInitScript(now=>{window.__CITY_TIME__=now;Date.now=()=>window.__CITY_TIME__;},f.now);
   const advance=async()=>{f.advance(5000);await page.evaluate(now=>window.__CITY_TIME__=now,f.now);};
   await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    const response=await handleJokgakCity({path:url.pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(v,status=200)=>Response.json(v,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
    if(req.method()==='POST')requests.push({width,path:url.pathname,status:response?.status});
    await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{items:[],cards:[],enabled:false}});
   });
   await page.route('**/__city-art-qa/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18"><main></main><script>function loadUser(){return '+JSON.stringify(actor)+'};</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
   await page.goto(origin+'/__city-art-qa/',{waitUntil:'domcontentloaded'});
   await page.locator('.jc-dashboard-id strong').filter({hasText:'참가자'}).waitFor();
   await page.evaluate(()=>document.fonts.ready);
   const tab=async name=>{await page.locator('.jc-desk-tabs [data-city-desk="'+name+'"]').click();};
   const close=async()=>{await page.keyboard.press('Escape');await page.locator('.jc-desk').waitFor({state:'detached'});};
   const shot=async(name,codes)=>{
    await page.locator('.jc-desk [data-city-item-art] img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const actual=await page.locator('.jc-desk [data-city-item-art]').evaluateAll(nodes=>nodes.map(n=>n.dataset.cityItemArt));
    for(const code of codes)assert.ok(actual.includes(code),code+' art missing in '+name);
    assert.ok(await page.locator('.jc-desk-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'horizontal overflow in '+name);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow');
    const sizes=await page.locator('.jc-desk [data-city-item-art]').evaluateAll(nodes=>nodes.map(n=>({code:n.dataset.cityItemArt,width:n.offsetWidth,height:n.offsetHeight})));
    for(const size of sizes)assert.ok(size.width>=70&&size.height>=70,'unreadable item size '+JSON.stringify(size));
    assert.ok(await page.locator('.jc-desk [data-city-item-art] img').evaluateAll(imgs=>imgs.every(i=>{const a=i.parentElement.getBoundingClientRect(),b=i.getBoundingClientRect();return b.left>=a.left-1&&b.top>=a.top-1&&b.right<=a.right+1&&b.bottom<=a.bottom+1;})),'art cropped by its display');
    await page.locator('.jc-desk-content').evaluate(n=>n.scrollTop=0);
    await page.locator('.jc-desk').screenshot({path:path.join(out,width+'-'+name+'.png')});
    if(await page.locator('.jc-desk-content').evaluate(n=>n.scrollHeight>n.clientHeight+10)){
     await page.locator('.jc-desk-content').evaluate(n=>n.scrollTop=n.scrollHeight);
     await page.locator('.jc-desk').screenshot({path:path.join(out,width+'-'+name+'-bottom.png')});
    }
    checks.push(width+': '+name+' art decoded, legible, no horizontal overflow');
   };
   const action=async(selector,confirm=false)=>{
    const button=page.locator(selector);await button.scrollIntoViewIfNeeded();await page.waitForFunction(s=>!document.querySelector(s)?.disabled,selector);
    await button.click();
    if(confirm){assert.equal(await page.locator('.jc-dialog [data-city-item-art]').count(),1);await page.locator('[data-city-confirm]').click();}
    await page.waitForFunction(()=>!document.querySelector('.jc [data-city-refresh]')?.disabled);
    if(await page.locator('.jc-dialog[open]').count()){
     assert.equal(await page.locator('.jc-dialog [data-city-item-art]').count(),1);
     await page.locator('.jc-dialog footer [data-city-dialog-close]').click();
    }
   };
   const buy=async(kind,code)=>{
    await action('[data-city-action="'+kind+'"][data-city-product="'+code+'"]',true);
    if(kind==='buyWeapon')await page.locator('.jc-armory [data-city-action="equipWeapon"][data-city-product="'+code+'"]').waitFor();
    await advance();
   };
   await page.locator('.jc-service-launch').click();
   await shot('market',['PIPE','PISTOL','RIFLE']);
   for(const code of ['PIPE','PISTOL','RIFLE'])await buy('buyWeapon',code);
   await tab('inventory');
   await action('.jc-mini-weapons [data-city-action="equipWeapon"][data-city-product="RIFLE"]');
   await page.locator('.jc-mini-weapons .is-equipped').waitFor();
   await shot('weapons',['PIPE','PISTOL','RIFLE']);
   await tab('profile');await shot('equipped',['RIFLE']);await close();await advance();
   const move=async place=>{
    await page.locator('.jc-pin[data-city-place="'+place+'"]').click();
    await action('[data-city-action="move"]');await page.locator('.jc-pin.current[data-city-place="'+place+'"]').waitFor();await advance();
    await page.locator('.jc-service-launch').click();
   };
   await move('SHOP');await shot('shop',['LUNCHBOX','VITAMIN','FIRST_AID']);
   for(const code of ['LUNCHBOX','VITAMIN','FIRST_AID'])await buy('buy',code);
   await tab('inventory');await shot('supplies',['PIPE','PISTOL','RIFLE','LUNCHBOX','VITAMIN','FIRST_AID']);
   let state=await cityStatus(f.env,actor,'SHOP',0,f.now);
   assert.deepEqual(state.mine.bag,{LUNCHBOX:1,VITAMIN:1,FIRST_AID:1});
   for(const code of ['LUNCHBOX','VITAMIN','FIRST_AID']){
    await action('[data-city-action="use"][data-city-product="'+code+'"]');
    await page.locator('.jc-bag [data-city-item-art="'+code+'"]').waitFor({state:'detached'});await advance();
   }
   state=await cityStatus(f.env,actor,'SHOP',0,f.now);
   assert.ok(Object.values(state.mine.bag).every(n=>n===0));assert.equal(state.mine.hunger,60);assert.equal(state.mine.wellness,70);
   await close();await move('RESTAURANT');await shot('restaurant',['SET_MEAL']);
   await action('[data-city-action="eat"]',true);
   assert.equal((await cityStatus(f.env,actor,'RESTAURANT',0,f.now)).mine.hunger,100);
   await advance();await close();await move('HOSPITAL');await shot('hospital',['TREATMENT']);
   await action('[data-city-action="treat"]',true);await advance();
   state=await cityStatus(f.env,actor,'HOSPITAL',0,f.now);
   assert.equal(state.mine.wellness,100);assert.equal(state.mine.health,state.mine.maxHealth);assert.equal(state.mine.weapon.code,'RIFLE');assert.equal(state.mine.cash,42000);
   assert.equal((await f.p('SELECT coin FROM users WHERE id=?',id).first()).coin,123456);
   checks.push(width+': all 3 weapons purchased, rifle equipped; all 3 supplies purchased/used; meal/treatment applied; city cash 42,000 and main coins unchanged');
  }catch(e){
   await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});
   fs.writeFileSync(path.join(out,width+'-failure.json'),JSON.stringify({message:e.message,errors,body:await page.locator('body').textContent()},null,2));throw e;
  }finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.status===200));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,assets:[...assets],requests,accounts:'Isolated in-memory fixtures; no live account mutations'},null,2));
 console.log(JSON.stringify({out,checks:checks.length,errors,assets:assets.size}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
