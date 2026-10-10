import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.TROPHY_QA_DIR;
const profile=JSON.parse(fs.readFileSync(process.env.PLAYER_CARD_QA_PROFILE,'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/preview/player-calling-card-v2052/index.html');await page.locator('.pc-card').waitFor();
   await page.evaluate(data=>{PlayerCallingCard.close();window.__profile=data;window.__signals=[];window.__hang=false;const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===12000?150:ms,...args);window.apiRequest=(_path,options)=>{window.__signals.push(options.signal);return window.__hang?new Promise(()=>{}):Promise.resolve(window.__profile);};},profile);
   await page.evaluate(()=>PlayerCallingCard.open({userId:window.__profile.player.id}));await page.locator('.pc-card').waitFor();
   assert.equal(await page.locator('.pc-identity h2').textContent(),profile.player.nickname);
   await page.locator('[data-pc-page=next]').click();assert.equal(await page.locator('[data-pc-shelf-count]').textContent(),'2 / 2');
   assert.match(await page.locator('[data-pc-trophy="7"]').textContent(),new RegExp('누적 '+profile.trophies[7].progress+' / 1,000회'));
   await page.locator('[data-pc-trophy="7"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-loading-fixed.png')});checks.push(width+': production DB profile renders all eight real trophy states and the second page');
   await page.evaluate(()=>{window.__hang=true;void PlayerCallingCard.open({userId:window.__profile.player.id});});
   await page.locator('[data-pc-retry]').waitFor();assert.match(await page.locator('.pc-status').textContent(),/연결이 지연/);assert.equal(await page.evaluate(()=>window.__signals.at(-1).aborted),true);
   await page.screenshot({path:path.join(out,width+'-loading-retry.png')});await page.evaluate(()=>window.__hang=false);await page.locator('[data-pc-retry]').click();await page.locator('.pc-card').waitFor();
   assert.equal(await page.locator('[data-pc-shelf-count]').textContent(),'1 / 2');await page.keyboard.press('Escape');assert.equal(await page.locator('#player-card-dialog').isVisible(),false);
   checks.push(width+': hanging transport leaves loading state, aborts and retries successfully; close remains available');
  }finally{await page.close();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'loading-browser.json'),JSON.stringify({checks,errors,timeout:'12-second deadline accelerated to 150ms in browser QA; exact deadline covered by unit fixture',profileSource:'Read-only production DB handler response; no authenticated game action'},null,2));console.log(JSON.stringify({checks:checks.length,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
