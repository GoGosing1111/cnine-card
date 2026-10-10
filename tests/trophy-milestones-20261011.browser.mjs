import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.TROPHY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],responses=[];
try{
 for(const width of [1440,390,340]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))responses.push({url:r.url(),status:r.status()});});
  try{
   await page.goto(origin+'/preview/player-calling-card-v2052/index.html');await page.locator('.pc-card').waitFor();await page.evaluate(()=>document.fonts.ready);
   const count=page.locator('[data-pc-shelf-count]'),next=page.locator('[data-pc-page=next]'),prev=page.locator('[data-pc-page=prev]');
   assert.equal(await count.textContent(),'1 / 2');assert.equal(await prev.isDisabled(),true);
   assert.equal(await page.locator('[data-pc-shelf]:not([hidden]) [data-pc-trophy]').count(),4);
   await page.screenshot({path:path.join(out,width+'-page1.png')});
   await next.click();assert.equal(await count.textContent(),'2 / 2');assert.equal(await next.isDisabled(),true);
   const shelf=page.locator('[data-pc-shelf]:not([hidden])');assert.equal(await shelf.locator('[data-pc-trophy]').count(),4);
   assert.equal(await shelf.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth===512)),true);
   const outlaw=shelf.locator('[data-pc-trophy="6"]'),sword=shelf.locator('[data-pc-trophy="7"]');
   assert.match(await outlaw.textContent(),/도시의 무법자[\s\S]*누적 25 \/ 25회/);assert.match(await sword.textContent(),/서리한[\s\S]*누적 1,000 \/ 1,000회/);
   await outlaw.click();assert.match(await page.locator('#pc-trophy-detail').textContent(),/도시의 무법자[\s\S]*2026\.\s*10\.\s*11[\s\S]*누적 25 \/ 25회/);
   await sword.click();assert.match(await page.locator('#pc-trophy-detail').textContent(),/서리한[\s\S]*2026\.\s*10\.\s*11[\s\S]*누적 1,000 \/ 1,000회/);
   await shelf.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-page2.png')});
   const fits=await shelf.evaluate(el=>{const d=document.querySelector('#player-card-dialog'),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&d.scrollWidth<=d.clientWidth+1;});assert.equal(fits,true);
   checks.push(width+': four trophies per page; both new illustrations, progress, acquired date and correct detail; no horizontal clipping');
   await page.locator('[data-pc-tab=history]').click();assert.equal(await page.locator('#pc-history-panel').isVisible(),true);
   await page.locator('[data-pc-tab=honors]').click();assert.equal(await count.textContent(),'2 / 2');
   await prev.focus();await page.keyboard.press('Enter');assert.equal(await count.textContent(),'1 / 2');assert.equal(await prev.isDisabled(),true);
   assert.match(await page.locator('#pc-trophy-detail').textContent(),/기록으로 증명/);
   checks.push(width+': keyboard previous navigation, disabled end buttons and season tab preserve valid page/selection state');
   await page.locator('[data-pc-close]').click();await page.locator('#newcomer').click();assert.equal(await count.textContent(),'1 / 2');await next.click();
   assert.equal(await shelf.locator('.is-locked').count(),4);assert.match(await shelf.locator('[data-pc-trophy="6"]').textContent(),/누적 0 \/ 25회/);
   await shelf.locator('[data-pc-trophy="7"]').click();assert.match(await page.locator('#pc-trophy-detail').textContent(),/미획득[\s\S]*누적 0 \/ 1,000회/);
   await shelf.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-locked.png')});
   await page.keyboard.press('Escape');assert.equal(await page.locator('#player-card-dialog').isVisible(),false);await page.locator('#veteran').click();assert.equal(await count.textContent(),'1 / 2');
   checks.push(width+': locked achievements show real zero progress; close, account change and reopen reset to the first page');
  }catch(e){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});throw e;}finally{await page.close();}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(responses,[]);
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,responses,environment:'Chrome at 1440, 390 and 340 pixels; real player-card UI with isolated preview profiles'},null,2));console.log(JSON.stringify({checks:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
