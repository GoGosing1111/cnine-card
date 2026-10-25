import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
import {inspectSchedule,applySchedule} from '../scripts/ops/clan-wed-sat-sun-20261025.mjs';
const root=process.cwd(),out=process.env.QA_OUT;assert(out);fs.mkdirSync(out,{recursive:true});
test('actual PC/mobile regular war and weekly selection show Wed/Sat/Sun from October 28',async t=>{
 const f=await clanResumeFixture(t);t.mock.method(Date,'now',f.clock);
 const review=await inspectResume(f.pg);await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 const planned=await inspectSchedule(f.pg);await applySchedule(f.pg,{now:f.clock(),expectedReviewHash:planned.reviewHash,dryRun:false});
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
  await page.goto(origin+'/qa-clan');await page.locator('.cw-field').waitFor();assert.match(await page.locator('.clan-view').innerText(),/수·토·일 21:00~22:00/);await check('regular');
  await page.locator('.clan-tabs [data-clan-tab="schedule"]').click();await page.locator('.cw-plan').waitFor();assert.deepEqual(await page.locator('[name="warDay"]').evaluateAll(ns=>ns.map(n=>Number(n.value))),[3,6,0]);
  assert.match(await page.locator('.cw-plan header').innerText(),/수·토·일 · 21~22시/);assert.doesNotMatch(await page.locator('.cw-plan').innerText(),/undefined|화·수·목·토/);await page.locator('[name="warDay"][value="0"]').check();await page.locator('[data-cw-schedule] button[type="submit"]').click();await page.waitForFunction(()=>window.ClanV1.state.data?.reform?.myDays?.includes(0));await check('schedule');
  await page.goto(origin+'/organization/faction/');await page.locator('.fw-seoul-map').waitFor();await page.getByRole('button',{name:'순위표',exact:false}).first().click();await page.locator('.org-rank-season-note').waitFor();assert.match(await page.locator('.org-rank-season-note').innerText(),/수·토·일 21:00~22:00/);assert.doesNotMatch(await page.locator('body').innerText(),/화·수·목·토/);await check('ranking');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,regular:'Wed/Sat/Sun 21–22',firstStartsAt:planned.plan.wars[0].starts_at,sundaySaved:true,errors,failed});await page.close();
 }
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
});
