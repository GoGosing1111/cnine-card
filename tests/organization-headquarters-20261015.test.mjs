import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {defaultOrganizationPolicy} from '../shared/organization-system-v1.mjs';
import {organizationHeadquartersState} from '../shared/organization-headquarters-v1.mjs';
import {organizationFixture} from './helpers/organization-fixture.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));

test('headquarters reads the stored stage without upgrading or resetting it when thresholds or growth mode change',()=>{
 const p={...defaultOrganizationPolicy(),growthMode:'CUMULATIVE',hideoutThresholds:[0,100,500,1000,2000]};
 assert.deepEqual(organizationHeadquartersState({points:275,stage:2},p),{stage:2,name:'골목 사무실',points:275,nextStage:3,nextName:'조직 본거지',nextThreshold:500,remainingPoints:225,configured:true,contentEnabled:false});
 const awaiting=organizationHeadquartersState({points:1500,stage:2},p);
 assert.equal(awaiting.stage,2);assert.equal(awaiting.remainingPoints,0);
 const unconfigured=organizationHeadquartersState({points:275,stage:2},defaultOrganizationPolicy());
 assert.equal(unconfigured.stage,2);assert.equal(unconfigured.nextThreshold,null);assert.equal(unconfigured.configured,false);
 const spend=organizationHeadquartersState({points:0,stage:3},{...p,growthMode:'SPEND'});
 assert.equal(spend.stage,3);assert.equal(spend.name,'조직 본거지');assert.equal(spend.nextThreshold,null);
 const final=organizationHeadquartersState({points:2000,stage:5},p);
 assert.equal(final.nextStage,null);assert.equal(final.nextThreshold,null);assert.equal(final.contentEnabled,false);
});
async function assigned(t){
 const f=await organizationFixture(t,{people:31}),id=await f.prepare({enroll:30});
 await f.close(id);await f.rate(id);
 const proposal=await f.post('admin/organization/propose',{roundId:id});
 assert.equal(proposal.status,200);assert.equal((await f.post('admin/organization/apply',{roundId:id,proposalId:proposal.data.proposal.id})).status,200);
 return {f,id};
}
test('roster contains only the authenticated member’s organization and never leaks answers, preferences or seed power',async t=>{
 const {f,id}=await assigned(t);
 const state=(await f.call('organization/overview',{user:2})).data;
 assert.equal(state.roster.length,2);assert.equal(state.roster.filter(m=>m.isSelf).length,1);
 const expected=(await f.pg.query('SELECT user_id FROM organization_members_v1 WHERE round_id=$1 AND organization_id=$2 ORDER BY slot',[id,state.membership.organizationId])).rows.map(m=>Number(m.user_id));
 assert.deepEqual(state.roster.map(m=>m.userId),expected);
 for(const member of state.roster)assert.deepEqual(Object.keys(member).sort(),['isSelf','joinedAt','nickname','slot','userId']);
 const spoof=(await f.call('organization/overview?organizationId=15&userId=5',{user:2})).data;
 assert.deepEqual(spoof.roster,state.roster);
 const unassigned=(await f.call('organization/overview',{user:32})).data;
 assert.equal(unassigned.membership,null);assert.deepEqual(unassigned.roster,[]);
 assert.deepEqual((await f.call('admin/organization')).data.roster,[]);
 await f.pg.query('UPDATE organization_progress_v1 SET stage=3,points=765 WHERE round_id=$1 AND organization_id=$2',[id,state.membership.organizationId]);
 const updated=(await f.call('organization/overview',{user:2})).data.organizations[state.membership.organizationId-1];
 assert.equal(updated.hideout.stage,3);assert.equal(updated.hideout.points,765);assert.equal(updated.hideout.nextThreshold,null);
 const outsider=await f.pg.query('SELECT user_id FROM organization_members_v1 WHERE round_id=$1 AND organization_id<>$2 LIMIT 1',[id,state.membership.organizationId]);
 const other=(await f.call('organization/overview',{user:Number(outsider.rows[0].user_id)})).data;
 assert.ok(other.roster.every(m=>!expected.includes(m.userId)));
 await f.post('admin/organization/policy',{policy:{...(await f.call('admin/organization')).data.policy,testUserIds:[]}});
 assert.equal((await f.call('organization/overview',{user:2})).status,403);
});
test('PC/mobile show actual members and current headquarters, label future previews, and keep score reads side effect free',async t=>{
 const {f,id}=await assigned(t),initial=(await f.call('organization/overview',{user:2})).data;
 const policy=(await f.call('admin/organization')).data.policy;
 await f.post('admin/organization/policy',{policy:{...policy,growthMode:'CUMULATIVE',hideoutThresholds:[0,100,500,1000,2000]}});
 await f.pg.query('UPDATE organization_progress_v1 SET stage=2,points=275 WHERE round_id=$1 AND organization_id=$2',[id,initial.membership.organizationId]);
 const nickname='동료 <script>window.orgUnexpected=true</script>';
 await f.pg.query('UPDATE users SET nickname=$1 WHERE id=2',[nickname]);
 const before=(await f.pg.query('SELECT * FROM organization_progress_v1 ORDER BY organization_id')).rows;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const server=createServer(async(req,res)=>{try{
  const requested=new URL(req.url,'http://127.0.0.1').pathname,source=requested==='/'?'/preview/organization-system-v1/index.html':decodeURIComponent(requested),file=resolve(root,'.'+source),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)||!/^\/(preview\/organization-system-v1\/|js\/organization-|css\/organization-|shared\/organization-|assets\/ui\/organization\/|assets\/fonts\/)/.test(source)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port,out=process.env.ORG_HQ_QA_DIR||join(tmpdir(),'cnine-organization-headquarters-20261015');
 await mkdir(out,{recursive:true});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:980},reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>context.close());
  const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const req=route.request();if(req.method()!=='GET')writes.push(req.method());const result=await f.call(new URL(req.url()).pathname.slice(5),{user:2});await route.fulfill({status:result.status,json:result.data});});
  await f.pg.query('UPDATE users SET nickname=$1 WHERE id=2',[nickname]);await page.goto(origin);await page.locator('.org-member-slot').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.org-member-slot').count(),10);assert.equal(await page.locator('.is-vacant').count(),8);
  assert.equal(await page.locator('.org-member-slot.is-self b').innerText(),nickname);assert.equal(await page.evaluate(()=>window.orgUnexpected),undefined);
  assert.match(await page.locator('.org-headquarters-status').innerText(),/골목 사무실[\s\S]*275[\s\S]*225점 남음/);
  assert.equal(await page.locator('[data-stage="1"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-stage="1"]').evaluate(el=>getComputedStyle(el).backgroundSize),'100% 122%');
  assert.equal(await page.locator('[data-stage="1"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('.org-stage-status').innerText(),'현재 우리 조직의 아지트');
  await f.pg.query('UPDATE users SET nickname=$1 WHERE id=2',['검수 동료']);await page.reload();await page.locator('.org-member-slot').first().waitFor();
  const fits=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await fits();await page.screenshot({path:join(out,width+'-roster.jpg'),fullPage:true,type:'jpeg',quality:85});
  await page.locator('[data-tab="hideout"]').click();await page.locator('[data-stage="4"]').click();
  assert.equal(await page.locator('.org-stage-status').innerText(),'성장 단계 미리보기');
  assert.match(await page.locator('.org-headquarters-status h3').innerText(),/골목 사무실/);
  await page.getByRole('button',{name:'현재 아지트로 돌아가기'}).click();
  assert.equal(await page.locator('[data-stage="1"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-stage="1"]').evaluate(el=>getComputedStyle(el).backgroundSize),'100% 122%');
  assert.equal(await page.locator('[data-stage="1"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await fits();await page.screenshot({path:join(out,width+'-current-hideout.jpg'),fullPage:true,type:'jpeg',quality:85});
  assert.deepEqual(await page.locator('#organization-root button').evaluateAll(bs=>bs.filter(b=>getComputedStyle(b).backgroundImage==='none').map(b=>b.textContent)),[]);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await context.close();
 }
 assert.deepEqual((await f.pg.query('SELECT * FROM organization_progress_v1 ORDER BY organization_id')).rows,before);
 t.diagnostic('Next headquarters visual evidence: '+out);
});
