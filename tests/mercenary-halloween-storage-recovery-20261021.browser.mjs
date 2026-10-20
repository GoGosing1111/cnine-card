import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.cwd(),out=process.env.QA_OUT||'C:/Users/User/AppData/Local/Temp/jjing-halloween-20261021/storage-after';
fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/qa'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080c17}</style><script type="module">
   import {mountHalloweenPack} from '/js/mercenary-halloween-pack-live.mjs';
   import {HALLOWEEN_PACK} from '/shared/mercenary-halloween-pack-v1.mjs';
   import {HALLOWEEN_PACK_CARDS} from '/shared/mercenary-halloween-pool-v3.mjs';
   const mode=new URL(location).searchParams.get('mode'),pendingKey='cnine.halloween-pack.pending:1',receiptKey='cnine.halloween-pack.receipt:1';
   const body={requestId:'00000000-0000-4000-8000-000000000001',count:10,expectedRevision:16};
   const config={revision:16,userOpeningEnabled:true,settings:{mode:'ON',prices:{single:100,ten:900}},readiness:{ready:true,blockers:[]},cards:HALLOWEEN_PACK_CARDS,stock:HALLOWEEN_PACK_CARDS.map(c=>({code:c.code,prepared:true,remaining:2}))};
   const receipt=b=>({accountId:1,packId:HALLOWEEN_PACK.id,requestId:b.requestId,count:b.count,revision:16,status:'COMPLETED',coin:'10000',coinCost:900,draws:Array.from({length:b.count},(_,i)=>i===9?{outcomeId:'CARD_SS',mercenaryCode:'V-036',rank:'SS',edition:'STANDARD'}:{outcomeId:'NONE',quantity:0})});
   const f=window.fixture={mode,posts:0,reads:0,confirmed:0,filled:0,walletCacheFailures:0};
   window.loadUser=()=>({serverUserId:1,coin:10000});
   window.saveUser=()=>{f.walletCacheFailures++;throw new DOMException('Wallet cache quota exceeded','QuotaExceededError');};
   if(mode!=='pending-write-denied')localStorage.setItem(pendingKey,JSON.stringify({accountId:1,body}));
   if(mode==='full'){
    let low=0,high=6*1024*1024;
    while(low<high){const n=Math.ceil((low+high)/2);try{localStorage.setItem('qa-unrelated-data','x'.repeat(n));low=n;}catch(e){if(e.name!=='QuotaExceededError')throw e;high=n-1;}}
    localStorage.setItem('qa-unrelated-data','x'.repeat(low));f.filled=low;
   }else{
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
     if(mode==='history-denied'&&key===receiptKey||mode==='pending-write-denied'&&key===pendingKey)throw new DOMException('Storage quota exceeded','QuotaExceededError');
     return set.call(this,key,value);
    };
   }
   window.addEventListener('limited-pack:receipt',()=>f.confirmed++);
   const api=async(p,options={})=>{
    if(p===HALLOWEEN_PACK.featurePath)return structuredClone(config);
    if(p.startsWith(HALLOWEEN_PACK.receiptPath)){f.reads++;return receipt(body);}
    if(p===HALLOWEEN_PACK.openPath){
     if(JSON.parse(localStorage.getItem(pendingKey))?.body.requestId!==options.body.requestId)throw Error('POST without a durable request');
     f.posts++;return receipt(options.body);
    }
    throw Error('Unexpected fixture request');
   };
   window.ready=mountHalloweenPack({accountId:1,getAccountId:()=>1,api});
  </script>`);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
 for(const width of [1440,390])for(const mode of ['full','history-denied','pending-write-denied']){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/qa?mode='+mode);
  const reveal=async()=>{
   await page.locator('[data-hwp-skip]').waitFor({state:'visible'});
   await page.locator('[data-hwp-skip]').click();
   await page.locator('[data-hwp-buy="10"]:not([disabled])').waitFor();
  };
  if(mode!=='pending-write-denied')await reveal();
  await page.evaluate(()=>window.ready);
  for(const count of [1,10]){
   await page.locator('[data-hwp-buy="'+count+'"]:not([disabled])').click();
   await page.locator('[data-hwp-confirm]:not([hidden])').waitFor();
   assert.equal(await page.locator('[data-hwp-confirm-start]').isEnabled(),true);
   await page.locator('[data-hwp-confirm-cancel]').click();
  }
  assert.equal(await page.evaluate(()=>fixture.posts),0);
  if(mode==='full'){
   await page.locator('[data-hwp-buy="10"]').click();await page.locator('[data-hwp-confirm-start]').click();
   await page.waitForFunction(()=>fixture.posts===1);await reveal();
   assert.equal(await page.evaluate(()=>localStorage.getItem('qa-unrelated-data').length===fixture.filled),true);
   assert.equal(await page.evaluate(()=>fixture.confirmed),2);
  }else if(mode==='history-denied'){
   await page.locator('[data-hwp-recover]').click();await page.waitForFunction(()=>fixture.reads===2);await reveal();
   assert.equal(await page.evaluate(()=>fixture.confirmed),2);
  }else{
   await page.locator('[data-hwp-buy="1"]').click();await page.locator('[data-hwp-confirm-start]').click();
   await page.waitForFunction(()=>document.querySelector('[data-hwp-status]').textContent.includes('브라우저에 개봉 요청을 저장할 수 없습니다'));
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('cnine.halloween-pack.pending:1')),null);
  assert.equal(await page.evaluate(()=>fixture.posts),mode==='full'?1:0);
  assert.equal(await page.evaluate(()=>fixture.walletCacheFailures),mode==='pending-write-denied'?0:2);
  assert.equal(await page.locator('[data-hwp-buy="1"]').isEnabled(),true);
  assert.equal(await page.locator('[data-hwp-buy="10"]').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.querySelector('.hwp-dialog').scrollWidth>document.querySelector('.hwp-dialog').clientWidth+1),false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,mode+'-'+width+'.png')});
  report.push({width,...await page.evaluate(()=>fixture),oneEnabled:true,tenEnabled:true,pending:null,errors});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
