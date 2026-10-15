import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {ORGANIZATIONS,defaultOrganizationPolicy,allocateOrganizations} from '../shared/organization-system-v1.mjs';
import {defaultOrganizationFactionPolicy,ORGANIZATION_DISTRICTS} from '../shared/organization-faction-v1.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=process.env.ORGANIZATION_CMS_QA_DIR||join(tmpdir(),'cnine-organization-cms-20261015');

test('organization content status shows recruitment and opens the organization headquarters',async()=>{
 const source=await readFile(join(root,'js/app.js'),'utf8'),begin=source.indexOf('const LIVE_OPERATION_META='),end=source.indexOf('function liveBurningOperationHtml()',begin),context={Date,Number,Math,String,Object,setTimeout,clearInterval,document:{},escapeHtml:v=>String(v).replaceAll('<','&lt;'),renderShell:v=>context.entered=v};
 vm.createContext(context);vm.runInContext(source.slice(begin,end),context);
 const html=vm.runInContext(`liveOperationCardHtml({kind:'ORGANIZATION',phase:'FORMATION',title:'조직 입단 모집',detail:'7문항 설문 · 24시간',deadlineAt:new Date(Date.now()+86400000).toISOString()})`,context);
 assert.match(html,/data-live-operation-kind="ORGANIZATION"/);assert.match(html,/입단 모집/);assert.match(html,/모집 마감/);assert.match(html,/data-live-operation-deadline=/);
 assert.match(vm.runInContext(`liveOperationCardHtml({kind:'ORGANIZATION',phase:'PREPARING'})`,context),/균등 배정 중/);
 vm.runInContext(`openLiveOperation('ORGANIZATION')`,context);assert.equal(context.entered,'clan');
});

