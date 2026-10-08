import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out='preview/mercenary-limited-daily-20261008';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/daily-qa'){
  res.setHeader('content-type','text/html');return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>리미티드팩 일일 제한 검수</title><body style="background:#0d0916"><script type="module">'+
   `import {mountLimitedPack} from '/js/mercenary-limited-pack-live.mjs';
    import {previewState,memoryStorage} from '/preview/mercenary-limited-pack-20261006-v1/fixture.mjs';
    import {limitedDailyStatus,limitedDailyLimitError} from '/shared/mercenary-limited-daily-v1.mjs';
    const state=previewState();state.daily=limitedDailyStatus(2995);state.packSettings.prices={single:1000000000,ten:10000000000};
    window.qa={state,posts:0};
    await mountLimitedPack({preview:true,accountId:7,getAccountId:()=>7,storage:memoryStorage(),api:async(path,{body}={})=>{
     if(path.endsWith('/config'))return structuredClone(state);
     if(!path.endsWith('/open'))throw Error('Unexpected fixture request');
     if(body.count>state.daily.remaining)throw limitedDailyLimitError(state.daily.remaining);
     qa.posts++;state.daily=limitedDailyStatus(state.daily.used+body.count);
     return {status:'COMPLETED',accountId:7,requestId:body.requestId,count:body.count,coin:'0',coinCost:1000000000,draws:Array.from({length:body.count},()=>({outcomeId:'NONE',quantity:0})),daily:structuredClone(state.daily)};
    }});`+'</script></body></html>');
 }
 const file=path.resolve(root,'.'+u.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),errors=[],checks=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/daily-qa');
  await page.waitForSelector('[data-lp-canvas][data-state=ready]');
  assert.equal(await page.locator('[data-lp-daily]').innerText(),'5 / 3,000개');
  assert.equal(await page.locator('[data-lp-buy="10"]').isDisabled(),true);
  assert.equal(await page.locator('[data-lp-buy="1"]').isEnabled(),true);
  await page.locator('[data-lp-total]').fill('6');assert.equal(await page.locator('[data-lp-auto]').isDisabled(),true);
  await page.locator('[data-lp-total]').fill('5');assert.equal(await page.locator('[data-lp-auto]').isEnabled(),true);
  await page.locator('[data-lp-auto]').click();assert.ok((await page.locator('[data-lp-confirm-text]').innerText()).includes('5회'));await page.locator('[data-lp-cancel]').click();
  await page.locator('.lp-daily').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.lp-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await page.screenshot({path:out+'/'+name+'-remaining.png'});
  await page.evaluate(async()=>{const {limitedDailyStatus}=await import('/shared/mercenary-limited-daily-v1.mjs');qa.state.daily=limitedDailyStatus(2999);document.querySelector('[data-lp-refresh]').click();});
  await page.waitForFunction(()=>document.querySelector('[data-lp-daily]').textContent==='1 / 3,000개');
  await page.locator('[data-lp-buy="1"]').click();await page.locator('[data-lp-confirm-start]').click();
  await page.waitForFunction(()=>document.querySelector('[data-lp-daily]').textContent==='0 / 3,000개');
  await page.waitForFunction(()=>!document.querySelector('[data-lp-recover]').disabled);
  assert.equal(await page.locator('[data-lp-buy="1"]').isDisabled(),true);assert.equal(await page.locator('[data-lp-auto]').isDisabled(),true);
  assert.equal(await page.evaluate(()=>qa.posts),1);
  await page.locator('.lp-daily').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+name+'-exhausted.png'});
  // Simulate the server's next-day response; no real account is used.
  await page.evaluate(async()=>{const {limitedDailyStatus}=await import('/shared/mercenary-limited-daily-v1.mjs');qa.state.daily=limitedDailyStatus(0);document.querySelector('[data-lp-refresh]').click();});
  await page.waitForFunction(()=>document.querySelector('[data-lp-daily]').textContent==='3,000 / 3,000개');
  assert.equal(await page.locator('[data-lp-buy="10"]').isEnabled(),true);
  await page.locator('[data-lp-close]').click();assert.equal(await page.locator('.lp-dialog').count(),0);
  checks.push(name+': remaining count, bundle limit, automatic plan, last opening, exhausted controls, reset, cleanup, no horizontal overflow');await page.close();
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/browser-review.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:true,fixture:'synthetic account; actual live contract component and Pixi renderer',checks,errors},null,2));
 console.log(JSON.stringify({passed:true,checks,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
