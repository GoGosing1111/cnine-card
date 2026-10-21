import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {organizationOverview} from '../functions/_organization.js';
const root=fileURLToPath(new URL('..',import.meta.url)),out=join(tmpdir(),'cnine-organization-command-20261021');

test('headquarters, roster, hideout, direct formation, map, rewards and once-per-session start notice on PC/mobile',async t=>{
 const f=await organizationFactionFixture(t,{live:true});
 const formation=Object.fromEntries(['attack','defense'].flatMap(role=>[1,2,3,4,5].map(n=>[role+n,[]])));formation.attack1=[2,3];formation.defense1=[4,5,6];
 assert.equal((await f.post('organization/faction/formation',{formation})).status,200);
 await f.mutateState(s=>s.districts.forEach((d,i)=>{d.owner=i<8?1:i<14?2:0;}));
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/__cms'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/organization-admin-v1.css"><link rel="stylesheet" href="/css/organization-command-20261021.css"><body style="margin:0;background:#080c17"><main class="orgcms" id="review"></main><script type="module">import {mountOrganizationCms} from "/admin/organization-admin-v1.mjs";mountOrganizationCms(document.getElementById("review"),{request:async path=>{const r=await fetch("/api/"+path);return r.json();}});</script></body></html>');return;}
  if(url.pathname==='/__notice'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#080c17"><button id="lobby">검수 로비</button></body></html>');return;}
  if(url.pathname.startsWith('/api/')){
   let body='';for await(const chunk of req)body+=chunk;
   const result=['/api/organization/overview','/api/admin/organization'].includes(url.pathname)?{status:200,data:await organizationOverview(f.env,{id:2,role:url.pathname.includes('/admin/')?'OWNER':'USER',status:'ACTIVE'},{roundId:f.roundId,now:f.clock(),admin:url.pathname.includes('/admin/')})}:await f.call(url.pathname.slice(5)+url.search,{method:req.method,body:body?JSON.parse(body):undefined,user:url.pathname.includes('/admin/')?1:2});
   res.writeHead(result.status,{'Content-Type':'application/json'}).end(JSON.stringify(result.data));return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'),browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());await mkdir(out,{recursive:true});const checks=[];
 for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<721,hasTouch:width<721,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===origin)failed.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-review'));
  await page.goto(origin+'/organization/');await page.locator('.org-directory-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.org-directory-card').count(),6);
  assert.match(await page.locator('.org-live-hero').innerText(),/8\s*곳 이상/);
  assert.match(await page.locator('.org-live-hero').evaluate(n=>getComputedStyle(n).backgroundImage),/command-20261021\/seoul.webp/);
  assert.match(await page.locator('.org-hero-actions .org-primary').evaluate(n=>getComputedStyle(n).borderImageSource),/action-user-approved.webp/);
  assert.match(await page.locator('.org-directory-card').first().evaluate(n=>getComputedStyle(n).borderImageSource),/panel-v3.webp/);
  const check=async(scope,label)=>{assert.equal(await scope.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' horizontal overflow');};
  await check(page,'headquarters');await page.screenshot({path:join(out,width+'-headquarters.png'),fullPage:true});
  await page.locator('.org-nav [data-tab="mine"]').click();await page.locator('.org-member-grid').waitFor();assert.equal(await page.locator('.org-member-slot:not(.is-vacant)').count(),5);await check(page,'roster');await page.screenshot({path:join(out,width+'-roster.png'),fullPage:true});
  await page.locator('.org-nav [data-tab="hideout"]').click();await page.locator('.org-building').waitFor();await page.locator('[data-stage="2"]').click();assert.match(await page.locator('.org-building').getAttribute('src'),/stage-3/);await check(page,'hideout');await page.screenshot({path:join(out,width+'-hideout.png'),fullPage:true});
  await page.locator('.org-hero-actions [data-war-tab="formation"]').click();let fw=page.frameLocator('[data-organization-war-window] iframe');await fw.locator('.fw-squad-card').first().waitFor();assert.equal(await fw.locator('.fw-squad-card').count(),10);assert.equal(await fw.locator('.fw-group-heading').count(),2);await check(fw,'formation');const warUrl=await page.locator('[data-organization-war-window] iframe').getAttribute('src');await fw.locator('[data-fw-leave]').click();await page.locator('[data-organization-war-window]').waitFor({state:'detached'});await page.goto(warUrl);fw=page;await page.locator('.fw-squad-card').first().waitFor();await page.locator('.fw-formation').screenshot({path:join(out,width+'-formation.png')});
  // Read-only UI inspection never changes a live account. These writes use an isolated database.
  await fw.locator('[data-fw-remove="3"]').click();await fw.locator('#fw-assign-squad').selectOption('attack2');await fw.locator('[data-fw-add="3"]').click();await fw.locator('[data-fw-save]').click();await fw.locator('[data-fw-save]:not(:disabled)').waitFor();
  assert.deepEqual((await f.overview()).data.formation.attack2,[3]);
  await fw.locator('[data-fw-tab="map"]').click();await fw.locator('.fw-seoul-map').waitFor();assert.equal(await fw.locator('.fw-zone').count(),25);await check(fw,'map');await fw.locator('.faction-war').screenshot({path:join(out,width+'-map.png')});
  if(width<721)await fw.locator('[data-fw-district-select]').selectOption('11710');else await fw.locator('[data-fw-zone="11710"]').press('Enter');assert.equal(await fw.locator('.fw-detail h2').innerText(),'송파구');
  await fw.locator('.fw-tabs [data-fw-tab="treasury"]').click();assert.match(await fw.locator('.fw-vault').innerText(),/8개 이상/);await check(fw,'reward');await fw.locator('.faction-war').screenshot({path:join(out,width+'-reward.png')});
  await fw.locator('[data-fw-tab="log"]').click();await check(fw,'log');await fw.locator('.faction-war').screenshot({path:join(out,width+'-log.png')});
  await fw.locator('[data-fw-leave]').click();await page.locator('.org-live-hero').waitFor();
  await page.goto(origin+'/__notice');
  const setup=async()=>page.evaluate(async()=>{const m=await import('/js/organization-start-notice-20261021.mjs');window.ctx={userId:2,inLobby:true};window.payload={items:[{kind:'ORGANIZATION_FACTION',phase:'ACTIVE',entityId:'round-1',roundId:'qa',startedAt:new Date(Date.now()-1000).toISOString(),deadlineAt:new Date(Date.now()+3600000).toISOString(),requiredTerritories:8}],offset:0};window.notice=m.createFactionStartNotice({getContext:()=>ctx,onEnter:id=>window.entered=id});notice.update(payload);});
  await setup();await page.locator('.org-start-dialog[open]').waitFor();await page.screenshot({path:join(out,width+'-start-popup.png')});await page.locator('[data-org-start-close]').click();await page.evaluate(()=>notice.update(payload));assert.equal(await page.locator('.org-start-dialog').count(),0);
  await page.reload();await setup();await page.waitForTimeout(100);assert.equal(await page.locator('.org-start-dialog').count(),0,'reload does not repeat the same session');
  await page.evaluate(()=>{payload.items[0].entityId='round-2';ctx.inLobby=false;notice.update(payload);});assert.equal(await page.locator('.org-start-dialog').count(),0);
  await page.evaluate(()=>{ctx.inLobby=true;payload.items[0].phase='PAUSED';notice.update(payload);});assert.equal(await page.locator('.org-start-dialog').count(),0);
  await page.evaluate(()=>{payload.items[0].phase='ACTIVE';notice.update(payload);});await page.locator('.org-start-dialog[open]').waitFor();await page.locator('[data-org-start-enter]').click();assert.equal(await page.evaluate(()=>entered),'qa');
  await page.evaluate(()=>{ctx.userId=3;notice.update(payload);});await page.locator('.org-start-dialog[open]').waitFor();await page.evaluate(()=>{payload.items=[];notice.update(payload);});await page.locator('.org-start-dialog').waitFor({state:'detached'});
  if(width!==320){await page.goto(origin+'/__cms');await page.locator('.orgcms-hero').waitFor();await page.locator('[data-tab="faction"]').click();await page.locator('[data-form="faction-policy"]').waitFor();await check(page,'cms');await page.screenshot({path:join(out,width+'-cms.png'),fullPage:true});}
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,height,pages:['headquarters','roster','hideout','formation','map','reward','log','start-popup'],errors,failed});await page.close();
  // Restore fixture lineup before testing the next viewport.
  assert.equal((await f.post('organization/faction/formation',{formation})).status,200);
 }
 await writeFile(join(out,'checks.json'),JSON.stringify(checks,null,2));t.diagnostic(out);
});
