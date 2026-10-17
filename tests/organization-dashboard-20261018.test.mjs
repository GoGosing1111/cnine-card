import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationStandings,organizationDashboardView} from '../js/organization-dashboard-v1.mjs';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {organizationOverview} from '../functions/_organization.js';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.ORG_DASHBOARD_QA_DIR||join(tmpdir(),'cnine-organization-dashboard-20261018');

test('directory distinguishes unavailable holdings/funds from zero and ignores another round',()=>{
 const state={round:{id:'current'},organizations:[{id:1,name:'도끼파',memberCount:8,hideout:{stage:1,name:'시작 거점'}}]};
 assert.equal(organizationStandings(state).rows[0].funds,null);
 assert.equal(organizationStandings(state).rows[0].territories,null);
 state.faction={roundId:'old',districts:[{id:'11680',owner:1}],organizations:[{id:1,funds:5000}]};
 assert.equal(organizationStandings(state).occupied,null);
 state.faction={...state.faction,roundId:'current',districts:[],organizations:[{id:1,funds:0}]};
 assert.equal(organizationStandings(state).occupied,0);assert.equal(organizationStandings(state).rows[0].funds,0);
 state.organizations[0].name='<img src=x onerror=alert(1)>';
 assert.ok(!organizationDashboardView(state).includes('<img src=x'));
});

