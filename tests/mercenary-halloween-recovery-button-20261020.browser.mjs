import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root=process.cwd(),out=process.env.QA_OUT||'C:/Users/User/.codex/tmp/jokgeida-halloween-stuck-20261020/browser';
fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/qa'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  return res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#080c17}</style><script type="module">
   import {mountHalloweenPack} from '/js/mercenary-halloween-pack-live.mjs';
   import {HALLOWEEN_PACK} from '/shared/mercenary-halloween-pack-v1.mjs';
   import {HALLOWEEN_PACK_CARDS} from '/shared/mercenary-halloween-pool-v3.mjs';
   const mode=new URL(location).searchParams.get('mode'),id='recovery-button-existing-request',body={requestId:id,count:10,expectedRevision:15};
   const config={revision:15,userOpeningEnabled:true,settings:{mode:'ON',prices:{single:100,ten:900}},readiness:{ready:true,blockers:[]},cards:HALLOWEEN_PACK_CARDS,stock:HALLOWEEN_PACK_CARDS.map(c=>({code:c.code,prepared:true,remaining:2}))};
   const receipt=b=>({requestId:b.requestId,accountId:1,packId:HALLOWEEN_PACK.id,status:'COMPLETED',count:b.count,coin:'10000',coinCost:900,draws:Array.from({length:b.count},()=>({outcomeId:'NONE',quantity:0}))});
   const f=window.fixture={posts:0,reads:0,confirmed:0,aborted:0,body,mode};
   if(mode==='read'||mode==='pending')localStorage.setItem('cnine.halloween-pack.pending:1',JSON.stringify({accountId:1,body}));
   window.addEventListener('limited-pack:receipt',()=>f.confirmed++);
   const api=async(p,options={})=>{
    if(p===HALLOWEEN_PACK.featurePath)return structuredClone(config);
    options.signal?.addEventListener('abort',()=>f.aborted++,{once:true});
    if(p===HALLOWEEN_PACK.openPath){f.posts++;f.body=options.body;
     if(mode==='post'||mode==='auto')return new Promise(resolve=>{f.late=()=>resolve(receipt(f.body));});
     return receipt(options.body);
    }
    if(p.startsWith(HALLOWEEN_PACK.receiptPath)){
     f.reads++;
     if((mode==='read'||mode==='pending')&&f.reads===1)return new Promise(resolve=>{f.late=()=>resolve(receipt(body));});
     if(mode==='pending')return {requestId:body.requestId,status:'PENDING',retryable:true};
     return receipt(f.body);
    }throw Error('Unexpected fixture request');
   };
   window.ready=mountHalloweenPack({accountId:1,getAccountId:()=>1,api});
  </script>`);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
 fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']}),reports=[];
try {
 for(const width of [1440,390])for(const mode of ['read','post','auto','pending']){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1050},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/qa?mode='+mode);
  if(mode==='read'||mode==='pending')await page.waitForFunction(()=>window.fixture.reads===1);
  else{
   await page.locator('[data-hwp-buy="10"]:not([disabled])').waitFor();
   if(mode==='auto'){
    await page.locator('[data-hwp-auto-toggle]').click();
    await page.locator('[data-hwp-auto-repeats]').fill('3');
    await page.locator('[data-hwp-auto-start]').click();
   }else await page.locator('[data-hwp-buy="10"]').click();
   await page.locator('[data-hwp-confirm-start]').click();
   await page.waitForFunction(()=>window.fixture.posts===1);
  }
  const recover=page.locator('[data-hwp-recover]');
  assert.equal(await recover.isEnabled(),true,'Recovery remains clickable during a stalled request');
  assert.equal(await recover.isVisible(),true,'Auto mode must expose recovery too');
  assert.equal(await page.locator('[data-hwp-buy="10"]').isEnabled(),false,'No second purchase while pending');
  assert.equal(await page.evaluate(()=>document.querySelector('.hwp-dialog').scrollWidth>document.querySelector('.hwp-dialog').clientWidth+1),false);
  await page.locator('.hwp-dialog').screenshot({path:path.join(out,mode+'-waiting-'+width+'.png')});
  await recover.click();
  if(mode==='pending'){
   await page.waitForFunction(()=>document.querySelector('[data-hwp-status]')?.textContent.includes('이전 개봉이 아직 확인되지'));
   assert.equal(await page.evaluate(()=>fixture.posts),0,'Reopening only reads the pending receipt');
   assert.equal(await page.locator('[data-hwp-buy="10"]').isEnabled(),false);
   assert.equal(await page.locator('[data-hwp-recover]').isEnabled(),true);
   await page.locator('[data-hwp-recover]').click();
  }
  await page.waitForFunction(()=>window.fixture.confirmed===1&&document.querySelector('[data-hwp-buy="10"]')?.disabled===false);
  const confirmed=await page.evaluate(()=>({posts:fixture.posts,reads:fixture.reads,confirmed:fixture.confirmed,aborted:fixture.aborted,pending:localStorage.getItem('cnine.halloween-pack.pending:1'),saved:JSON.parse(localStorage.getItem('cnine.halloween-pack.receipt:1'))?.requestId}));
  assert.equal(confirmed.posts,mode==='read'?0:1);assert.equal(confirmed.pending,null);assert(confirmed.aborted>=1);
  if(mode==='pending')assert.equal(confirmed.saved,'recovery-button-existing-request');
  assert.equal(await page.locator('.hwp-result').count(),10);
  assert.equal(await page.locator('[data-hwp-auto-running]').isVisible(),false,'Recovery does not restart automatic purchases');
  // Even a transport that ignores AbortSignal may deliver late. It has no authority
  // over the new room's receipt, wallet notification or pending purchase.
  await page.evaluate(async()=>{fixture.late();await new Promise(r=>setTimeout(r,25));});
  assert.equal(await page.evaluate(()=>fixture.confirmed),1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cnine.halloween-pack.receipt:1')).requestId),confirmed.saved);
  assert.equal(await page.locator('.hwp-dialog').count(),1);assert.deepEqual(errors,[]);
  await page.locator('.hwp-dialog').screenshot({path:path.join(out,mode+'-recovered-'+width+'.png')});
  reports.push({width,mode,...confirmed,lateResponseIgnored:true,automaticPurchasesNotResumed:true,errors});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));
 console.log(JSON.stringify(reports));
} finally {await browser.close();await new Promise(r=>server.close(r));}