test('organization OWNER CMS handles 24h recruitment, balanced assignment, nullable economy, commander and request retry on PC and mobile',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());await mkdir(out,{recursive:true});
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/organization-admin-v1.css"><style>body{margin:0;background:#060b12}#cms-root{max-width:1400px;margin:0 auto}</style><body><section id="cms-root" class="orgcms"></section><script type="module">import {mountOrganizationCms} from "/admin/organization-admin-v1.mjs";window.dispose=mountOrganizationCms(document.querySelector("#cms-root"));</script>');return;}
  if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  const file=resolve(root,'.'+decodeURIComponent(url.pathname)),rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel)||!/^\/(admin\/(organization-admin|admin-v945)|js\/(joint-account-transport|account-sync-client)|shared\/(organization-|clan-faction-|account-sync-)|assets\/ui\/organization\/)/.test(url.pathname)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [1440,390]){
  const now=Date.now(),people=Array.from({length:30},(_,i)=>({userId:i+1,nickname:'검수 조직원 '+(i+1),preferredOrganizationId:i%15+1,power:10000-i*10}));
  const round={id:'qa-round-'+width,name:'격리 CMS 검수 회차',scope:'LIVE',phase:'PREPARATION',revision:0,opened_at:null,closes_at:null,auto_assign:true,assignment_status:'PENDING'};
  const state={ok:true,serverNow:now,round,rounds:[round],policy:defaultOrganizationPolicy(),participantCount:30,capacity:150,ratedCount:0,proposal:null,participants:people.map(p=>({...p,submittedAt:now,surveyRevision:1,rated:false})),organizations:ORGANIZATIONS.map(o=>({...o,memberCount:0}))};
  const faction={ok:true,round,policy:defaultOrganizationFactionPolicy(),organizations:ORGANIZATIONS.map((o,i)=>({...o,memberCount:2,funds:0,stage:1,commanderId:null,roster:[people[i*2],people[i*2+1]].map((p,j)=>({...p,slot:j+1}))})),ledger:[],state:{districts:ORGANIZATION_DISTRICTS.map(d=>({...d,owner:0})),battles:[]},sessions:{active:false}};
  const writes=[],receipts=new Map();let failPolicyOnce=true;
  const page=await browser.newPage({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>page.close());const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{const realNow=Date.now;Date.now=()=>realNow()+3600000;});
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname.slice(5),body=req.postDataJSON();
   if(req.method()==='GET'){await route.fulfill({json:path==='admin/organization'?state:path==='admin/organization/faction'?faction:{}});return;}
   writes.push({path,body:structuredClone(body)});if(receipts.has(body.requestId)){await route.fulfill({json:receipts.get(body.requestId)});return;}
   let result={ok:true};
   if(path==='admin/organization/phase'){round.phase=body.phase;round.revision++;if(body.phase==='SURVEY'){round.opened_at=now;round.closes_at=now+86400000;round.auto_assign=body.autoAssign;}result.round=round;}
   else if(path==='admin/organization/ratings'){if(body.restart){state.ratedCount=0;result={ok:true,ratedCount:0,total:30,done:false};}else{state.ratedCount=30;state.participants.forEach(p=>p.rated=true);result={ok:true,ratedCount:30,total:30,done:true};}}
   else if(path==='admin/organization/propose'){state.proposal={id:'qa-proposal',expiresAt:now+600000,...allocateOrganizations(people)};result.proposal=state.proposal;}
   else if(path==='admin/organization/apply'){round.phase='ASSIGNED';round.assignment_status='COMPLETED';state.proposal.appliedAt=now;}
   else if(path==='admin/organization/faction/policy'){faction.policy={...body.policy,revision:body.policy.revision+1};result.policy=faction.policy;}
   else if(path==='admin/organization/faction/commander'){faction.organizations.find(o=>o.id===body.organizationId).commanderId=body.userId;}
   else if(path==='admin/organization/policy'){state.policy={...body.policy,revision:body.policy.revision+1};result.policy=state.policy;}
   else{await route.fulfill({status:404,json:{error:'Unsupported QA mutation'}});return;}
   receipts.set(body.requestId,structuredClone(result));
   if(path==='admin/organization/faction/policy'&&failPolicyOnce){failPolicyOnce=false;await route.fulfill({status:503,json:{error:'검수용 응답 유실 · 같은 저장 재시도'}});return;}
   await route.fulfill({json:result});
  });
  const fits=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No page overflow at '+width);assert.ok((await page.locator('.orgcms-hero').boundingBox()).height<420,'CMS hero is compact with inherited admin styles');};
  const shot=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,width+'-'+name+'.png'),fullPage:true});};
  const idle=()=>page.waitForFunction(()=>document.querySelector('#cms-root').getAttribute('aria-busy')==='false');
  await page.goto(origin);await page.locator('[data-action="open"]').waitFor();await idle();await fits();
  assert.equal(await page.locator('[data-auto-assign]').isChecked(),true);await page.locator('[data-action="open"]').click();await page.locator('[data-action="close"]').waitFor();await idle();
  assert.match(await page.locator('[data-deadline]').innerText(),/^(24:00:00|23:59:)/,'Recruitment clock follows server time despite client clock skew');assert.equal(round.closes_at-round.opened_at,86400000);assert.equal(round.auto_assign,true);const deadline=round.closes_at;
  await page.locator('[data-action="refresh"]').click();await idle();assert.equal(round.closes_at,deadline);assert.equal(writes.filter(w=>w.path.endsWith('/phase')).length,1);await fits();await shot('recruitment');
  await page.locator('[data-action="close"]').click();await idle();await page.locator('[data-tab="assignment"]').click();await page.locator('[data-action="rate"]').click();await idle();await page.locator('[data-action="propose"]').click();await idle();assert.equal(await page.locator('.orgcms-team').count(),15);await fits();await shot('allocation');
  await page.locator('[data-action="apply"]').click();await idle();assert.equal(round.phase,'ASSIGNED');
  await page.locator('[data-tab="hideout"]').click();await page.locator('[data-faction-path="fundsPerRegion"]').waitFor();await idle();assert.equal(await page.locator('[data-faction-path="fundsPerRegion"]').inputValue(),'');
  await page.locator('[data-faction-path="fundsPerRegion"]').fill('1200');await page.locator('[data-faction-path="upgradeCosts.1"]').fill('3500');await page.getByRole('button',{name:'조직 자금 수입 설정 저장',exact:true}).click();await idle();assert.match(await page.locator('[role=status]').innerText(),/응답 유실/);
  await page.getByRole('button',{name:'조직 자금 수입 설정 저장',exact:true}).click();await idle();const policyWrites=writes.filter(w=>w.path.endsWith('/faction/policy'));assert.equal(policyWrites.length,2);assert.deepEqual(policyWrites[0].body,policyWrites[1].body,'Response loss retries the same receipt');assert.equal(faction.policy.revision,1);assert.equal(faction.policy.fundsPerRegion,1200);assert.deepEqual(faction.policy.upgradeCosts,[0,3500,null,null,null]);await fits();await shot('funds');
  await page.locator('[data-tab="faction"]').click();await page.locator('[data-faction-path="mode"]').selectOption('ON');await page.getByRole('button',{name:'세력전 운영 설정 저장',exact:true}).click();await idle();assert.equal(faction.policy.mode,'ON');assert.equal(faction.policy.fundsPerRegion,1200);await fits();
  await page.locator('[data-tab="organizations"]').click();await page.locator('[data-org-select]').selectOption('2');await page.locator('[data-commander]').selectOption('3');await page.getByRole('button',{name:'지휘관 지정 저장',exact:true}).click();await idle();assert.equal(faction.organizations[1].commanderId,3);await fits();await shot('organization');if(width===390)assert.ok(await page.locator('.orgcms-tabs').evaluate(el=>el.scrollLeft)>0,'Mobile navigation retains the selected tab scroll after save');
  round.phase='CLOSED';state.participantCount=151;await page.locator('[data-action="refresh"]').click();await idle();await page.locator('[data-tab="assignment"]').click();assert.equal(await page.locator('[data-action="rate"]').isDisabled(),true);assert.equal(await page.locator('[data-action="apply"]').isDisabled(),true);assert.match(await page.locator('.orgcms-warning').innerText(),/150명 초과/);
  assert.deepEqual(await page.locator('#cms-root button').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).backgroundImage==='none').map(n=>n.textContent)),[],'CMS buttons reuse generated image skins');assert.deepEqual(errors,[]);await page.close();
 }
 t.diagnostic('CMS PC/mobile screenshots: '+out);
});
