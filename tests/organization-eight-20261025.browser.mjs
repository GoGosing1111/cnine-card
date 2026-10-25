import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,join,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {installOrganizationFactionSchema,handleOrganizationFaction} from '../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../functions/_organization_faction_model.js';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.QA_OUT||join(tmpdir(),'cnine-clan-eight-20261025');
test('desktop/mobile display eight clans and current join options while all competition schedules stay locked',async t=>{
 const f=await organizationFixture(t,{people:10});const roundId=await f.prepare({survey:false});await installOrganizationFactionSchema(f.env.DB);
 f.advance(Date.parse('2026-10-25T06:00:00Z')-f.clock());
 await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,starts_at TEXT,ends_at TEXT,settled_at TEXT)');
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED',scope='LIVE',assigned_at=$2 WHERE id=$1",[roundId,f.clock()-1000]);
 for(let id=1;id<=8;id++)await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,$2,$3,1,1000,$4)',[roundId,id+1,id,f.clock()]);
 for(let id=1;id<=8;id++)await f.pg.query('INSERT INTO organization_progress_v1(round_id,organization_id) VALUES($1,$2)',[roundId,id]);
 const state=newOrganizationFactionState(f.clock());state.elders=Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,[i+2]]));state.districts.forEach((d,i)=>d.owner=i<8?i+1:0);
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(state)]);
 await f.pg.query('UPDATE organization_faction_policy_v1 SET policy_json=$1',[JSON.stringify({revision:0,mode:'ON',fundsPerRegion:null,upgradeCosts:[0,null,null,null,null]})]);
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/qa-cms'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/organization-admin-v1.css"><link rel="stylesheet" href="/css/organization-command-20261021.css"><style>body{margin:0;background:#080e15}</style><main id="qa-root" class="orgcms"></main><script type="module">import {mountOrganizationCms} from '/admin/organization-admin-v1.mjs';mountOrganizationCms(document.querySelector('#qa-root'),{request:async(path,options={})=>{const r=await fetch('/api/'+path,options);const d=await r.json();if(!r.ok)throw Error(d.error||'HTTP '+r.status);return d;}});</script></html>`);return;
  }
  if(url.pathname.startsWith('/api/')){
   let raw='';for await(const c of req)raw+=c;const path=url.pathname.slice(5),user=Number(req.headers['x-qa-user']||2);
   if(path.startsWith('organization/faction/')||path==='admin/organization/faction'){
    const response=await handleOrganizationFaction({path,request:new Request(url,{method:req.method,headers:{'x-qa-user':String(user),'Content-Type':'application/json'},...(raw?{body:raw}:{})}),env:f.env,deps:f.deps});res.writeHead(response.status,{'Content-Type':'application/json'}).end(await response.text());return;
   }
   const r=await f.call(path+url.search,{user,method:req.method,body:raw?JSON.parse(raw):undefined});res.writeHead(r.status,{'Content-Type':'application/json'}).end(JSON.stringify(r.data));return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  let data;try{data=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;data=execFileSync('git',['show','HEAD:'+rel.replaceAll('\\','/')],{cwd:root,maxBuffer:30e6,stdio:['ignore','pipe','pipe']});}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'),browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());await mkdir(out,{recursive:true});const checks=[];
 const names=['DK','삼성','T1','한화','LG','롯데','FM','DC'];
 for(const [width,height] of [[1440,1000],[390,844]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<721,hasTouch:width<721,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===origin)failed.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-review'));await page.setExtraHTTPHeaders({'x-qa-user':'2'});
  const check=async label=>{await page.locator('img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode().catch(()=>{}))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' horizontal overflow');assert.equal(await page.locator('img').evaluateAll(nodes=>nodes.filter(n=>!n.complete||n.naturalWidth===0).length),0,label+' loaded images');};
  await page.goto(origin+'/organization/');await page.locator('.org-directory-card').first().waitFor();
  assert.deepEqual(await page.locator('.org-directory-card h3').allTextContents(),names);assert.equal(await page.locator('.org-directory-card img.org-clan-mark').count(),8);
  assert.match(await page.locator('body').innerText(),/잠금|잠겨/);await check('directory');await page.screenshot({path:join(out,width+'-directory.png'),fullPage:true});
  assert.match(await page.locator('.org-recruitment-time').innerText(),/대회 일정 잠금/);assert.doesNotMatch(await page.locator('.org-recruitment-time').innerText(),/20:00|화·목/);
  if(process.env.QA_FOCUS==='directory'){assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,height,scheduleBannerLocked:true,errors,failed});await page.close();continue;}
  await page.setExtraHTTPHeaders({'x-qa-user':'10'});await page.goto(origin+'/organization/');await page.locator('#org-join-form').waitFor();
  const options=await page.locator('select[name="organizationId"] option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));assert.equal(options.filter(o=>Number(o.value)>0).length,8);assert(options.some(o=>o.value==='7'&&o.text.includes('FM')));assert(options.some(o=>o.value==='8'&&o.text.includes('DC')));
  await page.locator('select[name="organizationId"]').selectOption('7');await check('join');await page.screenshot({path:join(out,width+'-join.png'),fullPage:true});
  await page.setExtraHTTPHeaders({'x-qa-user':'2'});await page.goto(origin+'/organization/faction/');await page.locator('.fw-seoul-map').waitFor();assert.match(await page.locator('body').innerText(),/잠금|잠겨/);await check('map');await page.screenshot({path:join(out,width+'-map.png'),fullPage:true});
  await page.setExtraHTTPHeaders({'x-qa-user':'1'});await page.goto(origin+'/qa-cms');await page.locator('.orgcms-hero').waitFor();
  assert.match(await page.locator('.orgcms-rules').innerText(),/8개 클랜/);assert.match(await page.locator('.orgcms-rules').innerText(),/200석/);await check('cms capacity');await page.screenshot({path:join(out,width+'-cms-capacity.png'),fullPage:true});
  await page.locator('.orgcms-tabs [data-tab="faction"]').click();await page.locator('.orgcms-team h4').first().waitFor();assert.deepEqual(await page.locator('.orgcms-team h4').allTextContents(),names);assert.equal(await page.locator('.orgcms-team img.org-clan-mark').count(),8);await check('cms');await page.screenshot({path:join(out,width+'-cms.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,height,errors,failed,clans:names,capacity:200,newJoinPolicyApplied:false,schedulesLocked:true});await page.close();
 }
 await writeFile(join(out,process.env.QA_FOCUS==='directory'?'checks-directory.json':'checks.json'),JSON.stringify(checks,null,2));t.diagnostic(out);
});
