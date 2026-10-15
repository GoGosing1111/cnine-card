import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationPublicApi,organizationPublicOverview} from '../shared/organization-public-v1.mjs';
import {ORGANIZATION_INTERVIEW,ORGANIZATION_INTERVIEW_VERSION} from '../shared/organization-interview-v1.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=process.env.ORG_QA_DIR||join(tmpdir(),'cnine-organization-public-20261015');
test('anonymous public entry requires account login and never fabricates participants or accepts enrollment',async t=>{
 const beforeLocal=globalThis.localStorage,beforeSession=globalThis.sessionStorage;
 globalThis.localStorage={getItem:()=>null};globalThis.sessionStorage={getItem:()=>null};
 t.after(()=>{if(beforeLocal===undefined)delete globalThis.localStorage;else globalThis.localStorage=beforeLocal;if(beforeSession===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=beforeSession;});
 const {organizationApi}=await import('../js/organization-api-v1.mjs');
 const s=await organizationApi('organization/overview');
 assert.equal(s.loginRequired,true);assert.equal(s.previewOnly,false);assert.equal(s.releaseEnabled,true);assert.equal(s.admissionEnabled,false);assert.equal(s.round,null);
 assert.equal(s.membership,null);assert.equal(s.participantCount,null);assert.equal(s.policy.pointsPerRegion,null);assert.equal(s.organizations.length,15);
 for(const path of ['organization/survey','organization/withdraw','admin/organization','admin/organization/create','admin/organization/apply'])
  for(const method of ['GET','POST'])await assert.rejects(organizationApi(path,{method}),{code:'ORG_AUTH'});
 s.policy.hideoutThresholds[1]=100;assert.equal(organizationPublicOverview().policy.hideoutThresholds[1],null);
 const entry=await readFile(join(root,'functions/api/[[path]].js'),'utf8');assert.match(entry,/handleOrganization,reconcileOrganizationRecruitment,organizationLiveOperation/);
});
test('anonymous login gate ignores old drafts; background clan refresh preserves the document, stage, focus and scroll on PC/mobile',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 await mkdir(output,{recursive:true});
 const harness='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/organization-preparation-v1.css"><style>body{margin:0;background:#090f19}main{max-width:1280px;margin:auto}</style><main><div id="clanRoot"></div></main><script src="/js/organization-preparation-v1.js"></script><script src="/js/clan-v1.js"></script><script>window.overviewRequests=0;window.overview={season:{phase:"COMPLETE"},organizationPreparation:{legacyClosed:true},champions:{status:"COMPLETED",seeds:[],matches:[],rewardStatus:"SENT",rewards:[]}};ClanV1.bind({apiRequest:async()=>{window.overviewRequests++;if(window.failNextOverview){window.failNextOverview=false;throw Error("Temporary refresh failure")}return structuredClone(window.overview)}});</script></html>';
 const server=createServer(async(req,res)=>{try{
  const requested=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(requested==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(harness);return;}
  // Only legacy feature modules are stubbed. The shipped ClanV1 polling/render path is real.
  if(/^\/js\/clan-(war-reform|faction)-v1\.mjs$/.test(requested)){res.writeHead(200,{'Content-Type':'text/javascript'}).end('export function connect(){}');return;}
  const file=resolve(root,'.'+(requested==='/organization/'?'/organization/index.html':requested)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)||!/^\/(organization\/|js\/(?:organization-|clan-v1.js)|css\/organization-|shared\/organization-|assets\/ui\/organization\/|assets\/fonts\/)/.test(requested)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 const draftKey='org-admission:'+ORGANIZATION_INTERVIEW_VERSION+':public-preparation:preparation';
 const draft=JSON.stringify({answers:Object.fromEntries(ORGANIZATION_INTERVIEW.map(q=>[q.id,q.options[0].id])),preferred:15,editing:true,baseRevision:0});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>context.close());
  await context.addInitScript(({draftKey,draft})=>localStorage.setItem(draftKey,draft),{draftKey,draft});
  const page=await context.newPage(),errors=[],apiRequests=[],documents=[];
  await page.clock.install();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/'))apiRequests.push(req.url());});
  page.on('framenavigated',frame=>{if(frame.parentFrame()&&frame.url().includes('/organization/'))documents.push(frame.url());});
  await page.goto(origin);
  const ui=page.frameLocator('.org-live-frame');
  await ui.locator('a.admission-button').waitFor();
  await page.waitForFunction(()=>parseInt(document.querySelector('.org-live-frame').style.height)>300);
  const fits=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await ui.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);};
  const imageButtons=async()=>assert.deepEqual(await ui.locator('button').evaluateAll(bs=>bs.filter(b=>getComputedStyle(b).backgroundImage==='none').map(b=>b.textContent)),[]);
  const closed=async()=>{
   assert.equal(await ui.locator('[data-admission="start"]').count(),0);
   assert.equal(await ui.locator('[data-answer], [data-admission-pick], .admission-dossier').count(),0);
   assert.match(await ui.locator('.org-status').innerText(),/로그인 필요/);
   assert.equal(await ui.locator('a.admission-button').getAttribute('href'),'/');
   assert.equal(await ui.locator('a.admission-button').getAttribute('target'),'_top');
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),draftKey),draft);
  };
  await closed();
  await fits();await imageButtons();await page.screenshot({path:join(output,width+'-entry.jpg'),fullPage:true,type:'jpeg',quality:85});
  // An old complete interview draft cannot restore logged-in admission controls.
  assert.equal(await ui.locator('[data-answer], .admission-results').count(),0);
  await ui.locator('[data-tab="mine"]').click();
  assert.equal(await ui.locator('.org-empty [data-tab="survey"]').isDisabled(),true);
  await ui.locator('.org-nav [data-tab="survey"]').click();await closed();

  // Real scheduled refreshes, including a failed request, must leave the iframe attached.
  await ui.locator('[data-tab="hideout"]').click();await ui.locator('[data-stage="4"]').click();
  await ui.locator('body').evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
  await ui.locator('[data-stage="4"]').focus();
  const baseline=await page.evaluate(()=>{
   window.originalOrganizationFrame=document.querySelector('.org-live-frame');
   scrollTo(0,300);
   return {scroll:scrollY,requests:overviewRequests};
  }),navigationCount=documents.length;
  for(let cycle=1;cycle<=3;cycle++){
   if(cycle===2)await page.evaluate(()=>window.failNextOverview=true);
   await page.clock.fastForward(20050);
   await page.waitForFunction(n=>overviewRequests>=n&&!ClanV1.state.loading,baseline.requests+cycle);
   assert.equal(await page.evaluate(()=>originalOrganizationFrame===document.querySelector('.org-live-frame')),true,'poll must retain the iframe node');
   assert.equal(documents.length,navigationCount,'poll must not navigate/reload the iframe');
   assert.equal(await ui.locator('[data-tab="hideout"]').getAttribute('aria-current'),'page');
   assert.equal(await ui.locator('[data-stage="4"]').getAttribute('aria-pressed'),'true');
   assert.equal(await ui.locator('[data-stage="4"]').evaluate(el=>el===document.activeElement),true);
   assert.equal(await page.evaluate(()=>scrollY),baseline.scroll);
  }
  await page.evaluate(()=>ClanV1.stop());
  await fits();await imageButtons();
  await page.screenshot({path:join(output,width+'-hideout.jpg'),fullPage:true,type:'jpeg',quality:85});
  const before=await page.locator('.org-live-frame').getAttribute('style');
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'organization:height',height:29999}})));
  assert.equal(await page.locator('.org-live-frame').getAttribute('style'),before);
  await page.locator('[data-clan-tab="champions"]').click();
  assert.equal(await page.locator('.org-live-frame').count(),0);
  await page.locator('[data-clan-tab="organization"]').click();await closed();
  // Direct links and reloads require login, regardless of old drafts/query flags.
  await page.goto(origin+'/organization/?view=owner&admission=1');
  await page.locator('a.admission-button').waitFor();assert.match(await page.locator('.org-status').innerText(),/로그인 필요/);
  await page.reload();await page.locator('a.admission-button').waitFor();assert.match(await page.locator('.org-status').innerText(),/로그인 필요/);
  assert.equal(await page.locator('[data-answer], .admission-results, [data-tab="manage"]').count(),0);
  assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);
  await context.close();
 }
 t.diagnostic('Anonymous organization visual evidence: '+output);
});
