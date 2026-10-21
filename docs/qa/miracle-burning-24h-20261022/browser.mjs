import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url))),out=fileURLToPath(new URL('./',import.meta.url));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
  await page.goto('http://127.0.0.1:'+server.address().port+'/preview/miracle-burning-v1/admin.html');
  await page.waitForFunction(()=>document.querySelectorAll('#miracleDuration option').length===26);
  const options=await page.locator('#miracleDuration option').evaluateAll(nodes=>nodes.map(n=>({value:Number(n.value),label:n.textContent})));
  assert.deepEqual(options.map(n=>n.value),[10,30,...Array.from({length:24},(_,hour)=>(hour+1)*60)]);
  assert.equal(options.at(-1).label,'24시간');
  await page.locator('#miracleDuration').selectOption('1440');await page.locator('#miracleMultiplier').fill('300');await page.locator('#miracleEnabled').selectOption('1');
  await page.locator('#miracleForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#miracleSaveState').textContent==='미라클 버닝이 발동되었습니다.');
  assert.match(dialogs[0],/24시간 동안/);
  const saved=await page.evaluate(async()=>(await (await fetch('../api/admin/miracle-burning-event')).json()).settings);
  assert.equal(saved.durationMinutes,1440);assert.equal(Date.parse(saved.endsAt)-Date.parse(saved.activatedAt),86400000);
  const countdown=await page.locator('#miracleCmsState').textContent();assert.match(countdown,/ON · (24:00:00|23:59:5\d)/);
  await page.evaluate(()=>window.dispatchEvent(new Event('soop:burning-updated')));
  await page.waitForFunction(()=>document.querySelector('#miracleSaveState').textContent==='서버 설정과 동기화되었습니다.');
  assert.equal(await page.locator('#miracleDuration').inputValue(),'1440');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert(overflow<=1);
  const frame=await page.locator('#miracleDuration').evaluate(n=>getComputedStyle(n).borderImageSource);assert.match(frame,/celestial-control-frame-20261021.webp/);
  await page.screenshot({path:path.join(out,width+'-cms.png'),fullPage:true});
  await page.locator('#miraclePreview').click();await page.locator('#burningActivationNotice.show').waitFor();
  assert.equal(await page.locator('[data-burning-countdown]').textContent(),'24시간 · 미리보기');
  await page.screenshot({path:path.join(out,width+'-preview.png')});
  checks.push({width,options:options.length,durationMinutes:1440,durationMs:86400000,countdown,save:true,reload:true,preview:'24시간',horizontalOverflow:overflow,frame,actualServerWrites:0});
  await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({widths:checks.map(c=>c.width),errors,actualServerWrites:0}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
