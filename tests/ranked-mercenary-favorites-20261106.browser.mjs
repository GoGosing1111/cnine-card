import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {readCommittedAssetSync} from './helpers/sparse-media-fixture.mjs';
import {operatingMercenaries} from './helpers/mercenary-operating-roster-v2144.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {rankedPublicMercenary,rankedSeriesRoster} from '../shared/ranked-series-v1.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.RANKED_QA_DIR,publicBase=process.env.RANKED_QA_PUBLIC_BASE||'';assert(out);fs.mkdirSync(out,{recursive:true});
const {chromium,webkit}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const initial=['V-951','V-996','V-960','V-970','V-980','V-003'];
const mercenaries=[...initial.slice(0,5).map(limitedDeploymentSnapshot),...operatingMercenaries.slice(0,9)].map(rankedPublicMercenary).reverse();
const fixture=JSON.parse(readCommittedAssetSync(path.join(root,'tests/fixtures/v3-completion-payload-20260928.json'),'utf8'));
const regular=fixture.battleV2.teams.A.cards.slice(0,5).map((c,i)=>({id:c.cardId,title:c.title,rarity:['FUR','ZENITH','SUPERSTAR','S','A'][i],image:c.image,image_url:c.image,power:90000,power_type:c.type||'ATTACK'}));assert.equal(regular.length,5);
const makeUser=id=>({pigCoin:0,id,serverUserId:id,nickname:'랭크 편성 검수',role:'USER',coin:100000,owned:regular.map(c=>c.id),quantities:Object.fromEntries(regular.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'},cache=new Map();
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local'),relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html',file=path.resolve(root,relative);assert(file.startsWith(root+path.sep));
 if(publicBase){const key=url.pathname+url.search;if(!cache.has(key))cache.set(key,(async()=>{const r=await fetch(publicBase+key,{signal:AbortSignal.timeout(45000)});return {status:r.status,type:r.headers.get('content-type'),bytes:Buffer.from(await r.arrayBuffer())};})());const r=await cache.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});res.end(r.bytes);return;}
 if(!cache.has(file))cache.set(file,readCommittedAssetSync(file));res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(cache.get(file));
 }catch(_){res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,reports=[];
try{for(const [engine,width]of (publicBase?[[webkit,390]]:[[chromium,1440],[webkit,390],[chromium,320]])){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome',args:['--mute-audio']}:{} )}),page=await browser.newPage({viewport:{width,height:width===1440?1000:844},hasTouch:width<600,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],baselineWarnings=[],posts=[],checks=[];
 let user=makeUser(4242),saved=[...initial],revision=2;
 const check=(value,name)=>{assert(value,name);checks.push(name);},roster=()=>({cards:mercenaries,codes:saved,revision,ready:true,ownedCount:mercenaries.length,mercenariesPerRound:2,rosterSize:6});
 // These exact WebKit shell diagnostics also occur on the deployed pre-change
 // sources (e7791deca), including identical account-switch API cancellations.
 page.on('pageerror',e=>{const known=engine===webkit&&(e.message==='ResizeObserver loop completed with undelivered notifications.'||/^\/127\.0\.0\.1:\d+\/api\/(loot-shop\/balance|account-rank\/status|me\/menu-favorites) due to access control checks\.$/.test(e.message));(known?baselineWarnings:errors).push(e.message);});page.setDefaultTimeout(30000);
 await page.addLocatorHandler(page.locator('.soop-consent-dialog'),async dialog=>{await dialog.locator('[data-soop-close]').first().click();});
 await page.addInitScript(user=>{if(!localStorage.getItem('cnine_card_user_v10'))localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-ranked-preferences-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
  const key=url.pathname.slice(5);if(request.method()!=='GET'){
   if(key!=='pvp/series-roster')return route.fulfill({status:403,json:{error:'Fixture only'}});posts.push({key,body:request.postDataJSON()});
   const body=request.postDataJSON();rankedSeriesRoster(body.codes.map(code=>mercenaries.find(c=>c.code===code)));assert.equal(body.revision,revision);saved=[...body.codes];revision++;
  }
  const data={
   'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:regular},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},
   'pvp/config':{settings:{enabled:true,seasonName:'랭크 편성 검수',tiers:[],startsAt:'2026-01-01 00:00:00',endsAt:'2027-01-01 00:00:00'},rankedSeries:roster(),deck:regular.map(c=>c.id),energy:{enabled:true,unlimited:false,energy:10,maxEnergy:10,costPerBattle:1,rechargeMinutes:5},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈',min:0}},deckRules:{deckSize:5,gradeLimits:{}},battleSettings:{},battleEngine:{active:true,version:'V3',mode:'V3'},serverNow:new Date().toISOString()},
   'pvp/series-roster':{ok:true,rankedSeries:roster()}
  }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};return route.fulfill({status:200,json:data});
 });
 const open=async()=>{await page.waitForLoadState('networkidle');await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>{pvpState.tab='match';renderShell('pvp');});await page.locator('#rsSelect5').waitFor();await page.waitForLoadState('networkidle');};
 try{
  await open();check(await page.locator('[data-rs-select]').count()===6,'six live ranked slots');
  const groups=await page.locator('#rsSelect0 optgroup').evaluateAll(nodes=>nodes.map(n=>n.label.split(' · ')[0]));assert.deepEqual(groups,['SSS','SS','S']);checks.push('descending rank groups');
  const groupOrder=await page.locator('#rsSelect0 optgroup').evaluateAll(nodes=>nodes.map(n=>[...n.children].map(o=>o.textContent.split(' · ').at(-1))));for(const group of groupOrder)assert.deepEqual(group,[...group].sort(new Intl.Collator('ko',{numeric:true,sensitivity:'base'}).compare));checks.push('names sorted inside ranks');
  const identical=await page.locator('#rsSelect0 option').allTextContents();check(['블랙크라운 SS 리미티드 · 나무늘봉순','블러드문 SS 리미티드 · 나무늘봉순','할로윈 SS 리미티드 · 나무늘봉순'].every(s=>identical.includes(s)),'same names retain collection labels');
  await page.locator('#rsFavoriteOnly').click();check((await page.locator('#rsFilterStatus').innerText()).includes('즐겨찾기가 없습니다'),'empty favorites guidance');
  check(await page.locator('#rsSelect0').inputValue()===initial[0],'filter retains selected mercenary');
  await page.locator('#rsFavorite0').click();check(await page.locator('#rsFavorite0').getAttribute('aria-pressed')==='true','favorite on');check(await page.locator('#rsFavorite0').evaluate(e=>e===document.activeElement),'favorite focus restored');
  check(await page.locator('#rsSelect1 optgroup[label="현재 선택"]').count()===1,'nonfavorite current selection pinned');
  await page.locator('#rsFavorite2').focus();await page.keyboard.press('Space');check(await page.locator('#rsFavorite2').getAttribute('aria-pressed')==='true','keyboard adds favorite');
  check(await page.locator('#rsSelect1 option[value="V-951"]').isDisabled(),'favorite duplicate stays disabled');check(posts.length===0,'preferences do not submit roster');
  if(publicBase){await page.locator('#rsGradeFilter').selectOption('SS');await page.locator('.rs-selection-tools').scrollIntoViewIfNeeded();check(await page.locator('#rsSelect0').inputValue()===initial[0],'public filter preserves selected value');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'public mobile no overflow');await page.screenshot({path:path.join(out,`${width}-public.png`)});assert.deepEqual(errors,[]);reports.push({engine:engine.name(),width,checks,errors,baselineWarnings,posts,selected:saved});continue;}
  await page.locator('#rsGradeFilter').selectOption('C');check((await page.locator('#rsFilterStatus').innerText()).includes(`전체 편성 가능 용병 ${mercenaries.length}종`),'empty grade filter shows the recovery list');check(await page.locator('#rsSelect0 option[value]:not([value=""])').count()===mercenaries.length,'every owned alternative is in the slot');check(await page.locator('#rsSelect0').inputValue()===initial[0],'empty grade keeps selected value');
  await page.locator('#rsGradeFilter').selectOption('SS');await page.locator('.rs-selection-tools').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-favorites.png`)});
  await page.locator('#rsFavoriteOnly').click();await page.locator('#rsGradeFilter').selectOption('');
  await open();check(await page.locator('#rsFavorite0').getAttribute('aria-pressed')==='true','favorites survive actual reload');
  user=makeUser(4243);await page.evaluate(u=>localStorage.setItem('cnine_card_user_v10',JSON.stringify(u)),user);await open();check(await page.locator('#rsFavorite0').getAttribute('aria-pressed')==='false','other account has separate favorites');
  user=makeUser(4242);await page.evaluate(u=>localStorage.setItem('cnine_card_user_v10',JSON.stringify(u)),user);await open();check(await page.locator('#rsFavorite0').getAttribute('aria-pressed')==='true','original account favorites restored');
  await page.locator('#rsSelect0').selectOption('V-004');check(await page.locator('#rsSave').isEnabled(),'selection still marks draft dirty');await page.locator('#rsFavorite0').click();check(await page.locator('#rsSave').isEnabled(),'favorite preserves unsaved draft');
  check(await page.locator('#rsSelect1 option[value="V-021"]').isDisabled()===false,'valid SSS partner remains available');
  check(await page.locator('#rsSelect0 option[value="V-021"]').isDisabled(),'same-rank pair rule still enforced');
  await page.locator('[data-rs-round-move="1:0"]').click();await page.locator('#rsSave').click();await page.waitForFunction(()=>!pvpState.rankedSaving&&CNineRankedSeries.ready());assert.deepEqual(saved,['V-960','V-970','V-004','V-996','V-980','V-003']);check(posts.length===1,'only explicit save posts roster');
  check(await page.locator('#rsSave').isDisabled(),'saved draft becomes clean');
  await page.locator('#rsFavorite2').click();check(await page.locator('#rsFavorite2').getAttribute('aria-pressed')==='false','favorite removed');
  await page.locator('.rs-selection-tools').scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('.rs-portrait')].every(i=>i.complete&&i.naturalWidth>0));
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow');check(await page.locator('.rs-console').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'no ranked panel overflow');
  for(const id of ['rsGradeFilter','rsFavoriteOnly','rsFavorite0'])check(await page.locator('#'+id).evaluate(e=>e.getBoundingClientRect().height>=44),id+' touch target');
  await page.locator('.rs-console').screenshot({path:path.join(out,`${width}-ranked.png`)});assert.deepEqual(errors,[]);reports.push({engine:engine.name(),width,checks,errors,baselineWarnings,posts,selected:saved});
 }catch(error){await page.screenshot({path:path.join(out,`${width}-failure.png`),fullPage:true});console.error(JSON.stringify({width,text:(await page.locator('body').innerText()).slice(-900),errors,overflow:await page.locator('.rs-console').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,children:[...e.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>e.getBoundingClientRect().right).map(n=>({tag:n.tagName,class:n.className,id:n.id,width:n.getBoundingClientRect().width}))}))}));throw error;}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({publicBase,reports},null,2));console.log(JSON.stringify({viewports:reports.map(r=>r.width),checks:reports.reduce((n,r)=>n+r.checks.length,0),errors:reports.flatMap(r=>r.errors),output:out}));}
