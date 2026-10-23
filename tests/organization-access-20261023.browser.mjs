import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,join,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {installOrganizationFactionSchema,handleOrganizationFaction} from '../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../functions/_organization_faction_model.js';
const root=fileURLToPath(new URL('..',import.meta.url)),out=join(tmpdir(),'cnine-organization-access-20261023');
test('desktop/mobile join, elder approval, fixed schedule and all three hunting previews work with organization image panels',async t=>{
 const f=await organizationFixture(t,{people:10});const roundId=await f.prepare({survey:false});await installOrganizationFactionSchema(f.env.DB);
 f.advance(Date.parse('2026-10-24T05:00:00Z')-f.clock());
 await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,starts_at TEXT,ends_at TEXT,settled_at TEXT)');
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED',scope='LIVE',assigned_at=$2 WHERE id=$1",[roundId,f.clock()-1000]);
 await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,2,1,1,1000,$2)',[roundId,f.clock()]);
 for(let id=1;id<=6;id++)await f.pg.query('INSERT INTO organization_progress_v1(round_id,organization_id) VALUES($1,$2)',[roundId,id]);
 const state=newOrganizationFactionState(f.clock());state.elders={1:[2]};
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(state)]);
 await f.pg.query('UPDATE organization_faction_policy_v1 SET policy_json=$1',[JSON.stringify({revision:0,mode:'ON',fundsPerRegion:null,upgradeCosts:[0,null,null,null,null]})]);
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   let raw='';for await(const c of req)raw+=c;const path=url.pathname.slice(5),user=Number(req.headers['x-qa-user']||2);
   if(path.startsWith('organization/faction/')){
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
 for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<721,hasTouch:width<721,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===origin)failed.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-review'));await page.setExtraHTTPHeaders({'x-qa-user':'2'});
  const check=async label=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' horizontal overflow');assert.equal(await page.locator('img').evaluateAll(nodes=>nodes.filter(n=>!n.complete||n.naturalWidth===0).length),0,label+' loaded images');};
  await page.goto(origin+'/organization/');await page.locator('.org-directory-card').first().waitFor();
  assert.match(await page.locator('.org-live-hero').innerText(),/화·목·토·일 20:00~22:00/);
  await page.locator('.org-nav [data-tab="hideout"]').click();
  for(const stage of [2,3,4]){
   await page.locator('.org-stage-tabs [data-stage="'+stage+'"]').click();await page.locator('.org-hunt').waitFor();await page.locator('.org-hunt img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode())));
   assert.match(await page.locator('.org-hunt').evaluate(n=>getComputedStyle(n).borderImageSource),/panel-v3.webp/);
   await check('stage'+stage);await page.locator('.org-hunt').screenshot({path:join(out,width+'-stage'+(stage+1)+'-boss.png')});
   await page.locator('[data-hunt-kind="monster"]').click();await page.locator('.org-hunt-unit').evaluate(n=>n.decode());await check('monster'+stage);
   await page.locator('.org-hunt').screenshot({path:join(out,width+'-stage'+(stage+1)+'-monster.png')});
   await page.locator('[data-hunt-kind="boss"]').click();
  }
  const applicant=width===1440?5:width===390?6:7;
  await page.setExtraHTTPHeaders({'x-qa-user':String(applicant)});await page.goto(origin+'/organization/');
  await page.locator('#org-join-form').waitFor();await page.locator('select[name="organizationId"]').selectOption('1');await page.locator('textarea[name="message"]').fill('가입 인사 <script>window.injected=true</script>');
  await page.locator('#org-join-form button[type="submit"]').click();await page.getByRole('status').filter({hasText:'원로 심사 대기'}).waitFor();await check('pending');
  await page.screenshot({path:join(out,width+'-application.png'),fullPage:true});
  await page.setExtraHTTPHeaders({'x-qa-user':'2'});await page.reload();await page.locator('.org-nav [data-tab="join"]').click();await page.locator('[data-join-review="APPROVED"]').waitFor();
  assert.equal(await page.evaluate(()=>window.injected),undefined);await check('review');await page.screenshot({path:join(out,width+'-elder.png'),fullPage:true});
  await page.locator('[data-join-review="APPROVED"]').click();await page.getByText('심사 대기 중인 신청이 없습니다.').waitFor();
  assert.equal((await f.call('organization/overview',{user:applicant})).data.membership.organizationId,1);
  await page.goto(origin+'/organization/faction/');await page.locator('.fw-operation-info summary').click();assert.match(await page.locator('.fw-session-strip').innerText(),/화·목·토·일 20:00~22:00/);await page.locator('.fw-operation-info summary').click();await page.locator('.fw-tabs [data-fw-tab="treasury"]').click();assert.match(await page.locator('.fw-treasury').innerText(),/22시 종료 시점/);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,height,errors,failed,joinApproved:true,stages:[3,4,5]});await page.close();
 }
 await writeFile(join(out,'checks.json'),JSON.stringify(checks,null,2));t.diagnostic(out);
});
