import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=join(root,'preview/organization-faction-v2/qa');
test('organization faction desktop and mobile map, formation, fund ledger and stable refresh use isolated accounts',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());await mkdir(out,{recursive:true});
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host),requested=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,file=resolve(root,'.'+decodeURIComponent(requested)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [1440,390]){
  const f=await organizationFactionFixture(t);
  await f.post('organization/faction/formation',{formation:{attack1:[2,3],attack2:[],defense1:[4,5,6],defense2:[]}});
  const page=await browser.newPage({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',serviceWorkers:'block'});t.after(()=>page.close());const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),result=await f.call(url.pathname.slice(5)+url.search,{method:route.request().method(),body:route.request().postDataJSON()||undefined});
   await route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.data)});
  });
  await page.goto(origin+'/organization/faction/?roundId='+f.roundId);
  await page.locator('[data-fw-zone="41110"]').waitFor();assert.equal(await page.locator('[data-fw-zone]').count(),46);
  const paints=await page.locator('.fw-zone > path:first-of-type').evaluateAll(nodes=>nodes.map(node=>({fill:getComputedStyle(node).fill,stroke:getComputedStyle(node).stroke})));
  assert.ok(paints.every(p=>p.fill!=='rgb(0, 0, 0)'&&p.stroke!=='none'),'every region has visible territory fill and border');
  assert.notEqual(await page.locator('.fw-zone.selected > path:first-of-type').evaluate(n=>getComputedStyle(n).stroke),paints[0].stroke,'selected territory has its own outline');
  await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
  assert.match(await page.locator('.fw-map-panel h3').innerText(),/경기남부 21/);
  await page.screenshot({path:join(out,width+'-map.png'),fullPage:true});
  const fullBox=await page.locator('.fw-seoul-map').getAttribute('viewBox');
  await page.locator('[data-fw-focus=seoul]').first().click();
  const seoulBox=await page.locator('.fw-seoul-map').getAttribute('viewBox');assert.notEqual(seoulBox,fullBox);
  assert.ok(Number(seoulBox.split(' ')[2])<450,'Seoul focus uses same coordinates at a closer view');
  assert.equal(await page.locator('[data-fw-zone]').count(),46);
  assert.equal(await page.locator('.fw-map-labels text').count(),46);
  await page.screenshot({path:join(out,width+'-seoul.png'),fullPage:true});
  await page.locator('[data-fw-focus=all]').first().click();assert.equal(await page.locator('.fw-seoul-map').getAttribute('viewBox'),fullBox);
  if(width===390)await page.locator('[data-fw-district-select]').selectOption('41110');else await page.locator('[data-fw-zone="41110"]').click();
  assert.equal(await page.locator('.fw-detail h2').innerText(),'수원시');
  assert.ok(Number((await page.locator('.fw-seoul-map').getAttribute('viewBox')).split(' ')[2])<300,'region selection centers and zooms to its true boundary');
  await page.screenshot({path:join(out,width+'-selected.png'),fullPage:true});
  await page.locator('[data-fw-launch]').click();await page.waitForFunction(()=>document.querySelector('.fw-detail .fw-owner strong')?.textContent==='도끼파');
  const replayNode=await page.locator('.fw-seoul-map').elementHandle();
  await page.locator('[data-fw-reload]').first().click();
  await page.waitForTimeout(350);
  assert.equal(await replayNode.evaluate(node=>node.isConnected),true,'unchanged refresh keeps the same map node');
  await page.locator('[data-fw-tab="formation"]').first().click();assert.equal(await page.locator('.fw-member-slot.filled').count(),5);
  await page.locator('[data-fw-tab="treasury"]').first().click();await page.locator('.fw-org-funds').waitFor();
  assert.match(await page.locator('.fw-org-funds').innerText(),/CMS 설정 대기/);
  assert.match(await page.locator('.fw-treasury').innerText(),/46개/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(out,width+'-treasury.png'),fullPage:true});
  assert.deepEqual(errors,[]);await page.close();
 }
 t.diagnostic('Screenshots: '+out);
});
