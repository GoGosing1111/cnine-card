import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
const root=process.cwd(),out=process.env.QA_OUT;assert(out);fs.mkdirSync(out,{recursive:true});
test('actual PC/mobile clan pages use resumed schedules, 128 members and combined points; existing Wednesday availability saves',async t=>{
 const f=await clanResumeFixture(t);t.mock.method(Date,'now',f.clock);
 const review=await inspectResume(f.pg);await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/qa-clan'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/command-ui-v1.css"><link rel="stylesheet" href="/css/clan-v1.css"><link rel="stylesheet" href="/css/clan-champions-v2071.css"><link rel="stylesheet" href="/css/clan-war-reform-v1.css"><link rel="stylesheet" href="/css/organization-preparation-v1.css"><style>body{margin:0;background:#080e15;color:white;font-family:Arial,sans-serif}#clanRoot{max-width:1400px;margin:auto}</style><div id="clanRoot" class="clan-shell"></div><script src="/js/organization-preparation-v1.js"></script><script src="/js/clan-v1.js"></script><script>const apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,o),d=await r.json();if(!r.ok)throw Error(d.error);return d};ClanV1.openWar();ClanV1.bind({apiRequest,renderShell:()=>{},clearApiCache:()=>{}});</script></html>`);return;
  }
  if(url.pathname==='/qa-cms'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/organization-admin-v1.css"><link rel="stylesheet" href="/css/organization-command-20261021.css"><style>body{margin:0;background:#080e15}</style><main id="qa-root" class="orgcms"></main><script type="module">import {mountOrganizationCms} from '/admin/organization-admin-v1.mjs';mountOrganizationCms(document.querySelector('#qa-root'),{request:async(p,o={})=>{const r=await fetch('/api/'+p,o),d=await r.json();if(!r.ok)throw Error(d.error);return d;}});</script></html>`);return;
  }
  if(url.pathname.startsWith('/api/')){
   let raw='';for await(const c of req)raw+=c;const p=url.pathname.slice(5),user=Number(req.headers['x-user']||2),body=raw?JSON.parse(raw):undefined;
   const regular=p.startsWith('clan/')||p.startsWith('admin/clan-war/'),faction=p.startsWith('organization/faction/')||p.startsWith('admin/organization/faction');
   const r=regular||faction?await f.call(p+url.search,{user,body,method:req.method,regular}):await f.organizationCall(p+url.search,{user,body,method:req.method});res.writeHead(r.status,{'Content-Type':'application/json'}).end(JSON.stringify(r.data));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=path.relative(root,file);if(rel.startsWith('..')||path.isAbsolute(rel)){res.writeHead(404).end();return;}
  let data;try{data=fs.readFileSync(file);}catch(e){if(e.code!=='ENOENT')throw e;data=execFileSync('git',['show','HEAD:'+rel.replaceAll('\\','/')],{cwd:root,maxBuffer:30e6,stdio:['ignore','pipe','pipe']});}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);
 }catch(e){res.writeHead(500).end(e.stack);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});t.after(()=>browser.close());const checks=[];
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},serviceWorkers:'block'}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===origin)failed.push(r.status()+' '+r.url());});
  await page.setExtraHTTPHeaders({'x-user':'2'});await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-review'));
  const check=async label=>{await page.locator('img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode().catch(()=>{}))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' overflow');assert.deepEqual(await page.locator('img').evaluateAll(ns=>ns.filter(n=>!n.naturalWidth).map(n=>n.src)),[],label+' images');await page.screenshot({path:path.join(out,width+'-'+label+'.png'),fullPage:true});};
  await page.goto(origin+'/qa-clan');await page.locator('.cw-field').waitFor();assert.match(await page.locator('.clan-view').innerText(),/화·수·목·토 21:00~22:00/);await check('regular');
  await page.locator('.clan-tabs [data-clan-tab="schedule"]').click();await page.locator('.cw-plan').waitFor();assert.deepEqual(await page.locator('[name="warDay"]').evaluateAll(ns=>ns.map(n=>Number(n.value))),[2,3,4,6]);
  assert.doesNotMatch(await page.locator('.cw-plan').innerText(),/undefined/);await page.locator('[name="warDay"][value="3"]').check();await page.locator('[data-cw-schedule] button[type="submit"]').click();await page.waitForFunction(()=>window.ClanV1.state.data?.reform?.myDays?.includes(3));await check('schedule');
  await page.locator('[data-clan-tab="champions"]').click();assert.match(await page.locator('.clan-view').innerText(),/개최.*보류|개최.*잠금/);assert.equal(await page.locator('[data-clan-fight]').count(),0);await check('champions');
  await page.goto(origin+'/organization/');await page.locator('.org-directory-card').first().waitFor();assert.match(await page.locator('.org-live-hero').innerText(),/128명/);assert.match(await page.locator('.org-recruitment-time').innerText(),/1회/);await check('directory');
  await page.goto(origin+'/organization/faction/');await page.locator('.fw-seoul-map').waitFor();await page.locator('.fw-operation-info summary').click();assert.match(await page.locator('body').innerText(),/랜덤 1회/);assert.doesNotMatch(await page.locator('body').innerText(),/하루 랜덤 2회/);await check('faction');
  await page.locator('.fw-operation-info summary').click();await page.getByRole('button',{name:'순위표',exact:false}).first().click();await page.locator('[aria-label="정규 시즌 통합 순위"]').waitFor();assert.equal(await page.locator('.org-rank-contribution').count(),8);await check('ranking');await page.locator('.org-rank-record summary').first().click();assert.match(await page.locator('.org-rank-record[open]').innerText(),/8개를 점령해도 1점/);await page.locator('.org-rank-record summary').first().click();
  await page.setExtraHTTPHeaders({'x-user':'1'});await page.goto(origin+'/qa-cms');await page.locator('.orgcms-hero').waitFor();await page.locator('[data-tab="competition"]').click();await page.getByText('정규 시즌 승점 합산',{exact:true}).waitFor();assert.match(await page.locator('body').innerText(),/4개 점령/);await check('cms');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,members:128,regular:'Tue/Wed/Thu/Sat 21–22',factionDaily:1,holdings:4,points:1,errors,failed});await page.close();
 }
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
});