test('assigned directory and nested faction map stay usable and stable on desktop/mobile without automatic click zoom',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 // Keep real scrollbars enabled: hiding them masks embedded layout regressions.
 const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});t.after(()=>browser.close());
 const f=await organizationFactionFixture(t,{live:true});
 await f.mutateState(s=>s.districts.forEach((d,i)=>{d.owner=i<6?1:i<10?2:0;}));
 await f.pg.query('INSERT INTO organization_faction_treasury_v1(round_id,organization_id,balance) VALUES($1,1,1234567890) ON CONFLICT(round_id,organization_id) DO UPDATE SET balance=1234567890',[f.roundId]);
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/host'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/organization-preparation-v1.css"><style>body{margin:0;background:#080f12}#clanRoot{max-width:1380px;margin:auto}</style><main id="clanRoot"></main><script src="/js/organization-preparation-v1.js"></script><script>document.querySelector("#clanRoot").innerHTML=OrganizationPreparation.render();OrganizationPreparation.bind(document.querySelector("#clanRoot"));</script>');return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;await mkdir(out,{recursive:true});const audit=[];
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:950},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>page.close());
  let userId=1,unavailable=false;const errors=[],badAssets=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/assets/ui/organization/'))badAssets.push(r.url());});
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','isolated-qa');window.heightMessages=[];addEventListener('message',e=>{if(e.data?.type?.includes('height'))heightMessages.push(e.data)});});
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url());requests.push(request.method()+' '+url.pathname);assert.equal(request.method(),'GET','directory/map inspection never writes game data');
   const result=url.pathname==='/api/organization/overview'?{status:200,data:await organizationOverview(f.env,{id:userId,role:userId===1?'OWNER':'USER',status:'ACTIVE'},{roundId:f.roundId,now:f.clock()})}:unavailable?{status:503,data:{error:'Temporary test outage'}}:await f.call(url.pathname.slice(5)+'?roundId='+f.roundId,{user:userId});
   await route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.data)});
  });
  await page.goto(origin+'/host');const org=page.frameLocator('.org-live-frame');
  await org.locator('.org-directory-card').first().waitFor();assert.equal(await org.locator('.org-directory-card').count(),15);
  assert.equal(await org.locator('.org-nav [data-tab="overview"]').getAttribute('aria-current'),'page','a nonmember also lands on the directory');
  assert.equal(await org.locator('[data-tab="survey"],.admission-closed,.org-recruitment,.org-hero-v1').count(),0);
  assert.equal(await org.locator('.org-directory-card.is-mine').count(),0);
  assert.match(await org.locator('.org-directory-totals').innerText(),/10\s*\/ 46/);
  await org.locator('.org-nav [data-tab="mine"]').click();assert.match(await org.locator('.org-empty').innerText(),/현재 소속된 조직이 없습니다/);
  userId=2;await page.reload();await org.locator('.org-directory-card.is-mine').waitFor();
  const own=org.locator('[data-org-id="1"]');assert.match(await own.innerText(),/1,234,567,890/);assert.match(await own.innerText(),/내 조직 · 5 \/ 10명/);
  await own.locator('summary').click();assert.match(await own.locator('details p').innerText(),/종로구/);
  const surfaces=await org.locator('button,summary').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({text:n.textContent.trim(),image:getComputedStyle(n).backgroundImage})));
  assert.ok(surfaces.every(n=>n.image.includes('/interface-v2/')));
  assert.match(await org.locator('.org-live-hero').evaluate(n=>getComputedStyle(n).backgroundImage),/headquarters-status-v1.webp/);
  assert.equal(await org.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const overlap=await own.locator('header').evaluate(header=>{const button=header.querySelector('button').getBoundingClientRect();return [...header.querySelectorAll('.org-kicker,h3,p')].some(n=>{const r=n.getBoundingClientRect();return Math.min(r.right,button.right)>Math.max(r.left,button.left)&&Math.min(r.bottom,button.bottom)>Math.max(r.top,button.top)});});assert.equal(overlap,false,'own-organization button does not cover the crest label or name');
  await page.screenshot({path:join(out,width+'-directory.png'),fullPage:true});
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,width+'-directory-fold.png')});
  await own.locator('summary').click();
  await org.locator('.org-directory-mine').click();await org.locator('.org-member-grid').waitFor();assert.equal(await org.locator('.org-member-slot:not(.is-vacant)').count(),5);
  await org.locator('.org-nav [data-tab="overview"]').click();
  unavailable=true;await org.locator('[data-org-refresh]').click();await org.locator('.org-directory-warning').waitFor();
  assert.equal(await org.locator('[data-org-id="1"] .org-directory-metrics dd').nth(1).innerText(),'—');
  unavailable=false;await org.locator('[data-org-refresh]').click();await org.locator('.org-directory-warning').waitFor({state:'detached'});
  await org.locator('.org-nav [data-tab="faction"]').click();const fw=org.frameLocator('.org-faction-frame');await fw.locator('.fw-seoul-map').waitFor();
  assert.equal(await fw.locator('.fw-seoul-map [data-fw-focus]').count(),0,'map labels do not act as automatic zoom shortcuts');
  const camera=await fw.locator('.fw-seoul-map').getAttribute('viewBox');
  if(width===390)await fw.locator('[data-fw-district-select]').selectOption('41110');else await fw.locator('[data-fw-zone="41110"]').click();
  assert.equal(await fw.locator('.fw-detail h2').innerText(),'수원시');assert.equal(await fw.locator('.fw-seoul-map').getAttribute('viewBox'),camera,'selection does not zoom or pan');
  await fw.locator('[data-fw-focus="selected"]').click();assert.notEqual(await fw.locator('.fw-seoul-map').getAttribute('viewBox'),camera,'explicit selected-region zoom still works');
  await fw.locator('[data-fw-focus="all"]').click();
  const sizes=[];
  for(const nextWidth of width===1440?[1440,1280,1120,1001,1440]:[390,430,390]){
   await page.setViewportSize({width:nextWidth,height:950});await page.waitForTimeout(180);
   const samples=await fw.locator('.fw-seoul-map').evaluate(async svg=>{
    const values=[];for(let i=0;i<18;i++){await new Promise(requestAnimationFrame);values.push({height:innerHeight,width:document.documentElement.clientWidth,viewportWidth:innerWidth,content:document.querySelector('.fw-root').getBoundingClientRect().bottom+scrollY,mapWidth:svg.getBoundingClientRect().width,camera:svg.getAttribute('viewBox')});}return values;
   });
   assert.equal(new Set(samples.map(s=>s.height+':'+s.width+':'+s.mapWidth)).size,1,'layout converges without repeated height/width updates');
   assert.ok(samples.every(s=>s.width===s.viewportWidth&&s.height>=s.content),'embedded map has no width-changing vertical scrollbar or clipped bottom');
   assert.ok(samples.every(s=>s.camera===camera));sizes.push({width:nextWidth,sample:samples[0]});
  }
  await fw.locator('.fw-seoul-map').scrollIntoViewIfNeeded();const sameNode=await fw.locator('.fw-seoul-map').elementHandle();
  const msgCount=await org.locator('body').evaluate(()=>heightMessages.length);
  await page.waitForTimeout(8200);assert.equal(await sameNode.evaluate(n=>n.isConnected),true,'automatic poll preserves the map node');
  assert.equal(await org.locator('body').evaluate(()=>heightMessages.length),msgCount,'idle polling does not start a resize cycle');
  await page.screenshot({path:join(out,width+'-embedded-map.png'),fullPage:true});
  await fw.locator('[data-fw-tab="log"]').click();await page.waitForTimeout(150);const smallHeight=await org.locator('.org-faction-frame').evaluate(n=>n.clientHeight);
  await fw.locator('[data-fw-tab="map"]').click();await page.waitForTimeout(150);assert.ok(await org.locator('.org-faction-frame').evaluate(n=>n.clientHeight)>smallHeight,'frame can shrink and grow with content');
  assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);audit.push({width,surfaces,sizes,requests});await page.close();
 }
 await writeFile(join(out,'audit.json'),JSON.stringify(audit,null,2));t.diagnostic('Screenshots and layout audit: '+out);
});
