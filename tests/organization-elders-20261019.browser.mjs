import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=process.env.ORGANIZATION_FACTION_QA_DIR;
test('three elder names and equal formation controls render on PC/mobile before combat opens',async t=>{
 assert(out,'External QA directory required');await mkdir(out,{recursive:true});
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host),file=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [1440,390]){
  const f=await organizationFactionFixture(t);assert.equal((await f.post('admin/organization/faction/elders',{organizationId:1,userIds:[2,3,4],baseUserIds:[2]},1)).status,200);f.advance(7*3600000);
  const page=await browser.newPage({viewport:{width,height:950},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});t.after(()=>page.close());let user=2;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),result=await f.call(url.pathname.slice(5)+url.search,{method:req.method(),body:req.postDataJSON()||undefined,user});await route.fulfill({status:result.status,json:result.data});});
  for(user=2;user<=4;user++){
   await page.goto(origin+'/organization/faction/?roundId='+f.roundId);await page.locator('.fw-tabs [data-fw-tab="formation"]').click();
   await page.locator('[data-fw-save]').waitFor();assert.equal(await page.locator('[data-fw-save]').isEnabled(),true);
   const label=await page.locator('.fw-command-role').innerText();for(const n of ['001','002','003'])assert.match(label,new RegExp('검수 참가자 '+n));assert.match(label,/원로/);assert.doesNotMatch(label,/지휘관|집행관/);
   assert.equal(await page.locator('[data-fw-captain]').count(),2);assert.equal(await page.locator('[data-fw-add="'+user+'"]').isEnabled(),true);await page.locator('[data-fw-add="'+user+'"]').click();
   const write=page.waitForResponse(r=>r.url().includes('/api/organization/faction/formation')&&r.request().method()==='POST');await page.locator('[data-fw-save]').click();assert.equal((await write).status(),200);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.screenshot({path:join(out,width+'-elder-formation.png'),fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }
});
