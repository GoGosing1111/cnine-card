import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {factionReviewCards} from './helpers/clan-faction-fixture.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {organizationPublicOverview} from '../shared/organization-public-v1.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.ORGANIZATION_UI_QA_DIR||join(tmpdir(),'cnine-organization-ui-20261019');
test('headquarters opens a full viewport war room; live map, alpha emblems and combat state remain usable on desktop and mobile',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});t.after(()=>browser.close());await mkdir(out,{recursive:true});
 const f=await organizationFactionFixture(t);
 f.deps.buildFactionBattle=async()=>{const attackerDeck=factionReviewCards.map(c=>({...c,power:900000})),defenderDeck=factionReviewCards.map(c=>({...c,power:10000})),battleV2=createPvpBattleV2({attackerCards:attackerDeck,defenderCards:defenderDeck,seed:491});return {battleV2,attackerDeck,defenderDeck,attackerPower:battleV2.teams.A.summary.power,defenderPower:battleV2.teams.B.summary.power};};
 assert.equal((await f.post('organization/faction/formation',{formation:{attack1:[2,3],attack2:[4],defense1:[5,6],defense2:[]}})).status,200);
 assert.equal((await f.post('organization/faction/formation',{formation:{attack1:[7,8],attack2:[],defense1:[9],defense2:[10,11]}},7)).status,200);
 await f.mutateState(s=>{s.districts.forEach((d,i)=>Object.assign(d,{owner:i%15+1,protectedUntil:0}));Object.assign(s.districts.find(d=>d.id==='11680'),{owner:2,defense:'defense1'});Object.assign(s.districts.find(d=>d.id==='41610'),{owner:2,defense:'defense2'});});
 for(const [districtId,squad] of [['11680','attack1'],['41610','attack2']]){const r=await f.post('organization/faction/launch',{districtId,squad});assert.equal(r.status,200,JSON.stringify(r));assert.ok(r.data.battleId);}
 const snapshot={...organizationPublicOverview(),previewOnly:false,releaseEnabled:true,round:{id:f.roundId,phase:'ASSIGNED',scope:'TEST'},participantCount:10};
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/__shell'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><h1>검수용 게임 셸</h1><iframe title="조직 본부" src="/organization/" style="width:72%;height:800px;border:0"></iframe></body></html>');return;}
  if(url.pathname.startsWith('/api/')){let result;if(url.pathname==='/api/organization/overview')result={status:200,data:snapshot};else if(url.pathname.startsWith('/api/organization/faction/')){let body='';for await(const chunk of req)body+=chunk;result=await f.call(url.pathname.slice(5)+url.search,{method:req.method,body:body?JSON.parse(body):undefined});}else result={status:200,data:{items:[]}};res.writeHead(result.status,{'Content-Type':'application/json'}).end(JSON.stringify(result.data));return;}
  const path=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,file=resolve(root,'.'+decodeURIComponent(path)),rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port,checks=[];
 for(const [width,height] of [[1920,1080],[1366,900],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<721,hasTouch:width<721,serviceWorkers:'block'});t.after(()=>page.close());const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_card_api_token','isolated-review');});
  await page.goto(origin+'/__shell');const headquarters=page.frameLocator('iframe[title="조직 본부"]');await headquarters.locator('[data-tab],.org-empty').first().waitFor({timeout:5000}).catch(async e=>{throw Error(JSON.stringify({text:await headquarters.locator('body').innerText(),errors,failed}));});assert.ok(await headquarters.locator('[data-tab="faction"]').count(),JSON.stringify({text:await headquarters.locator('body').innerText(),errors,failed}));await headquarters.locator('[data-tab="faction"]').first().click();
  const dialog=page.locator('[data-organization-war-window]');await dialog.waitFor();const rect=await dialog.boundingBox();assert.ok(Math.abs(rect.width-width)<2&&Math.abs(rect.height-height)<2,'dedicated window fills the actual game viewport, not the nested iframe');
  const war=page.frameLocator('[data-organization-war-window] iframe');await war.locator('[data-fw-zone="11680"]').waitFor();assert.equal(await war.locator('.fw-zone').count(),46);assert.equal(await war.locator('.fw-map-battle-pin').count(),2);await war.locator('.fw-alert-later').click();
  await war.locator('[data-fw-district-select]').evaluate(select=>{select.value='41610';select.dispatchEvent(new Event('change'));});
  await war.locator('.fw-clash-art').evaluateAll(nodes=>Promise.all(nodes.map(n=>new Promise(resolve=>{const i=new Image();i.onload=resolve;i.onerror=resolve;i.src=n.getAttribute('href');}))));
  await war.locator('body').evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const dimensions=await war.locator('body').evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,map:document.querySelector('.fw-seoul-map').getBoundingClientRect().toJSON(),emblems:[...document.querySelectorAll('svg.fw-mark')].map(i=>({loaded:!!i.querySelector('image'),src:i.querySelector('image')?.getAttribute('href')})),animation:getComputedStyle(document.querySelector('.fw-clash-art')).animationName}));
  assert.equal(dimensions.overflow,false);assert.ok((await war.locator('.fw-map-emblem').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).overflow))).every(v=>v==='hidden'),'each atlas emblem clips to its own complete transparent tile');assert.ok(dimensions.emblems.every(i=>i.loaded&&i.src.includes('faction-v3-20261019')));assert.equal(dimensions.animation,'fw-front-clash');
  await page.screenshot({path:join(out,width+'-war-room.png')});
  if(width<721){await war.locator('.fw-map-scroll').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,width+'-map.png')});await war.locator('[data-fw-show-detail]').click();await war.locator('.fw-detail').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,width+'-detail.png')});}
  await war.locator('[data-fw-front="11680"]').click();assert.match(await war.locator('.fw-detail h2').innerText(),/강남/);assert.equal(await war.locator('.fw-conflict-detail').count(),1);
  await war.locator('.fw-map-battle-pin[data-fw-pick="11680"]').press('Enter');assert.match(await war.locator('.fw-detail h2').innerText(),/강남/);
  await page.screenshot({path:join(out,width+'-seoul-clash.png')});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await war.locator('.fw-clash-art').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  await war.locator('[data-fw-focus="all"]').click();
  if(width>=721){const svg=war.locator('.fw-seoul-map'),box=await svg.boundingBox(),before=await svg.getAttribute('viewBox');await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.4+65,box.y+box.height*.4+35,{steps:8});await page.mouse.up();assert.notEqual(await svg.getAttribute('viewBox'),before);const camera=await svg.getAttribute('viewBox');await war.locator('[data-fw-reload]').click();assert.equal(await svg.getAttribute('viewBox'),camera);}
  if(width===1920){
   await war.locator('.fw-conflict-detail [data-fw-enter]').click();await war.locator('[data-fw-room-strike]').click();
   await war.locator('.battle-v3-live-shell.is-v3-ready').waitFor({timeout:60000});assert.equal(await war.locator('.battle-v3-header strong').innerText(),'조직 세력전');await page.screenshot({path:join(out,'1920-in-window-battle.png')});
   await war.locator('.fw-battle-close').waitFor({timeout:120000});await war.locator('.fw-battle-close').click();await war.locator('[data-fw-room-close]').click();assert.equal(await dialog.count(),1);await war.locator('.fw-map-battle-pin').first().waitFor();
  }
  await war.locator('[data-fw-leave]').click();await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'');
  await headquarters.locator('[data-tab="faction"]').first().click();await war.locator('.fw-map-battle-pin').first().waitFor();await war.locator('[data-fw-leave]').click();assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,height,...dimensions,errors,failed});await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));await page.goto(origin+'/organization/faction/?roundId='+f.roundId);await page.locator('.fw-map-battle-pin').first().waitFor({timeout:5000}).catch(async()=>{throw Error(await page.locator('body').innerText());});await page.locator('.fw-alert-later').click();await f.mutateState(s=>s.battles.forEach(b=>b.status='ENDED'));await page.locator('[data-fw-reload]').click();await page.waitForFunction(()=>!document.querySelector('.fw-map-battle-pin'));assert.match(await page.locator('.fw-active-fronts').innerText(),/없음/);await page.close();
 await writeFile(join(out,'report.json'),JSON.stringify({checks,endedBattleRemoved:true},null,2));t.diagnostic('Screenshots and report: '+out);
});
