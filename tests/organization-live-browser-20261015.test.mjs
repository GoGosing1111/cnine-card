import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {handleOrganization} from '../functions/_organization.js';
import {ORGANIZATION_INTERVIEW,reviewOrganizationAnswers} from '../shared/organization-interview-v1.mjs';
import {ORGANIZATION_RECRUITMENT_MS} from '../shared/organization-system-v1.mjs';

test('PC/mobile complete all seven LIVE questions, persist the real application and enforce the deadline with HD art',async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const out=process.env.ORG_LIVE_QA_DIR||join(tmpdir(),'cnine-organization-live-20261015');
 await mkdir(out,{recursive:true});
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const verification=[];
 for(const width of [1440,390]){
  const f=await organizationFixture(t),serverErrors=[],apiCalls=[],errors=[];
  const created=await f.post('admin/organization/create',{scope:'LIVE',name:'격리된 브라우저 접수 검수'}),roundId=created.data.roundId;
  assert.equal(created.status,200);
  assert.equal((await f.post('admin/organization/phase',{roundId,revision:0,phase:'SURVEY',autoAssign:true})).status,200);
  const token='isolated-organization-applicant-'+width;
  const deps={...f.deps,authenticate:async request=>request.headers.get('Authorization')==='Bearer '+token?(await f.pg.query('SELECT * FROM users WHERE id=2')).rows[0]:null};
  const server=createServer(async(req,res)=>{try{
   const url=new URL(req.url,'http://'+req.headers.host);
   if(url.pathname.startsWith('/api/')){
    let body='';for await(const chunk of req)body+=chunk;
    const path=url.pathname.slice(5);apiCalls.push({path,method:req.method,body:body?JSON.parse(body):null});
    const response=await handleOrganization({path,request:new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),env:f.env,deps});
    if(!response){res.writeHead(404).end();return;}
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
   }
   const requested=decodeURIComponent(url.pathname),source=requested==='/organization/'?'/organization/index.html':requested,file=resolve(root,'.'+source),rel=relative(root,file);
   if(rel.startsWith('..')||isAbsolute(rel)||!/^\/(organization\/|js\/organization-|css\/organization-|shared\/organization-|assets\/ui\/organization\/|assets\/fonts\/)/.test(source)){res.writeHead(404).end();return;}
   res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');
   res.end(await readFile(file));
  }catch(error){serverErrors.push(error.message);res.writeHead(500).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>context.close());
  await context.addInitScript(token=>{localStorage.setItem('cnine_card_api_token',token);localStorage.setItem('cnine_battle_sound','OFF');},token);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install();
  const fits=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at '+width+'px');
  const settled=async()=>page.waitForFunction(()=>document.querySelector('#organization-root')?.getAttribute('aria-busy')==='false');
  await page.goto(origin+'/organization/');await page.locator('[data-admission="start"]').waitFor();await settled();
  assert.match(await page.locator('.org-recruitment').innerText(),/조직 입단 접수 중/);
  assert.match(await page.locator('[data-org-countdown]').innerText(),/^(24:00:00|23:59:\d{2})$/);
  assert.equal(await page.locator('[data-tab="manage"]').count(),0);
  await fits();await page.screenshot({path:join(out,width+'-invitation.jpg'),fullPage:true,type:'jpeg',quality:88});
  await page.locator('[data-admission="start"]').click();
  const answers={};
  for(let index=0;index<ORGANIZATION_INTERVIEW.length;index++){
   const q=ORGANIZATION_INTERVIEW[index],option=q.options[(index+(width<600?1:0))%4];answers[q.id]=option.id;
   assert.equal(await page.locator('#admission-question').innerText(),q.title);
   assert.equal(await page.locator('[data-answer]').count(),4);
   assert.equal(await page.locator('[data-admission="next"]').isDisabled(),true);
   await page.locator('[data-answer="'+option.id+'"]').click();
   assert.equal(await page.locator('[data-answer="'+option.id+'"]').getAttribute('aria-checked'),'true');
   assert.equal(await page.locator('[data-admission="next"]').isDisabled(),false);
   await fits();
   if(index===3)await page.screenshot({path:join(out,width+'-question.jpg'),fullPage:true,type:'jpeg',quality:88});
   await page.locator('[data-admission="next"]').click();
  }
  await page.locator('.admission-results').waitFor();
  const review=reviewOrganizationAnswers(answers),preferred=review.recommendations[0].id;
  assert.equal(await page.locator('.admission-dossier').count(),3);
  assert.equal(await page.locator('.admission-dossier.selected [data-admission-pick]').getAttribute('data-admission-pick'),String(preferred));
  assert.equal(apiCalls.filter(call=>call.method==='POST').length,0,'Answering and recommendations remain local until submit');
  await fits();await page.screenshot({path:join(out,width+'-recommendations.jpg'),fullPage:true,type:'jpeg',quality:88});
  await page.locator('[data-admission="submit"]').click();
  await page.locator('.admission-submitted').waitFor();await settled();
  const submitted=apiCalls.filter(call=>call.path==='organization/survey'&&call.method==='POST');
  assert.equal(submitted.length,1);assert.deepEqual(submitted[0].body.answers,answers);assert.equal(submitted[0].body.preferredOrganizationId,preferred);
  let rows=(await f.pg.query('SELECT * FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=2',[roundId])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].active,1);assert.equal(Number(rows[0].preferred_id),preferred);assert.deepEqual(JSON.parse(rows[0].answers_json),answers);
  await page.reload();await page.locator('.admission-submitted').waitFor();
  await page.locator('.admission-answer-record summary').click();assert.equal(await page.locator('.admission-answer-record li').count(),7);
  for(let i=0;i<7;i++)assert.equal(await page.locator('.admission-answer-record li p').nth(i).innerText(),ORGANIZATION_INTERVIEW[i].options.find(o=>o.id===answers[ORGANIZATION_INTERVIEW[i].id]).label);
  await fits();await page.screenshot({path:join(out,width+'-submitted.jpg'),fullPage:true,type:'jpeg',quality:88});
  await page.locator('[data-tab="hideout"]').click();
  for(const stage of [0,1,2,3,4]){
   await page.locator('[data-stage="'+stage+'"]').click();await page.locator('img.org-building').evaluate(img=>img.decode());
   const image=await page.locator('img.org-building').evaluate(async img=>{const bitmap=await createImageBitmap(await(await fetch(img.currentSrc)).blob());const result={source:img.currentSrc,width:bitmap.width,height:bitmap.height,displayWidth:img.clientWidth};bitmap.close();return result;});
   assert.match(image.source,new RegExp('hideout-stage-'+(stage+1)+'-(960|1536)\\.webp'));assert.ok(image.width>=960);assert.ok(image.width>=image.displayWidth);
   await fits();
  }
  await page.screenshot({path:join(out,width+'-hideout-hd.jpg'),fullPage:true,type:'jpeg',quality:90});
  await page.locator('[data-tab="survey"]').click();await page.locator('.admission-submitted').waitFor();
  f.advance(ORGANIZATION_RECRUITMENT_MS-5000);
  await page.reload();await page.locator('.admission-submitted').waitFor();assert.match(await page.locator('[data-org-countdown]').innerText(),/00:00:0[45]/);
  f.advance(5500);await page.clock.fastForward(5500);
  assert.match(await page.locator('.org-recruitment').innerText(),/모집 마감/);
  assert.equal(await page.locator('[data-admission="edit"]').isDisabled(),true);assert.equal(await page.locator('[data-admission="withdraw"]').isDisabled(),true);
  await page.locator('[data-admission="results"]').click();
  assert.equal(await page.locator('[data-admission="submit"]').isDisabled(),true);
  const priorWrites=apiCalls.filter(call=>call.method==='POST').length;
  await page.locator('[data-admission="submit"]').evaluate(button=>{button.disabled=false;button.click();});
  assert.equal(apiCalls.filter(call=>call.method==='POST').length,priorWrites,'A forged button cannot submit after the client deadline');
  const late=await page.evaluate(async({token,roundId,answers,preferred})=>{const response=await fetch('/api/organization/survey',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),roundId,revision:1,answers,preferredOrganizationId:preferred})});return{status:response.status,data:await response.json()};},{token,roundId,answers,preferred});
  assert.equal(late.status,409);assert.equal(late.data.code,'ORG_SURVEY_CLOSED');
  await page.reload();await page.locator('.admission-submitted').waitFor();assert.equal(await page.locator('[data-admission="edit"]').isDisabled(),true);
  rows=(await f.pg.query('SELECT * FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=2',[roundId])).rows;
  assert.equal(rows.length,1);assert.equal(Number(rows[0].revision),1);assert.deepEqual(JSON.parse(rows[0].answers_json),answers);
  await fits();await page.screenshot({path:join(out,width+'-closed.jpg'),fullPage:true,type:'jpeg',quality:88});
  assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);
  verification.push({width,questions:7,submitted:true,persistedAfterReload:true,lateRequestBlocked:true,hideoutStages:5,minimumImageWidth:960,pageErrors:errors,serverErrors});
  await context.close();
 }
 await writeFile(join(out,'verification.json'),JSON.stringify({scope:'Isolated PostgreSQL-compatible fixture, real organization HTTP handlers and production UI; no live account or production writes',checks:verification},null,2)+'\n');
 t.diagnostic('LIVE admission visual evidence: '+out);
});
