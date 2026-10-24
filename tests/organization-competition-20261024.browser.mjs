import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,join,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {handleOrganization} from '../functions/_organization.js';
import {handleOrganizationFaction} from '../functions/_organization_faction.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=process.env.ORG_COMPETITION_QA_DIR||join(root,'docs/qa/organization-competition-20261024');

test('PC and mobile: actual faction rankings, settlement history, reward UI and OWNER settings save/reload',async t=>{
 const f=await organizationFactionFixture(t,{live:true});
 await f.pg.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 f.advance(Date.parse('2026-10-24T20:00:00+09:00')-f.clock());await f.overview();
 await f.mutateState(s=>{s.session.participants=[2];s.session.participantClans={2:1};s.districts.forEach((d,i)=>d.owner=i<10?1:i<18?2:i<22?3:i<24?4:5);});
 f.advance(Date.parse('2026-11-16T00:00:00+09:00')-f.clock());await f.overview();
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/qa-cms'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/organization-admin-v1.css"><style>body{margin:0;background:#080e15}</style><main id="qa-root" class="orgcms"></main><script type="module">import {mountOrganizationCms} from '/admin/organization-admin-v1.mjs';mountOrganizationCms(document.querySelector('#qa-root'),{request:async(path,options={})=>{const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),{status:r.status});return d;}});</script></html>`);return;
  }
  if(url.pathname.startsWith('/api/')){
   let raw='';for await(const chunk of req)raw+=chunk;
   const path=url.pathname.slice(5),request=new Request(url,{method:req.method,headers:{'x-user':String(req.headers['x-qa-user']||2),'Content-Type':'application/json',Origin:req.headers.origin||url.origin},...(raw?{body:raw}:{})});
   const response=await (path.includes('organization/faction')?handleOrganizationFaction:handleOrganization)({path,request,env:f.env,deps:f.deps});
   if(!response){res.writeHead(404).end();return;}
   res.writeHead(response.status,{'Content-Type':'application/json'}).end(await response.text());return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  let data;try{data=await readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;data=execFileSync('git',['show','HEAD:'+rel.replaceAll('\\','/')],{cwd:root,maxBuffer:30e6,stdio:['ignore','pipe','pipe']});}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch(error){res.writeHead(500).end(error.message);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());await mkdir(out,{recursive:true});const checks=[];
 for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<721,hasTouch:width<721,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===origin)failed.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-review'));await page.setExtraHTTPHeaders({'x-qa-user':'2'});
  const check=async label=>{
   await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' horizontal overflow');
   assert.equal(await page.locator('img').evaluateAll(nodes=>nodes.filter(n=>!n.complete||n.naturalWidth===0).length),0,label+' loaded images');
  };
  await page.goto(origin+'/organization/faction/?tab=rankings');await page.locator('.org-rank-table tbody tr').first().waitFor();
  assert.equal(await page.locator('.org-rank-table tbody tr').count(),6);assert.equal(await page.locator('.org-rank-table tbody tr.is-mine').count(),1);
  assert.match(await page.locator('.org-rank-heading').innerText(),/시즌 2/);
  await check('season ranking');await page.screenshot({path:join(out,width+'-rankings.png'),fullPage:true});
  await page.locator('[data-org-rank-view=weekly]').click();assert.equal(await page.locator('[data-org-rank-view=weekly]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('.org-rank-table tbody tr').first().innerText(),/10점/);
  await page.locator('[data-org-rank-view=weeks]').click();assert.equal(await page.locator('.org-rank-record').count(),4);await check('weekly history');
  await page.locator('[data-org-rank-view=seasons]').focus();await page.keyboard.press('Enter');assert.match(await page.locator('.org-rank-record').first().innerText(),/40점/);await check('season result');await page.screenshot({path:join(out,width+'-season-result.png'),fullPage:true});
  await page.locator('.fw-tabs [data-fw-tab=treasury]').click();assert.match(await page.locator('.fw-pig-reward').innerText(),/피그코인 200개/);await check('pig coin reward');
  await page.setExtraHTTPHeaders({'x-qa-user':'1'});await page.goto(origin+'/qa-cms');await page.locator('.orgcms-tabs [data-tab=competition]').click();await page.locator('[data-faction-path="pigCoinReward.amount"]').waitFor();
  assert.equal(await page.locator('[data-faction-path="pigCoinReward.amount"]').inputValue(),'200');
  const amount=200+width;await page.locator('[data-faction-path="pigCoinReward.amount"]').fill(String(amount));
  await page.locator('[data-faction-path="pigCoinReward.requiredTerritories"]').fill('9');
  await page.locator('[data-faction-path="competition.seasonWeeks"]').fill('6');
  await page.getByRole('button',{name:'피그코인 보상 설정 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'설정을 저장했습니다'}).waitFor();
  let saved=(await f.admin()).data;assert.equal(saved.policy.pigCoinReward.amount,amount);assert.equal(saved.policy.pigCoinReward.requiredTerritories,9);assert.equal(saved.policy.competition.seasonWeeks,6);assert.equal(saved.competition.season.weeks,4);
  await page.getByRole('button',{name:'새로 불러오기',exact:true}).click();await page.getByRole('status').filter({hasText:'최신 운영 상태'}).waitFor();assert.equal(await page.locator('[data-faction-path="pigCoinReward.amount"]').inputValue(),String(amount));
  await page.locator('[data-faction-path="pigCoinReward.amount"]').fill('200');await page.locator('[data-faction-path="pigCoinReward.requiredTerritories"]').fill('8');await page.locator('[data-faction-path="competition.seasonWeeks"]').fill('4');
  await page.getByRole('button',{name:'피그코인 보상 설정 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'설정을 저장했습니다'}).waitFor();
  await page.getByRole('button',{name:'기한 도래 정산 확인',exact:true}).click();await page.getByRole('status').filter({hasText:'주간·시즌 정산을 확인했습니다'}).waitFor();
  await check('CMS settings');assert.match(await page.locator('.org-rank-panel').evaluate(n=>getComputedStyle(n).borderImageSource),/organization\/interface-v2\/dossier-panel.webp/);
  await page.screenshot({path:join(out,width+'-cms.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);checks.push({width,height,errors,failed,rankingRows:6,weeklyReceipts:4,seasonReceipts:1,cmsRoundTrip:true,keyboard:true});await page.close();
 }
 await writeFile(join(out,'browser-checks.json'),JSON.stringify(checks,null,2));t.diagnostic(out);
});
