import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {readCommittedAssetSync} from './helpers/committed-asset-read.mjs';
import {rankedFixture} from './helpers/ranked-series-fixture.mjs';
import {readRankedRosters,saveRankedRoster,rankedTicketPreview} from '../functions/_ranked_series.js';
const root=process.cwd(),out=process.env.QA_OUT;assert(out);fs.mkdirSync(out,{recursive:true});
const before=process.env.QA_BEFORE==='1',publicBase=process.env.QA_PUBLIC_BASE||'',all=['V-059','V-701','V-702','V-703','V-704','V-705','V-976','V-967','V-044','V-951','V-960','V-980'],savedInitial=['V-059','V-701','V-976','V-702','V-967','V-703'];
const cleanups=[],f=await rankedFixture({after(fn){cleanups.push(fn);}},true,{codes:all,ranks:all.map(code=>['V-059','V-976','V-967'].includes(code)?'SSS':'SS')});
for(const id of [1,2])await saveRankedRoster(f.env,{id},{codes:savedInitial,revision:0});
const read=async()=>{const start=performance.now(),sql=f.queries.length,value=(await readRankedRosters(f.env,[1])).get(1);return {ms:performance.now()-start,sql:f.queries.length-sql,value};};
const service=[await read(),await read()],roster=()=>readRankedRosters(f.env,[1]).then(m=>m.get(1));
const fixture=JSON.parse(readCommittedAssetSync(path.join(root,'tests/fixtures/v3-completion-payload-20260928.json'))),cards=fixture.battleV2.teams.A.cards.slice(0,5).map((c,i)=>({id:c.cardId,title:c.title,rarity:['FUR','ZENITH','SUPERSTAR','S','A'][i],image:c.image,power:90000,power_type:c.type||'ATTACK'}));
const user={id:1,serverUserId:1,nickname:'블루기어 구분 검수',role:'USER',coin:100,pigCoin:0,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'},cache=new Map();
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local'),rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),file=path.resolve(root,rel);assert(file.startsWith(root+path.sep));
 if(publicBase){const key=url.pathname+url.search;if(!cache.has(key))cache.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),bytes:Buffer.from(await r.arrayBuffer())};})());const r=await cache.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});res.end(r.bytes);return;}
 if(!cache.has(file))cache.set(file,readCommittedAssetSync(file));res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(cache.get(file));
 }catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,reports=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{for(const width of (process.env.QA_WIDTHS||'1440,390').split(',').map(Number)){
 const page=await browser.newPage({viewport:{width,height:width<600?844:960},hasTouch:width<600,isMobile:width<600,serviceWorkers:'block'}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addLocatorHandler(page.locator('.soop-consent-dialog'),async dialog=>dialog.locator('[data-soop-close]').first().click());
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','isolated-label-review');localStorage.setItem('soop-lobby-bgm-muted-v1','1');localStorage.setItem('cnine_ranked_mercenary_preferences_v1:1',JSON.stringify({favorites:['V-701']}));},user);
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();const key=url.pathname.slice(5);requests.push(key);
  const data=key==='pvp/config'?{settings:{enabled:true,seasonName:'표시 검수',tiers:[],startsAt:'2026-01-01 00:00:00',endsAt:'2027-01-01 00:00:00'},rankedSeries:await roster(),deck:cards.map(c=>c.id),energy:{unlimited:true,energy:10,maxEnergy:10,costPerBattle:1},profile:{season_score:1000,tier:{name:'브론즈'}},deckRules:{deckSize:5,gradeLimits:{}},battleEngine:{active:true,version:'V3'},serverNow:new Date().toISOString()}:
   key==='pvp/series-roster'?{ok:true,rankedSeries:await saveRankedRoster(f.env,{id:1},route.request().postDataJSON())}:
   ({'service/status':{maintenance:{active:false}},me:{user},'me/summary':{user,prison:{incarcerated:false}},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}}}[key]||{enabled:false,visible:false,items:[],cards:[],loadouts:[],settings:{}});
  return route.fulfill({status:200,json:data});});
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');
 for(let visit=0;visit<2;visit++){
  const begin=performance.now();await page.evaluate(()=>{window.qaFrames=[];let last=performance.now();function tick(t){qaFrames.push(t-last);last=t;window.qaRaf=requestAnimationFrame(tick);}window.qaRaf=requestAnimationFrame(tick);pvpState.tab='match';renderShell('pvp');});await page.locator('#rsSelect5').waitFor();
  const readyMs=performance.now()-begin,labels=await page.locator('#rsSelect0 option').evaluateAll(rows=>Object.fromEntries(rows.filter(e=>e.value).map(e=>[e.value,e.textContent])));
  assert.equal(labels['V-044'],'SS · 하이희야');assert.equal(labels['V-701'],before?'★ SS · 하이희야':'★ 블루기어 SS 리미티드 · 하이희야');
  if(!before){for(const code of all.slice(1,6))assert(labels[code].includes('블루기어 SS 리미티드'));for(const code of ['V-976','V-967'])assert(labels[code].startsWith('블루기어 SSS 리미티드'));assert(labels['V-059'].startsWith('블루기어 SSS ·'));}
  assert.equal(await page.locator('#rsSelect0 option[value="V-976"]').isDisabled(),true);assert.equal(await page.locator('#rsSelect1 option[value="V-044"]').isDisabled(),false);
  await page.locator('#rsFavoriteOnly').click();assert.equal(await page.locator('#rsSelect1').inputValue(),'V-701');await page.locator('#rsFavoriteOnly').click();
  await page.locator('#rsSelect1').selectOption('V-044');await page.locator('#rsSave').click();await page.waitForFunction(()=>!pvpState.rankedSaving&&CNineRankedSeries.ready());assert((await roster()).codes.includes('V-044'));
  await page.locator('#rsSelect1').selectOption('V-701');await page.locator('#rsSave').click();await page.waitForFunction(()=>!pvpState.rankedSaving&&CNineRankedSeries.ready());
  const identities=await page.locator('.rs-slot>.rs-identity').allTextContents();if(!before)assert.equal(identities[1],'블루기어 SS 리미티드');
  await page.locator('.rs-round').first().scrollIntoViewIfNeeded();await page.locator('.rs-round').first().screenshot({path:path.join(out,width+'-'+visit+'-formation.png')});
  const ticket=await f.createTicket('labels-'+width+'-'+visit),preview=await rankedTicketPreview(f.env,ticket);assert.equal(preview.opponentOrderHidden,true);assert.deepEqual(preview.opponent.map(c=>c.code),[...savedInitial].sort());
  await page.evaluate(series=>{window.qaPreview=CNineRankedSeries.preview({opponent:{nickname:'구분 검수 상대'},series});},preview);await page.locator('.rs-match-reveal').waitFor();if(!before)assert.equal(await page.locator('.rs-opponent-roster article[aria-label="블루기어 SS 리미티드 · 하이희야"]').count(),1);
  assert.equal(await page.locator('.rs-match-reveal').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:path.join(out,width+'-'+visit+'-opponent.png')});await page.locator('#rsBegin').click();await page.evaluate(()=>qaPreview);await f.q('UPDATE pvp_ranked_match_tickets_v1671 SET used_at=CURRENT_TIMESTAMP WHERE token=?',ticket.token).run();
  const frames=await page.evaluate(()=>{cancelAnimationFrame(qaRaf);const x=qaFrames.slice(2).sort((a,b)=>a-b);return {p50:x[Math.floor(x.length*.5)],p95:x[Math.floor(x.length*.95)],max:x.at(-1),over50:x.filter(x=>x>50).length};});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.evaluate(()=>renderShell('lobby'));const count=requests.filter(k=>k==='pvp/config').length;await page.waitForTimeout(1200);const exit={extraConfigReads:requests.filter(k=>k==='pvp/config').length-count,canvases:await page.locator('canvas').count(),preview:await page.locator('.rs-match-reveal').count()};assert.equal(exit.extraConfigReads,0);assert.equal(exit.preview,0);
  reports.push({width,visit,readyMs,labels,identities,frames,exit});console.log(JSON.stringify({width,visit,readyMs,exit}));
 }
 assert.deepEqual(errors,[]);await page.close();
}}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));for(const fn of cleanups)await fn();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:reports.length===4?'PASSED':'PARTIAL',before,publicBase,environment:'Windows Chrome headless; PC/mobile touch emulation; isolated PGlite API; no production account writes',service:service.map(({ms,sql})=>({ms,sql})),reports},null,2));}
