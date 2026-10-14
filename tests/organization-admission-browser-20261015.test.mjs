import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationFixture} from './helpers/organization-fixture.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=join(root,'preview/organization-system-v1/qa');

test('PC and mobile admission complete seven questions, restore drafts, submit, revise and allocate in isolated PostgreSQL',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());await mkdir(out,{recursive:true});
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname,requested=pathname==='/'?'/preview/organization-system-v1/index.html':decodeURIComponent(pathname),file=resolve(root,'.'+requested),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)||!/^\/(preview\/organization-system-v1\/|js\/organization-|css\/organization-|shared\/organization-|assets\/ui\/organization\/|assets\/fonts\/)/.test(requested)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [1440,390]){
  const f=await organizationFixture(t,{people:30}),roundId=await f.prepare({enroll:16});await f.post('organization/withdraw',{roundId,revision:1},{user:2});
  const page=await browser.newPage({viewport:{width,height:980},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>page.close());const errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname.slice(5),result=await f.call(path,{user:Number(req.headers()['x-qa-user']),method:req.method(),...(req.postData()?{body:req.postDataJSON()}:{})});await route.fulfill({status:result.status,json:result.data});});
  const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,width+'-'+name+'.jpg'),fullPage:true,type:'jpeg',quality:85});};
  const fits=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at '+width);
  const images=async()=>assert.deepEqual(await page.locator('#organization-root button').evaluateAll(buttons=>buttons.filter(b=>getComputedStyle(b).backgroundImage==='none').map(b=>b.textContent)),[],'Every button uses generated artwork');
  await page.goto(origin);await page.locator('[data-admission="start"]').waitFor();await page.evaluate(()=>document.fonts.ready);await fits();await images();await shot('invitation');
  await page.locator('[data-admission="start"]').click();assert.equal(await page.locator('[data-admission="next"]').isDisabled(),true);
  await page.locator('[data-answer="name"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-answer="crew"]').getAttribute('aria-checked'),'true');await fits();await images();await shot('question');
  await page.locator('[data-admission="next"]').click();await page.locator('[data-answer="cover"]').click();await page.reload();
  await page.locator('[data-admission="start"]').click();assert.match(await page.locator('#admission-question').innerText(),/불리해졌습니다/);
  for(const answer of ['regroup','system','foundation','members','promise']){await page.locator('[data-answer="'+answer+'"]').click();await page.locator('[data-admission="next"]').click();}
  assert.equal(await page.locator('.admission-dossier').count(),3);assert.equal(await page.locator('.admission-dossier h2').first().innerText(),'철권파');await fits();await images();await shot('recommendations');
  await page.locator('[data-admission-pick="4"]').click();await page.locator('[data-admission="submit"]').click();await page.locator('.admission-submitted').waitFor();
  let state=(await f.call('organization/overview',{user:2})).data;assert.equal(state.survey.preferredOrganizationId,4);assert.equal(Object.keys(state.survey.answers).length,7);assert.equal(state.survey.answers.motive,'crew');await shot('submitted');
  await page.locator('[data-admission="edit"]').click();await page.locator('[data-answer="name"]').click();await page.reload();
  await page.locator('[data-admission="start"]').click();await page.locator('[data-admission="review"]').click();assert.equal(await page.locator('[data-answer="name"]').getAttribute('aria-checked'),'true');
  for(let i=0;i<7;i++)await page.locator('[data-admission="next"]').click();
  await page.locator('[data-admission="all"]').click();assert.equal(await page.locator('.admission-all-organizations button').count(),15);await fits();await images();
  await page.locator('.admission-all-organizations [data-admission-pick="15"]').click();await page.locator('[data-admission="submit"]').click();await page.locator('.admission-submitted').waitFor();
  state=(await f.call('organization/overview',{user:2})).data;assert.equal(state.survey.preferredOrganizationId,15);assert.equal(state.survey.answers.motive,'name');
  await page.goto(origin+'/?view=owner');await page.locator('[data-action="phase"]').click();await page.waitForFunction(()=>!document.querySelector('[data-action="rate"]').disabled);
  await page.locator('[data-action="rate"]').click();await page.waitForFunction(()=>!document.querySelector('[data-action="propose"]').disabled);
  await page.locator('[data-action="propose"]').click();await page.waitForFunction(()=>!document.querySelector('[data-action="apply"]').disabled);
  await fits();await images();await page.locator('[data-action="apply"]').click();await page.waitForFunction(()=>document.querySelector('[data-action="apply"]').textContent==='배정 확정 완료');
  assert.equal((await f.call('admin/organization')).data.round.phase,'ASSIGNED');
  await page.goto(origin);await page.locator('.org-my-head').waitFor();await fits();await images();
  await page.locator('[data-tab="hideout"]').click();await page.locator('[data-stage="4"]').click();await fits();await images();await shot('hideout');
  assert.deepEqual(errors,[]);await page.close();
 }
 t.diagnostic('Visual QA saved to '+out);
});
