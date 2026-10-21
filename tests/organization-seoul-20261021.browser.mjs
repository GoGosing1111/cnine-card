import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=join(tmpdir(),'cnine-organization-seoul-20261021');
test('desktop and mobile show 25 neutral Seoul districts with a fitted map, usable selection and no overflow',async t=>{
 const f=await organizationFactionFixture(t);
 await f.mutateState(s=>s.events.unshift({id:'qa-reset',kind:'MAP_RESET',at:f.clock(),by:'운영'}));
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;const result=await f.call(url.pathname.slice(5)+url.search,{method:req.method,body:body?JSON.parse(body):undefined});res.writeHead(result.status,{'Content-Type':'application/json'}).end(JSON.stringify(result.data));return;}
  const file=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'),browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());await mkdir(out,{recursive:true});const checks=[];
 for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<721,hasTouch:width<721,serviceWorkers:'block'}),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','isolated-review'));await page.goto('http://127.0.0.1:'+server.address().port+'/organization/faction/?roundId='+f.roundId+'&window=1');
  await page.locator('[data-fw-zone="11680"]').waitFor();assert.equal(await page.locator('.fw-zone').count(),25);assert.equal(await page.locator('[data-fw-zone][data-area="GYEONGGI_SOUTH"]').count(),0);assert.equal(await page.locator('[data-fw-district-select] option').count(),25);
  assert.match(await page.locator('.fw-command-summary').innerText(),/0\s*\/\s*25/);assert.match(await page.locator('.fw-map-panel h3').innerText(),/서울 25개 구/);assert.doesNotMatch(await page.locator('body').innerText(),/경기남부|수도권|\/ 46/);
  const map=page.locator('.fw-seoul-map'),initial=await map.getAttribute('viewBox');assert(Number(initial.split(' ')[2])<400);
  const geometry=await map.evaluate(svg=>{const box=svg.getBoundingClientRect();return [...svg.querySelectorAll('.fw-zone')].map(g=>{const b=g.getBoundingClientRect();return {id:g.dataset.fwZone,inside:b.left>=box.left-1&&b.right<=box.right+1&&b.top>=box.top-1&&b.bottom<=box.bottom+1,neutral:g.getAttribute('aria-label').includes('무주지')};});});assert(geometry.every(g=>g.inside&&g.neutral));
  if(width<721)await page.locator('[data-fw-district-select]').selectOption('11710');else await page.locator('[data-fw-zone="11710"]').press('Enter');assert.equal(await page.locator('.fw-detail h2').innerText(),'송파구');await page.locator('[data-fw-focus="selected"]').click();assert.notEqual(await map.getAttribute('viewBox'),initial);await page.locator('[data-fw-focus="all"]').click();assert.equal(await map.getAttribute('viewBox'),initial);
  await page.locator('.fw-map-scroll').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,width+'-seoul-map.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  await page.locator('[data-fw-tab="log"]').first().click();assert.match(await page.locator('.fw-log').innerText(),/서울 전장 · 점령 초기화/);
  checks.push({width,height,districts:25,neutral:25,geometry,errors,failed});await page.close();
 }
 await writeFile(join(out,'checks.json'),JSON.stringify(checks,null,2));
});
