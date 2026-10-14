import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationPublicApi,organizationPublicOverview} from '../shared/organization-public-v1.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=process.env.ORG_QA_DIR||join(tmpdir(),'cnine-organization-public-20261015');
test('public preparation never fabricates participants or accepts enrollment, OWNER actions or DB writes',async()=>{
 const s=await organizationPublicApi('organization/overview');
 assert.equal(s.previewOnly,true);assert.equal(s.releaseEnabled,false);assert.equal(s.round,null);
 assert.equal(s.membership,null);assert.equal(s.participantCount,null);assert.equal(s.preparation.registrationOpen,false);
 assert.equal(s.policy.pointsPerRegion,null);assert.equal(s.organizations.length,15);
 for(const path of ['organization/survey','organization/withdraw','admin/organization','admin/organization/create','admin/organization/apply'])
  for(const method of ['GET','POST'])await assert.rejects(organizationPublicApi(path,{method}),{code:'ORG_RECRUITMENT_CLOSED'});
 s.policy.hideoutThresholds[1]=100;
 assert.equal(organizationPublicOverview().policy.hideoutThresholds[1],null);
 const entry=await readFile(join(root,'functions/api/[[path]].js'),'utf8');
 assert.doesNotMatch(entry,/from ['"].*_organization(?:_schema)?\.js/);
});
test('live ClanV1 entry embeds all seven questions on PC/mobile, remains closed, restores drafts and keeps the final league archive',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 await mkdir(output,{recursive:true});
 const harness='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/organization-preparation-v1.css"><style>body{margin:0;background:#090f19}main{max-width:1280px;margin:auto}</style><main><div id="clanRoot"></div></main><script src="/js/organization-preparation-v1.js"></script><script src="/js/clan-v1.js"></script><script>ClanV1.state.data={organizationPreparation:{legacyClosed:true},champions:{status:"COMPLETED",seeds:[],matches:[],rewardStatus:"SENT",rewards:[]}};ClanV1.openWar();</script></html>';
 const server=createServer(async(req,res)=>{try{
  const requested=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(requested==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(harness);return;}
  const file=resolve(root,'.'+(requested==='/organization/'?'/organization/index.html':requested)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)||!/^\/(organization\/|js\/(?:organization-|clan-v1.js)|css\/organization-|shared\/organization-|assets\/ui\/organization\/|assets\/fonts\/)/.test(requested)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>context.close());
  const page=await context.newPage(),errors=[],apiRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/'))apiRequests.push(req.url());});
  await page.goto(origin);
  const ui=page.frameLocator('.org-live-frame');
  await ui.locator('[data-admission="start"]').waitFor();
  await page.waitForFunction(()=>parseInt(document.querySelector('.org-live-frame').style.height)>300);
  const fits=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await ui.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);};
  const imageButtons=async()=>assert.deepEqual(await ui.locator('button').evaluateAll(bs=>bs.filter(b=>getComputedStyle(b).backgroundImage==='none').map(b=>b.textContent)),[]);
  await fits();await imageButtons();await page.screenshot({path:join(output,width+'-entry.jpg'),fullPage:true,type:'jpeg',quality:85});
  assert.match(await ui.locator('.org-public-notice').innerText(),/실제 지원서는 접수되지 않습니다/);
  await ui.locator('[data-admission="start"]').click();
  for(const answer of ['crew','cover','regroup','system','foundation','members','promise']){
   await ui.locator('[data-answer="'+answer+'"]').click();await ui.locator('[data-admission="next"]').click();
  }
  assert.equal(await ui.locator('.admission-dossier').count(),3);
  await ui.locator('[data-admission="all"]').click();
  assert.equal(await ui.locator('.admission-all-organizations button').count(),15);
  await ui.locator('.admission-all-organizations [data-admission-pick="15"]').click();
  assert.equal(await ui.locator('[data-admission="submit"]').isDisabled(),true);
  await fits();await imageButtons();
  await page.screenshot({path:join(output,width+'-results.jpg'),fullPage:true,type:'jpeg',quality:85});
  // UI tampering cannot turn a local preview into an enrollment write.
  await ui.locator('[data-admission="submit"]').evaluate(el=>{el.disabled=false;el.click();});
  assert.match(await ui.locator('#org-message').innerText(),/추후 시작/);
  await page.locator('[data-clan-tab="champions"]').click();
  assert.equal(await page.locator('.org-live-frame').count(),0);
  await page.locator('[data-clan-tab="organization"]').click();await ui.locator('[data-admission="start"]').click();
  assert.match(await ui.locator('.admission-application h2').innerText(),/야차파/);
  await ui.locator('[data-tab="hideout"]').click();await ui.locator('[data-stage="4"]').click();
  await fits();await imageButtons();
  await page.screenshot({path:join(output,width+'-hideout.jpg'),fullPage:true,type:'jpeg',quality:85});
  const before=await page.locator('.org-live-frame').getAttribute('style');
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'organization:height',height:29999}})));
  assert.equal(await page.locator('.org-live-frame').getAttribute('style'),before);
  assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);
  await context.close();
 }
 t.diagnostic('Live preparation visual evidence: '+output);
});
