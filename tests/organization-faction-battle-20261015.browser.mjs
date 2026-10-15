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
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.ORGANIZATION_BATTLE_QA_DIR||join(tmpdir(),'cnine-organization-battle-20261015');
test('standalone organization faction loads current V3 resources, plays isolated battle and returns on desktop and mobile',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});t.after(()=>browser.close());await mkdir(out,{recursive:true});
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://'+req.headers.host),requested=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,file=resolve(root,'.'+decodeURIComponent(requested)),rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port,checks=[];
 for(const width of [1440,390]){
  const f=await organizationFactionFixture(t);let strikes=0;
  f.deps.buildFactionBattle=async()=>{const attackerDeck=factionReviewCards.map(c=>({...c,power:900000})),defenderDeck=factionReviewCards.map(c=>({...c,power:10000})),battleV2=createPvpBattleV2({attackerCards:attackerDeck,defenderCards:defenderDeck,seed:491});return {battleV2,attackerDeck,defenderDeck,attackerPower:battleV2.teams.A.summary.power,defenderPower:battleV2.teams.B.summary.power};};
  assert.equal((await f.post('organization/faction/formation',{formation:{attack1:[2,3],attack2:[],defense1:[4,5,6],defense2:[]}})).status,200);
  assert.equal((await f.post('organization/faction/formation',{formation:{attack1:[7,8],attack2:[],defense1:[9,10,11],defense2:[]}},7)).status,200);
  await f.mutateState(s=>Object.assign(s.districts.find(d=>d.id==='11680'),{owner:2,defense:'defense1',protectedUntil:0}));
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>page.close());const errors=[],failedResources=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failedResources.push({status:r.status(),url:r.url()});});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname.endsWith('/strike'))strikes++;if(!url.pathname.startsWith('/api/organization/faction/')){await route.fulfill({json:{enabled:false,visible:false,items:[]}});return;}const result=await f.call(url.pathname.slice(5)+url.search,{method:req.method(),body:req.postDataJSON()||undefined});await route.fulfill({status:result.status,json:result.data});});
  await page.goto(origin+'/organization/faction/?roundId='+f.roundId);await page.locator('[data-fw-zone="11680"]').waitFor();
  if(width===390)await page.locator('[data-fw-district-select]').selectOption('11680');else await page.locator('[data-fw-zone="11680"]').click();
  await page.locator('[data-fw-launch]').click();await page.locator('[data-fw-room-strike]').waitFor();
  const roomSurfaces=await page.locator('.fw-battle-room button').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundImage));assert.ok(roomSurfaces.every(s=>s.includes('/interface-v2/')));await page.screenshot({path:join(out,width+'-room.png')});await page.locator('[data-fw-room-strike]').click();
  try{
   await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics?.().mounted===true,{},{timeout:60000});
   await page.waitForFunction(()=>document.querySelector('.battle-v3-live-shell.is-v3-ready'),{},{timeout:60000});
   const diagnostics=await page.evaluate(()=>({ready:window.ProjectVBattleV3Live.ready(),renderer:window.ProjectVPixiBattle.diagnostics(),scripts:[...document.scripts].map(s=>s.src).filter(s=>/battle-v[23]-live|project-v-pixi-battle/.test(s))}));
   assert.equal(diagnostics.ready,true);assert.equal(diagnostics.scripts.length,3);
   assert.equal(await page.locator('.battle-v3-header strong').innerText(),'조직 세력전');assert.equal(await page.locator('.battle-v3-header small').innerText(),'ORGANIZATION · TERRITORY WAR');
   const cardRects=await page.locator('.battle-v3-roster-frame .card-art img').evaluateAll(images=>images.map(img=>{const r=img.getBoundingClientRect(),f=img.closest('.card-frame').getBoundingClientRect();return {width:r.width,frameWidth:f.width,right:r.right,bottom:r.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight};}));
   assert.equal(cardRects.length,10);for(const r of cardRects){assert.ok(r.width>0&&r.width<=r.frameWidth,'Card artwork fits the scaled roster frame');assert.ok(r.right<=r.viewportWidth+1&&r.bottom<=r.viewportHeight+1,'Card artwork remains inside the viewport');}
assert.equal(strikes,1);await page.screenshot({path:join(out,width+'-battle.png')});
   await page.locator('.fw-battle-close').waitFor({timeout:120000});assert.match(await page.locator('.fw-battle-close').evaluate(el=>getComputedStyle(el).backgroundImage),/action-primary\.webp/);await page.screenshot({path:join(out,width+'-result.png')});await page.locator('.fw-battle-close').click();await page.locator('[data-fw-room-strike]').waitFor();assert.match(await page.locator('[data-fw-room-strike]').evaluate(n=>getComputedStyle(n).backgroundImage),/action-disabled\.webp/);
   assert.equal(await page.locator('#modal canvas').count(),0);assert.equal(strikes,1);assert.match(await page.locator('.fw-notice').innerText(),/공유 HP/);assert.deepEqual(errors,[]);await page.screenshot({path:join(out,width+'-return.png')});
   assert.deepEqual(failedResources.filter(r=>r.url.includes('/interface-v2/')),[]);checks.push({width,strikes,errors,failedResources,diagnostics});
  }catch(error){await page.screenshot({path:join(out,width+'-failure.png'),fullPage:true});await writeFile(join(out,width+'-failure.json'),JSON.stringify({error:error.message,errors,failedResources,notice:await page.locator('.fw-notice').allTextContents(),html:await page.locator('#modal').innerHTML()},null,2));throw error;}
  await page.close();
 }
 await writeFile(join(out,'report.json'),JSON.stringify({checks},null,2));t.diagnostic('Actual current V3 loader QA: '+out);
});
