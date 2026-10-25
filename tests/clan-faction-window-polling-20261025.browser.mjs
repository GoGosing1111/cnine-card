// Real ClanV1 + headquarters + faction window; all APIs use the isolated fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';

const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/faction-window-polling-20261025');
const clanScriptUrl=process.env.QA_CLAN_SCRIPT_URL||'/js/clan-v1.js';
assert(clanScriptUrl==='/js/clan-v1.js'||/^https:\/\/cnine-card\.pages\.dev\/js\/clan-v1\.js(?:\?[^"<>]*)?$/.test(clanScriptUrl));
test('20-second clan refresh preserves headquarters and faction window; explicit exits and sibling tabs still work on PC/mobile',async t=>{
 fs.mkdirSync(out,{recursive:true});
 const f=await clanResumeFixture(t);t.mock.method(Date,'now',f.clock);
 const review=await inspectResume(f.pg);await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 const overview=await f.call('clan/overview',{regular:true});assert.equal(overview.status,200);
 assert(overview.data.resumption);assert(overview.data.restoration);assert.equal(overview.data.organizationPreparation,null,'Use the actual resumed response that caused the regression');
 const requests=[],errors=[],missing=[],cache=new Map();let failNextClan=false;
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/qa-clan'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/command-ui-v1.css"><link rel="stylesheet" href="/css/clan-v1.css"><link rel="stylesheet" href="/css/clan-champions-v2071.css"><link rel="stylesheet" href="/css/clan-war-reform-v1.css"><link rel="stylesheet" href="/css/organization-preparation-v1.css"><style>body{margin:0;background:#080e15;color:white;font-family:Arial,sans-serif}#clanRoot{max-width:1400px;margin:auto}</style><div id="clanRoot" class="clan-shell"></div><script src="/js/organization-preparation-v1.js"></script><script src="${clanScriptUrl}"></script><script>const apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,o),d=await r.json();if(!r.ok)throw Error(d.error);return d};ClanV1.bind({apiRequest,renderShell:()=>{},clearApiCache:()=>{}});</script></html>`);return;
  }
  if(url.pathname.startsWith('/api/')){
   const p=url.pathname.slice(5);requests.push({path:p,method:req.method});
   if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Read-only browser verification'}));return;}
   if(p==='clan/overview'&&failNextClan){failNextClan=false;res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Injected temporary clan refresh outage'}));return;}
   const regular=p.startsWith('clan/'),faction=p.startsWith('organization/faction/');
   const r=regular||faction?await f.call(p+url.search,{user:2,regular}):await f.organizationCall(p+url.search,{user:2});
   res.writeHead(r.status,{'Content-Type':'application/json'}).end(JSON.stringify(r.data));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=path.relative(root,file);
  if(rel.startsWith('..')||path.isAbsolute(rel)){res.writeHead(404).end();return;}
  let data=cache.get(file);if(!data){try{data=fs.readFileSync(file);}catch(e){if(e.code!=='ENOENT')throw e;data=execFileSync('git',['show','HEAD:'+rel.replaceAll('\\','/')],{cwd:root,maxBuffer:40e6,stdio:['ignore','pipe','pipe']});}cache.set(file,data);}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);
 }catch(e){missing.push({path:req.url,error:e.message});res.writeHead(500).end('QA resource unavailable');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});t.after(()=>browser.close());const checks=[];
 for(const width of clanScriptUrl.startsWith('https:')?[390]:[1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},serviceWorkers:'block'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date(f.clock())});
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-review'));
  await page.goto(origin+'/qa-clan');
  const org=page.frameLocator('.org-live-frame');await org.locator('.org-directory-card').first().waitFor();
  await page.waitForFunction(()=>!ClanV1.state.loading&&ClanV1.state.refreshTimer);
  const originalHeadquarters=await page.locator('.org-live-frame').elementHandle();
  await org.locator('.org-nav [data-tab="faction"]').click();
  const windowFrame=page.frameLocator('[data-organization-war-window] iframe');await windowFrame.locator('.fw-seoul-map').waitFor();
  await windowFrame.locator('.fw-tabs [data-fw-tab="formation"]').click();await windowFrame.locator('.fw-formation').waitFor();
  const originalBattlefield=await page.locator('[data-organization-war-window] iframe').elementHandle();
  const poll=async fail=>{
   failNextClan=fail;const before=requests.filter(r=>r.path==='clan/overview').length;
   await page.clock.fastForward(20100);
   await page.waitForFunction(()=>!ClanV1.state.loading&&ClanV1.state.refreshTimer);
   assert(requests.filter(r=>r.path==='clan/overview').length>before,'The real automatic clan refresh must execute');
   const result={width,outage:fail,headquartersSame:await originalHeadquarters.evaluate(node=>node.isConnected),windowOpen:await page.locator('[data-organization-war-window][open]').count()===1};
   fs.writeFileSync(path.join(out,'latest-poll.json'),JSON.stringify(result,null,2)+'\n');
   assert.equal(result.headquartersSame,true,'automatic polling must not detach the headquarters iframe');
   assert.equal(result.windowOpen,true,'automatic polling must not close the faction window');
   assert.equal(await originalBattlefield.evaluate(node=>node.isConnected),true);
   assert.equal(await windowFrame.locator('.fw-tabs [data-fw-tab="formation"]').getAttribute('aria-current'),'page','Preserve selected faction tab');
   return result;
  };
  checks.push(await poll(false));
  if(clanScriptUrl.startsWith('https:')){
   await page.screenshot({path:path.join(out,'390-public-faction-after-poll.png'),fullPage:true});
   await page.close();continue;
  }
  checks.push(await poll(true));checks.push(await poll(false));
  assert.equal(await windowFrame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,width+'-faction-after-polls.png'),fullPage:true});
  await windowFrame.locator('[data-fw-leave]').click();await page.locator('[data-organization-war-window]').waitFor({state:'detached'});
  assert.equal(await originalHeadquarters.evaluate(node=>node.isConnected),true,'Explicit faction exit preserves headquarters');
  await org.locator('.org-nav [data-tab="mine"]').click();await org.locator('.org-my-head').waitFor();
  await page.clock.fastForward(20100);await page.waitForFunction(()=>!ClanV1.state.loading);
  await org.locator('.org-my-head').waitFor();
  await page.locator('[data-clan-tab="war"]').click();await page.locator('.cw-field').waitFor();
  assert.equal(await originalHeadquarters.evaluate(node=>node.isConnected),false,'Explicit clan-tab navigation still unmounts headquarters');
  await page.locator('[data-clan-tab="organization"]').click();await org.locator('.org-directory-card').first().waitFor();
  await org.locator('.org-nav [data-tab="faction"]').click();await windowFrame.locator('.fw-seoul-map').waitFor();
  await windowFrame.locator('.fw-tabs [data-fw-tab="map"]').focus();await page.keyboard.press('Escape');
  await page.locator('[data-organization-war-window]').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'','Explicit close restores host scrolling');
  checks.push({width,explicitExit:true,headquartersTabPreserved:true,siblingTab:true,reopen:true,escapeClose:true});
  await page.screenshot({path:path.join(out,width+'-headquarters-return.png'),fullPage:true});
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert(requests.every(r=>r.method==='GET'));
 fs.writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify({status:'PASS',clanScriptUrl,fixture:'real resumed server APIs on isolated PostgreSQL-compatible fixture',automaticRefreshPeriodMs:20000,clock:'Playwright fastForward invokes real page timers',checks,errors,missing,apiWrites:0},null,2)+'\n');
});
