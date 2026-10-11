import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
import {readCitySettings} from '../functions/_jokgak_city_settings.js';
import {prepareCityBattle} from '../functions/_jokgak_city_battle.js';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),id=f.roles.CITIZEN,police=f.roles.POLICE,enemy=f.roles.GANG;
  const policy=(await readCitySettings(f.env)).policy;policy.career.enabled=true;policy.career.startedAt=f.now;
  for(const [location,code] of [['MARKET','PIPE'],['HOME','JACKET']]){const a=policy.exploration.areas.find(a=>a.location===location);a.emptyWeight=0;a.drops.forEach(d=>d.weight=d.code===code?1:0);}
  await f.p("UPDATE app_meta SET value=? WHERE key='jokgak_city_settings_v1'",JSON.stringify(policy)).run();
  for(const n of [id,police,enemy])await f.join(n,'MARKET');
  let actor=f.users.get(id);
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();Date.now=()=>window.__CITY_TIME__+performance.now()-window.__CITY_ANCHOR__;localStorage.setItem('cnine_admin_token','CITY_EXPLORATION_FIXTURE_ONLY');localStorage.setItem('cnine_battle_sound','OFF');},f.now);
   const advance=async ms=>{f.advance(ms);await page.evaluate(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();},f.now);};
   await page.route('**/api/**',async route=>{
    const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(v,status=200)=>Response.json(v,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
    await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[],cards:[]}});
   });
   await page.route('**/__city-exploration-qa/',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18;color:#eee;font-family:Arial,sans-serif"><main></main><script>window.loadUser=()=>({serverUserId:${actor.id},nickname:${JSON.stringify(actor.nickname)}});</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector('main').innerHTML=JokgakCity.view();JokgakCity.bind();</script><script type="module" src="/preview/jokgak-city-v1/battle-loader.js"></script></body></html>`}));
   const go=async()=>{await page.goto(origin+'/__city-exploration-qa/',{waitUntil:'domcontentloaded'});await page.locator('.jc-desk-launchers').waitFor();};
   const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,width+'-'+name+'.png'),fullPage:true});};
   const closeDesk=async()=>{await page.locator('[data-city-desk-close]').click();await page.locator('.jc-desk').waitFor({state:'detached'});};
   const move=async location=>{await page.locator('.jc-pin[data-city-place="'+location+'"]').click();await page.locator('.jc-pin.selected[data-city-place="'+location+'"]').waitFor();await page.locator('[data-city-action="move"]').click();await page.locator('.jc-pin.current[data-city-place="'+location+'"]').waitFor();};
   await go();await page.locator('.jc-explore').waitFor();await shot('map');
   await page.locator('[data-city-action="explore"]').click();await page.locator('.jc-loot-result h3').filter({hasText:'쇠파이프'}).waitFor();await shot('loot');
   await page.locator('[data-city-loot-inventory]').click();await page.locator('[data-city-action="equipWeapon"][data-city-product="PIPE"]').click();await page.locator('.jc-mini-weapons .is-equipped').waitFor();await closeDesk();
   await move('HOME');await advance(60000);await page.waitForFunction(()=>!document.querySelector('[data-city-action="explore"]')?.disabled);
   await page.locator('[data-city-action="explore"]').click();await page.locator('.jc-loot-result h3').filter({hasText:'가죽 재킷'}).waitFor();await page.locator('[data-city-loot-inventory]').click();await page.locator('[data-city-action="equipArmor"][data-city-product="JACKET"]').click();await page.locator('.jc-armor-inventory .is-equipped').waitFor();
   assert.equal((await cityStatus(f.env,actor,'HOME',0,f.now)).mine.cityPower,220000);
   await shot('inventory');await closeDesk();checks.push(width+': current-location exploration, saved loot reveal, weapon and armor equip');
   // Populate the same isolated inventory to inspect the expanded grid's long names.
   let l=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
   l.armory.ON.owned=['PIPE','KNIFE','CROSSBOW','SMG','SNIPER'];l.exploration.ON.ownedArmor=['JACKET','KEVLAR','PLATE'];
   await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();await page.locator('[data-city-refresh]').click();
   await page.locator('.jc-desk-launchers [data-city-desk="inventory"]').click();await page.locator('.jc-mini-weapons article').nth(7).waitFor();assert.ok(await page.locator('.jc-desk-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await shot('equipment-grid');await closeDesk();
   // Exercise actual common battle rendering with the new server-normalized team.
   if(width===1440&&!process.env.CITY_QA_SKIP_BATTLE){
    const seed=JSON.parse(fs.readFileSync(path.join(root,'preview/jokgak-city-v1/battle-fixture.json'),'utf8'));
    f.deps.pvpDeckSnapshot=async()=>seed.attackerCards;f.deps.prepareCityBattle=prepareCityBattle;
    await f.p("UPDATE jokgak_city_players_v1 SET location='HOME',next_action_at=0,protected_until=0 WHERE user_id=?",enemy).run();await page.locator('[data-city-refresh]').click();await page.locator('[data-city-person="'+enemy+'"]').click();await page.locator('[data-city-action="attack"]').click();
    await page.locator('.battle-v3-live-shell.is-v3-ready').waitFor({timeout:60000});await shot('battle');
    await page.locator('.jc-battle-result').waitFor({timeout:120000});await page.locator('.jc-battle-result button').click();checks.push('actual V3 city battle played through to the persisted result');
   }
   // Ordinary, offline-style stay expiry produces a destination popup and survives reload.
   l=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);l.hospital={enteredAt:f.now-180000,leaveAt:f.now,autoReturnAfter:0};l.death=null;
   await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();await f.p("UPDATE jokgak_city_players_v1 SET location='HOSPITAL',health=100,next_action_at=0 WHERE user_id=?",id).run();await go();
   await page.locator('[aria-label="병원 자동 이동 안내"]').waitFor();assert.match(await page.locator('[aria-label="병원 자동 이동 안내"] p').textContent(),/자동 배치/);await shot('hospital-popup');await page.locator('[data-notice-dismiss]').click();await go();assert.equal(await page.locator('[aria-label="병원 자동 이동 안내"]').count(),0);checks.push(width+': hospital relocation popup fits and is not repeated after dismissal/reload');
   actor=f.users.get(police);l=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(police)).first()).value);l.careers.ON.merit=8;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(police)).run();await go();await page.locator('.jc-desk-launchers [data-city-desk="police"]').click();await page.locator('.jc-police-header').filter({hasText:'경사'}).waitFor();assert.match(await page.locator('.jc-rank-ladder').textContent(),/전투력 \+10%/);await shot('police-promotion');await closeDesk();
   actor={id:80,nickname:'관리자',role:'OWNER'};
   await page.route('**/admin/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/jokgak-city-admin-v1.mjs"></script></body>')}));
   await page.goto(origin+'/admin/#jokgak-city',{waitUntil:'domcontentloaded'});await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
   await page.locator('[data-tab="exploration"]').click();await page.locator('.city-cms-search-areas').waitFor();assert.equal(await page.locator('.city-cms-gear-grid article').count(),13);assert.equal(await page.locator('.city-cms-search-areas article').count(),9);
   const field=p=>page.locator('[data-path="'+p+'"]');
   await field('exploration.cooldownMs').fill('90');await field('exploration.armors.0.power').fill('25000');await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'저장 완료'}).waitFor();await shot('cms-exploration');
   await page.locator('[data-tab="career"]').click();await field('career.police.ranks.1.powerPercent').fill('6');await field('career.police.ranks.1.incomePercent').fill('12');await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'저장 완료'}).waitFor();await field('career.police.ranks.1.powerPercent').scrollIntoViewIfNeeded();await shot('cms-police');
   const saved=(await readCitySettings(f.env)).policy;assert.equal(saved.exploration.cooldownMs,90000);assert.equal(saved.exploration.armors[0].power,25000);assert.equal(saved.career.police.ranks[1].powerPercent,6);assert.equal(saved.mode,'ON');checks.push(width+': CMS exploration, area weights, gear power and police benefits save without changing mode');
  }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,width+'-failure.json'),JSON.stringify({message:error.message,errors,body:await page.locator('body').textContent()},null,2));throw error;}
  finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,accounts:'isolated fixtures only'},null,2));console.log(JSON.stringify({checks,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
