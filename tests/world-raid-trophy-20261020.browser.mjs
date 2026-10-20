import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.TROPHY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],responses=[];
try{
 for(const width of [1440,390,340]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:width===1440?'no-preference':'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))responses.push({url:r.url(),status:r.status()});});
  try{
   await page.goto('http://127.0.0.1:'+server.address().port+'/preview/player-calling-card-v2052/index.html');
   await page.locator('.pc-card').waitFor();await page.evaluate(()=>document.fonts.ready);
   const count=page.locator('[data-pc-shelf-count]'),next=page.locator('[data-pc-page=next]'),prev=page.locator('[data-pc-page=prev]');
   assert.equal(await count.textContent(),'1 / 3');await next.click();await next.click();assert.equal(await count.textContent(),'3 / 3');assert.equal(await next.isDisabled(),true);
   const shelf=page.locator('[data-pc-shelf]:not([hidden])'),dragon=shelf.locator('[data-pc-trophy="8"]');
   assert.equal(await shelf.locator('[data-pc-trophy]').count(),1);
   await dragon.locator('img').evaluate(img=>img.decode());assert.equal(await dragon.locator('img').evaluate(img=>img.naturalWidth),512);
   assert.match(await dragon.textContent(),/드래곤 슬레이어[\s\S]*월드레이드 격파 5,000회[\s\S]*누적 5,000 \/ 5,000회/);
   await dragon.click();assert.equal(await dragon.getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('#pc-trophy-detail').textContent(),/드래곤 슬레이어[\s\S]*2026\.\s*10\.\s*20[\s\S]*누적 5,000 \/ 5,000회/);
   await shelf.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-dragon-owned.png')});
   await page.locator('#pc-trophy-detail').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-dragon-detail.png')});
   assert.equal(await shelf.evaluate(el=>{const r=el.getBoundingClientRect(),d=document.querySelector('#player-card-dialog');return r.left>=0&&r.right<=innerWidth+1&&d.scrollWidth<=d.clientWidth+1;}),true);
   const bounds=await dragon.boundingBox();assert.ok(bounds.width>=44&&bounds.height>=44);
   await prev.focus();await page.keyboard.press('Enter');assert.equal(await count.textContent(),'2 / 3');assert.match(await page.locator('#pc-trophy-detail').textContent(),/기록으로 증명/);
   await page.locator('[data-pc-close]').click();await page.locator('#newcomer').click();await next.click();await next.click();
   assert.match(await dragon.getAttribute('class'),/is-locked/);assert.match(await dragon.textContent(),/미획득[\s\S]*누적 0 \/ 5,000회/);
   await dragon.click();assert.match(await page.locator('#pc-trophy-detail').textContent(),/미획득[\s\S]*누적 0 \/ 5,000회/);
   await shelf.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-dragon-locked.png')});
   await page.keyboard.press('Escape');assert.equal(await page.locator('#player-card-dialog').isVisible(),false);
   checks.push({width,owned:true,locked:true,alphaAssetLoaded:true,pagination:3,noHorizontalOverflow:true,touchTarget:true,keyboard:true});
  }catch(e){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});throw e;}finally{await page.close();}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(responses,[]);
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,responses,environment:'Chrome / actual player-card UI / isolated preview profiles; user visual approval remains separate'},null,2));
 console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
