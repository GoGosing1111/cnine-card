import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=dirname(fileURLToPath(import.meta.url)),origin='https://cnine-card.pages.dev';
const {organizationFactionFixture}=await import(pathToFileURL(join(root,'tests/helpers/organization-faction-fixture.mjs')));
const {handleOrganization}=await import(pathToFileURL(join(root,'functions/_organization.js')));
const {handleOrganizationFaction}=await import(pathToFileURL(join(root,'functions/_organization_faction.js')));
const cleanups=[],f=await organizationFactionFixture({after:fn=>cleanups.push(fn)},{live:true});
await f.pg.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
f.advance(Date.parse('2026-10-24T12:00:00+09:00')-f.clock());await f.overview();
await f.mutateState(s=>s.districts.forEach((d,i)=>d.owner=i<9?1:i<16?2:i<17?3:i<24?5:6));
const fetched=new Map(),failures=[],checks=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/qa-cms'){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/organization-admin-v1.css"><style>body{margin:0;background:#080e15}</style><main id="qa-root" class="orgcms"></main><script type="module">import {mountOrganizationCms} from '/admin/organization-admin-v1.mjs';mountOrganizationCms(document.querySelector('#qa-root'),{request:async(path,options={})=>{const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}});</script></html>`);return;
 }
 if(url.pathname.startsWith('/api/')){
  let raw='';for await(const chunk of req)raw+=chunk;
  const route=url.pathname.slice(5),request=new Request(url,{method:req.method,headers:{'x-user':String(req.headers['x-qa-user']||2),'Content-Type':'application/json',Origin:url.origin},...(raw?{body:raw}:{})});
  const response=await(route.includes('organization/faction')?handleOrganizationFaction:handleOrganization)({path:route,request,env:f.env,deps:f.deps});
  if(!response){res.writeHead(404).end();return;}res.writeHead(response.status,{'Content-Type':'application/json'}).end(await response.text());return;
 }
 const remote=await fetch(origin+url.pathname+url.search,{signal:AbortSignal.timeout(25000)});if(!remote.ok)throw Error('Public asset '+remote.status+' '+url.pathname);
 const data=Buffer.from(await remote.arrayBuffer());fetched.set(url.pathname,{path:url.pathname,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
 res.setHeader('Content-Type',remote.headers.get('Content-Type')||'application/octet-stream');res.end(data);
 }catch(e){failures.push(e.message);res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 await mkdir(out,{recursive:true});
 for(const [width,height] of [[1440,1000],[390,844]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<721,hasTouch:width<721,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-live-static-review'));await page.setExtraHTTPHeaders({'x-qa-user':'2'});
  await page.goto(local+'/organization/faction/?tab=rankings');await page.locator('.org-rank-table tbody tr').first().waitFor();
  assert.equal(await page.locator('.org-rank-table tbody tr').count(),6);assert.match(await page.locator('.org-rank-heading').innerText(),/시즌 1/);
  const metrics=await page.locator('.org-rank-metrics').innerText();assert.match(metrics,/10\. 26\./);assert.match(metrics,/11\. 16\./);
  await page.locator('[data-org-rank-view=weekly]').click();assert.match(await page.locator('.org-rank-table tbody tr').first().innerText(),/9점/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));await page.screenshot({path:join(out,'live-'+width+'-rankings.png'),fullPage:true});
  await page.locator('.fw-tabs [data-fw-tab=treasury]').click();assert.match(await page.locator('.fw-pig-reward').innerText(),/피그코인 200개/);
  await page.setExtraHTTPHeaders({'x-qa-user':'1'});await page.goto(local+'/qa-cms');await page.locator('.orgcms-tabs [data-tab=competition]').click();await page.locator('[data-faction-path="pigCoinReward.amount"]').waitFor();
  assert.equal(await page.locator('[data-faction-path="pigCoinReward.amount"]').inputValue(),'200');assert.equal(await page.locator('[data-faction-path="pigCoinReward.requiredTerritories"]').inputValue(),'8');assert.equal(await page.locator('[data-faction-path="competition.seasonWeeks"]').inputValue(),'4');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));await page.screenshot({path:join(out,'live-'+width+'-cms.png'),fullPage:true});
  assert.deepEqual(errors,[]);checks.push({width,height,errors,rankingRows:6,weeklyPoints:9,pigCoins:200,requiredTerritories:8,seasonWeeks:4,overflow:false});await page.close();
 }
 assert.deepEqual(failures,[]);const report={checkedAt:new Date().toISOString(),productionOrigin:origin,productionStaticAssets:true,api:'isolated PostgreSQL fixture',productionApiRequests:0,checks,assets:[...fetched.values()]};await writeFile(join(out,'live-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks,publicAssets:fetched.size,productionApiRequests:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const fn of cleanups.reverse())await fn();}
