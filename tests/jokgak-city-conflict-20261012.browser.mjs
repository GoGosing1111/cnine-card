import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)});let actor=f.users.get(9);
  const policy=(await readCitySettings(f.env)).policy;policy.cash.theft.enabled=false;policy.roles.forEach(r=>r.regenPerMinute=0);policy.conflict.bounty.selectionPercent=100;
  await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);
  for(const id of [1,2,3,4,5,6,7,8,9])await f.join(id);
  for(const [id,nickname] of [[1,'붉은여우'],[2,'검은항구'],[3,'도시의그림자'],[9,'도시 사냥꾼']]){f.users.get(id).nickname=nickname;await f.p('UPDATE users SET nickname=? WHERE id=?',nickname,id).run();}
  const ready=async(a,b,{winner='A',lethal=true,location='MARKET'}={})=>{
   f.advance(1);await f.p('UPDATE jokgak_city_players_v1 SET location=?,health=100,health_at=?,wanted=2,jailed_until=0,next_action_at=0,next_move_at=0,protected_until=0 WHERE user_id IN (?,?)',location,f.now,a,b).run();
   for(const id of [a,b]){const value=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);value.death=null;value.hospital={enteredAt:0,leaveAt:0,autoReturnAfter:0};value.hunger=value.wellness=100;value.at=f.now;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(value),cityLifeKey(id)).run();}
   if(lethal&&winner!=='DRAW')await f.p('UPDATE jokgak_city_players_v1 SET health=20 WHERE user_id=?',winner==='A'?b:a).run();
   f.deps.prepareCityBattle=async()=>({mode:'PVP',battleV2:{result:{winner}}});
  };
  for(const [id,roll] of [[1,0],[2,.4],[3,.99]]){f.deps.cityBountyRandom=()=>roll;for(const victim of [4,5,6]){await ready(id,victim);await f.action(id,'attack',{targetId:victim});}}
  for(let i=0;i<5;i++){await ready(7,8,{winner:'DRAW',lethal:false,location:'DOCK'});await f.action(7,'attack',{targetId:8});}
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:width===390?'reduce':'no-preference'});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();Date.now=()=>window.__CITY_TIME__+performance.now()-window.__CITY_ANCHOR__;localStorage.setItem('cnine_admin_token','CITY_CONFLICT_FIXTURE_ONLY');},f.now);
   const advance=async ms=>{f.advance(ms);await page.evaluate(now=>{window.__CITY_TIME__=now;window.__CITY_ANCHOR__=performance.now();},f.now);};
   await page.route('**/api/**',async route=>{const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(v,status=200)=>Response.json(v,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[],cards:[]}});});
   await page.route('**/__city-conflict-qa/',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18;color:#eee;font-family:Arial,sans-serif"><main></main><script>window.loadUser=()=>({serverUserId:9,nickname:'도시 사냥꾼'});window.ensureFeatureResources=async()=>{};window.prepareBattleV2LiveLoading=({modal})=>{modal.innerHTML='<div class="battle-v3-header"><strong></strong><small></small></div><div class="qa-battle-host"></div>';return {stage:modal,host:modal.querySelector('.qa-battle-host')}};window.playPvpBattleV2Live=async()=>{};</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector('main').innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>`}));
   const refresh=async()=>{await page.locator('[data-city-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-city-refresh]')?.disabled);};
   const shot=async(name,selector)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator(selector).evaluate(n=>{for(const a of n.getAnimations({subtree:true}))if(a.animationName==='jc-wanted-pass'){a.pause();a.currentTime=1100;}});await page.locator(selector).screenshot({path:path.join(out,width+'-'+name+'.png')});};
   await page.goto(origin+'/__city-conflict-qa/',{waitUntil:'domcontentloaded'});await page.locator('.jc-wanted-ticket').nth(2).waitFor();await page.waitForFunction(()=>document.querySelector('.jc-map-art')?.naturalWidth>0);
   assert.equal(await page.locator('.jc-riot-pin-tag').count(),2);assert.equal(await page.locator('.jc-riot-zones polygon').count(),2);
   assert.deepEqual(await page.locator('.jc-wanted-copy>strong').allTextContents(),['10,000원','5,000원','3,000원']);
   assert.equal(await page.locator('.jc-riot-zones').evaluate(n=>Math.round(n.getBoundingClientRect().width)),await page.locator('.jc-map').evaluate(n=>Math.round(n.getBoundingClientRect().width)));
   assert.equal(await page.locator('.jc-riot-zones polygon').first().evaluate(n=>getComputedStyle(n).animationName),width===390?'none':'jc-riot-border');
   await page.locator('.jc-wanted-notice').waitFor();await shot('map-issued','.jc-map-panel');checks.push(width+': two actual fight hot spots, three wanted amounts, SVG fills map and motion preference respected');
   await f.action(2,'buyMegaphone');await f.action(2,'broadcast',{message:'항구와 시장에 교전이 집중되고 있습니다. 수배 게시판에서 현상금과 현재 위치를 확인해 주세요. '.repeat(2).slice(0,100)});await refresh();await page.locator('.jc-airwave').waitFor();
   const stacked=await page.evaluate(()=>{const a=document.querySelector('.jc-airwave').getBoundingClientRect(),b=document.querySelector('.jc-conflict-ticker').getBoundingClientRect();return a.bottom<=b.top;});assert.ok(stacked);await shot('stacked-notices','.jc-map-stage');checks.push(width+': maximum-length megaphone and bounty banner stack without overlapping');
   for(let i=0;i<3;i++){await advance(8000);await refresh();}
   await page.locator('.jc-wanted-notice').waitFor({state:'detached'});
   await page.locator('.jc-riot-summary [data-city-place="DOCK"]').click();await page.locator('.jc-pin.selected[data-city-place="DOCK"]').waitFor();
   await page.locator('.jc-wanted-ticket').filter({hasText:'붉은여우'}).click();await page.locator('.jc-pin.selected[data-city-place="MARKET"]').waitFor();
   await ready(9,1);await refresh();await page.locator('[data-city-person="1"]').click();await page.locator('.jc-target .jc-bounty-tag.is-large').waitFor();
   assert.match(await page.locator('.jc-target').textContent(),/3,000원/);await page.locator('[data-city-action="attack"]').click();
   await page.locator('.jc-battle-result .jc-bounty-receipt').waitFor();assert.match(await page.locator('.jc-bounty-receipt').textContent(),/붉은여우 현상수배범 사망.*내 현상금 수령 \+3,000원/s);await shot('receipt','.jc-battle-result section');
   await page.locator('.jc-battle-result button').click();await page.locator('.jc-wanted-notice.is-cleared').waitFor();await shot('map-cleared','.jc-map-panel');
   assert.equal((await cityStatus(f.env,actor,'MARKET',0,f.now)).mine.cash,13000);assert.equal(await page.locator('.jc-wanted-ticket').count(),2);checks.push(width+': map/board navigation, selected wanted badge, actual kill API pays city cash and return shows public death banner');
   await advance(8000);await refresh();await page.locator('.jc-wanted-notice').waitFor({state:'detached'});await page.reload();await page.locator('.jc-wanted-ticket').nth(1).waitFor();assert.equal(await page.locator('.jc-wanted-notice').count(),0);checks.push(width+': reload does not repeat issued or completed announcements');
   await page.locator('[data-city-rules]').first().click();assert.match(await page.locator('.jc-dialog').textContent(),/체포와 단순 승리는 지급 대상이 아닙니다/);await page.keyboard.press('Escape');
   await page.locator('[data-city-hide-popups]').check();await page.waitForFunction(()=>!document.querySelector('[data-city-hide-popups]')?.disabled);
   await ready(9,2);await f.action(9,'attack',{targetId:2});await refresh();assert.equal(await page.locator('.jc-wanted-notice').count(),0);assert.equal(await page.locator('.jc-wanted-ticket').count(),1);checks.push(width+': popup preference suppresses new death banner while public warrants and payment remain active');
   await advance(301000);await refresh();assert.equal(await page.locator('.jc-riot-pin-tag').count(),0);checks.push(width+': fight heat expires without old permanent zone effects');
   actor={id:80,nickname:'관리자',role:'OWNER'};await page.route('**/admin/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/jokgak-city-admin-v1.mjs"></script></body>')}));
   await page.goto(origin+'/admin/#jokgak-city',{waitUntil:'domcontentloaded'});await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
   await page.locator('[data-tab="conflict"]').click();await page.locator('[data-path="conflict.bounty.amounts.0"]').fill('3500');await page.locator('[data-path="conflict.riot.minBattles"]').fill('7');await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'저장 완료'}).waitFor();
   assert.equal((await readCitySettings(f.env)).policy.conflict.bounty.amounts[0],3500);assert.equal((await readCitySettings(f.env)).policy.conflict.riot.minBattles,7);await shot('cms','#view-jokgak-city');checks.push(width+': OWNER conflict tab saves thresholds and amounts without changing ON or existing issued amount');
  }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,width+'-failure.json'),JSON.stringify({message:error.message,errors,body:await page.locator('body').textContent()},null,2));throw error;}
  finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,accounts:'isolated fixtures only; actual city HTTP handlers and unchanged main UI; common battle renderer fast-forwarded'},null,2));console.log(JSON.stringify({checks,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
