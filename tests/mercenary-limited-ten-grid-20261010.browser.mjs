import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/mercenary-limited-ten-grid-20261010');fs.mkdirSync(out,{recursive:true});
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/qa'){
  res.setHeader('content-type','text/html');return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0d0916"><script type="module">
  import {mountLimitedPack} from '/js/mercenary-limited-pack-live.mjs?v=20261010-grid';
  import {previewService,memoryStorage} from '/preview/mercenary-limited-pack-20261006-v1/fixture.mjs';
  const service=previewService(),storage=memoryStorage();window.gridQA={...service,mixed:false};
  const api=async(path,options)=>{const receipt=await service.api(path,options);if(options?.method==='POST'&&window.gridQA.mixed){receipt.draws.splice(0,3,{outcomeId:'MASTER_STAR',quantity:10000},{outcomeId:'MYSTIC_ENERGY',quantity:50},{outcomeId:'NONE',quantity:0});service.receipts.set(receipt.requestId,structuredClone(receipt));}return receipt;};
  await mountLimitedPack({api,storage,accountId:7,getAccountId:()=>7,preview:true});
  </script></html>`);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return res.writeHead(404).end();
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700}),page=await context.newPage(),errors=[],failed=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failed.push(r.url());});
  await page.goto(base+'/qa');await page.locator('[data-lp-canvas][data-state="ready"]').waitFor();
  await page.locator('[data-lp-buy="10"]').click();await page.locator('[data-lp-confirm-start]').click();
  await page.locator('[data-lp-results]').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-lp-buy="10"]').disabled);
  const checkGrid=async()=>{
   assert.equal(await page.locator('.lp-result-card').count(),10);
   await page.locator('.lp-result-card img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
   assert.equal(await page.locator('.lp-result-card img').evaluateAll(images=>images.every(img=>img.naturalWidth>0)),true);
   assert.equal(await page.locator('.lp-result-card').evaluateAll(cards=>cards.every(card=>{const r=card.getBoundingClientRect();return r.top>=document.querySelector('.lp-header').getBoundingClientRect().bottom&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})),true,'all ten pictures fit in one viewport');
   assert.equal(await page.locator('.lp-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  };
  await checkGrid();assert.equal(await page.locator('[data-lp-canvas]').getAttribute('data-state'),'ready','ten draws bypass the sequential renderer');assert.equal(await page.locator('[data-lp-canvas]').isHidden(),true);
  const firstGrid=await page.locator('[data-lp-result-grid]').innerText();await page.screenshot({path:path.join(out,label+'-ten-cards.png')});
  await page.locator('[data-lp-recover]').click();await page.waitForFunction(()=>!document.querySelector('[data-lp-recover]').disabled);
  assert.equal(await page.locator('[data-lp-result-grid]').innerText(),firstGrid);assert.equal(await page.evaluate(()=>gridQA.stats.opens),1,'recovery does not purchase again');
  await page.evaluate(()=>gridQA.mixed=true);await page.locator('[data-lp-total]').fill('20');await page.locator('[data-lp-auto]').click();await page.locator('[data-lp-confirm-start]').click();
  await page.waitForFunction(()=>gridQA.stats.opens===3&&!document.querySelector('[data-lp-auto]').disabled);await checkGrid();
  assert.equal(await page.locator('.lp-result-card[data-kind="MASTER_STAR"]').count(),1);assert.equal(await page.locator('.lp-result-card[data-kind="MYSTIC_ENERGY"]').count(),1);assert.equal(await page.locator('.lp-result-card[data-kind="MISS"]').count(),1);
  await page.screenshot({path:path.join(out,label+'-mixed-results.png')});
  await page.locator('[data-lp-total]').fill('30');await page.locator('[data-lp-auto]').click();await page.locator('[data-lp-confirm-start]').click();await page.waitForFunction(()=>gridQA.stats.opens===4&&document.querySelector('[data-lp-counter]').textContent==='RESULT 10 / 30');
  await page.locator('[data-lp-stop-stage]').click();await page.waitForFunction(()=>!document.querySelector('[data-lp-auto]').disabled);assert.equal(await page.evaluate(()=>gridQA.stats.opens),4,'stop prevents another ten-card purchase');
  await page.evaluate(()=>gridQA.mixed=false);await page.locator('[data-lp-buy="1"]').click();await page.locator('[data-lp-confirm-start]').click();await page.locator('[data-lp-skip]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-lp-results]').isHidden(),true);assert.equal(await page.locator('[data-lp-canvas]').isVisible(),true);await page.locator('[data-lp-skip]').click();await page.waitForFunction(()=>!document.querySelector('[data-lp-buy="1"]').disabled);
  assert.equal(await page.evaluate(()=>gridQA.stats.opens),5);assert.equal(await page.evaluate(()=>gridQA.stats.maxActive),1);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  reports.push({label,width,height,tenPicturesTogether:true,allTenInViewport:true,allImagesDecoded:true,noSequentialTenReveal:true,recoveryWithoutRepurchase:true,automaticTenBatches:true,stopBeforeNextBatch:true,mixedRewards:true,singleRevealPreserved:true,errors,failed});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:'PASSED',scope:'Actual live UI and opening session with isolated receipt fixtures; no production purchases',reports},null,2)+'\n');console.log(JSON.stringify({status:'PASSED',reports},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
