import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium,devices} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {HALLOWEEN_PACK} from '../shared/mercenary-halloween-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
const root=process.cwd(),out=process.env.QA_OUT||'C:/Users/User/.codex/tmp/halloween-mobile-fix-20261021/browser';fs.mkdirSync(out,{recursive:true});
const config={revision:19,userOpeningEnabled:true,settings:{mode:'ON',prices:{single:100,ten:900}},readiness:{ready:true,blockers:[]},cards:HALLOWEEN_PACK_CARDS,stock:HALLOWEEN_PACK_CARDS.map(c=>({code:c.code,prepared:true,remaining:2}))};
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4'};
let state;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/qa'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
   return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080c17}</style><script type="module">
    localStorage.setItem('cnine_battle_sound','OFF');
    const f=window.fixture={confirmed:0,calls:[],epochChanges:0,hidden:false,account:1};window.loadUser=()=>({serverUserId:f.account,coin:10000});
    const mode=${JSON.stringify(state.mode)},originalFetch=fetch.bind(window);
    window.fetch=async(url,options={})=>{
     const call=String(url).startsWith('/api/')?{path:String(url).split('?')[0],method:options.method||'GET'}:null;if(call)f.calls.push(call);
     const response=await originalFetch(url,options);if(call)call.status=response.status;
     if(mode==='sync-race'&&String(url).includes('/receipt')&&f.epochChanges++<2)window.CNineAccountSync.invalidate('qa-snapshot');
     return response;
    };
    window.addEventListener('limited-pack:receipt',()=>f.confirmed++);
    if(mode==='hidden')Object.defineProperty(document,'hidden',{configurable:true,get:()=>f.hidden});
    if(mode==='missing')localStorage.setItem('cnine.halloween-pack.pending:1',JSON.stringify({accountId:1,body:${JSON.stringify(state.saved)}}));
    const {mountHalloweenPack}=await import('/js/mercenary-halloween-pack-live.mjs');
    const {jointAccountRequest}=await import('/js/joint-account-transport.mjs?v=20260924-response');
    // Only the deliberately stalled POST has an accelerated timeout. Receipt
    // polling uses the shipped 8-second option and the real fetch transport.
    window.mount=()=>mountHalloweenPack({accountId:1,getAccountId:()=>f.account,api:(p,o={})=>jointAccountRequest(p,{...o,...p.endsWith('/open')?{timeoutMs:700}:{}})});
    window.ready=window.mount();
   </script></html>`);
  }
  if(url.pathname==='/api/'+HALLOWEEN_PACK.featurePath)return json(config);
  if(url.pathname==='/api/'+HALLOWEEN_PACK.openPath){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));state.posts++;state.ids.push(body.requestId);
   if(!state.receipts.has(body.requestId)){state.debits++;state.receipts.set(body.requestId,{requestId:body.requestId,accountId:1,packId:HALLOWEEN_PACK.id,status:'COMPLETED',count:body.count,revision:19,coin:'9100',coinCost:900,draws:Array.from({length:body.count},()=>({outcomeId:'NONE',quantity:0}))});}
   if(['disconnect','auto-offline'].includes(state.mode)){state.held=res;return;}
   if(['late-receipt','hidden','close'].includes(state.mode)){state.complete=false;return json({code:'JOINT_REQUEST_FAILED',error:'응답 유실 재현'},503);}
   if(state.mode==='sync-race')return json({code:'JOINT_REQUEST_FAILED',error:'응답 유실 재현'},503);
   return json(state.receipts.get(body.requestId));
  }
  if(url.pathname==='/api/'+HALLOWEEN_PACK.receiptPath){
   state.reads++;state.readIds.push(url.searchParams.get('requestId'));const value=state.receipts.get(url.searchParams.get('requestId'));
   if(!value)return json({code:'JOINT_NOT_FOUND',error:'기록 미확인'},404);
   return json(state.complete?value:{requestId:value.requestId,status:'PENDING',retryable:true});
  }
  if(url.pathname.startsWith('/api/'))return json({error:'No live API'},404);
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{if(!res.destroyed)res.writeHead(500).end('Fixture error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,ms=5000)=>{const end=Date.now()+ms;while(!fn()){assert(Date.now()<end,'Fixture condition timed out');await wait(20);}};
try{
 const cases=['desktop','mobile'].flatMap(device=>['disconnect','late-receipt','sync-race','hidden','auto-offline'].map(mode=>[device,mode])).concat([['mobile','missing'],['mobile','close']]);
 for(const [device,mode] of cases.filter(([d,m])=>!process.env.QA_CASES||process.env.QA_CASES.split(',').includes(d+':'+m))){
  state={mode,posts:0,reads:0,debits:0,ids:[],readIds:[],complete:true,receipts:new Map(),saved:{requestId:crypto.randomUUID(),count:10,expectedRevision:19}};
  const context=await browser.newContext({...device==='mobile'?devices['Pixel 7']:{viewport:{width:1440,height:1000}},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/qa');await page.waitForFunction(()=>Boolean(window.ready));await page.evaluate(()=>window.ready);
  const snapshot=()=>page.evaluate(()=>({pending:Boolean(localStorage.getItem('cnine.halloween-pack.pending:1')),confirmed:fixture.confirmed,postAttempts:fixture.calls.filter(c=>c.method==='POST').length,receiptAttempts:fixture.calls.filter(c=>c.path.endsWith('/receipt')).length,disabled:document.querySelector('[data-hwp-buy="10"]')?.disabled,status:document.querySelector('[data-hwp-status]')?.textContent}));
  if(mode!=='missing'){
   if(mode==='auto-offline'){await page.locator('[data-hwp-auto-toggle]').click();await page.locator('[data-hwp-auto-repeats]').fill('3');await page.locator('[data-hwp-auto-start]').click();}
   else await page.locator('[data-hwp-buy="10"]:not([disabled])').click();
   await page.locator('[data-hwp-confirm-start]').click();await until(()=>state.posts===1);
  }
  if(['disconnect','auto-offline'].includes(mode)){
   await context.setOffline(true);await page.waitForFunction(()=>fixture.calls.some(c=>c.path.endsWith('/receipt')));
   await page.waitForFunction(()=>document.querySelector('[data-hwp-status]')?.textContent.includes('이전 결과 확인'));
   assert.equal((await snapshot()).pending,true);await context.setOffline(false);
  }else if(mode==='missing'){
   await until(()=>state.reads===4,15000);await wait(1000);assert.equal(state.reads,4);assert.equal(state.posts,0);assert.equal((await snapshot()).pending,true);
   await page.locator('[data-hwp-recover]').click();
  }else if(mode==='close'){
   await until(()=>state.reads===1);await page.locator('[data-hwp-close]').click();state.complete=true;await wait(1200);assert.equal(state.reads,1);
   await page.evaluate(()=>window.mount());
  }else if(mode==='hidden'){
   await until(()=>state.reads===1);await page.evaluate(()=>{fixture.hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
   state.complete=true;await wait(1200);assert.equal(state.reads,1);
   await page.evaluate(()=>{fixture.hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  }else if(mode==='late-receipt'){await until(()=>state.reads===1);state.complete=true;}
  try{await page.waitForFunction(()=>fixture.confirmed===1&&document.querySelector('[data-hwp-buy="10"]')?.disabled===false,null,{timeout:10000});}
  catch(error){fs.writeFileSync(path.join(out,device+'-'+mode+'-failure.json'),JSON.stringify({...(await snapshot()),errors,serverPosts:state.posts,serverReads:state.reads,browser:await page.evaluate(()=>({online:navigator.onLine,hidden:document.hidden,calls:fixture.calls,account:fixture.account,pending:localStorage.getItem('cnine.halloween-pack.pending:1')}))},null,2));throw error;}
  const result=await snapshot();assert.equal(result.pending,false);assert.equal(result.postAttempts,1);assert.equal(state.debits,1);assert.equal(new Set([...state.ids,...state.readIds]).size,1);
  assert.equal(await page.locator('.hwp-result').count(),10);assert.equal(await page.locator('[data-hwp-auto-running]').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.querySelector('.hwp-dialog').scrollWidth>document.querySelector('.hwp-dialog').clientWidth+1),false);
  if(mode==='auto-offline'){await wait(1300);assert.equal(state.posts,1,'Recovery cannot restart automatic purchases');}
  if(mode==='disconnect')await page.screenshot({path:path.join(out,device+'-recovered.png')});
  assert.deepEqual(errors,[]);const report={device,mode,...result,serverPosts:state.posts,serverReads:state.reads,debits:state.debits,errors};reports.push(report);console.log(JSON.stringify(report));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2)+'\n');state.held?.destroy();await context.close();
 }
}finally{state?.held?.destroy();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
