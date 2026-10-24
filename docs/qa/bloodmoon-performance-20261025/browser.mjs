import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {bloodmoonPackState} from '../../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {config} from './fixture.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=path.resolve(process.argv[2]),snapshot=JSON.parse(fs.readFileSync(path.join(out,'public-pool-before.json'))),receipt=JSON.parse(fs.readFileSync(path.join(out,'remote-limited_serial_cap-receipt.json'))),c=config(snapshot.normalCards,'limited_serial_cap');
const feature={...bloodmoonPackState(c.settings,c.stock.map(s=>({code:s.code,stock_limit:s.limit,issued:0})),snapshot.normalCards,{releaseEnabled:true}),revision:1};
const assets=new Map(),mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'};
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080c14}</style><script type="module">
import {mountBloodmoonPack} from '/js/mercenary-bloodmoon-pack-live.mjs';
const data=await (await fetch('/fixture.json')).json();window.metrics={videos:[],apiCalls:[],domMs:null,paintMs:null};
document.addEventListener('playing',e=>{if(e.target.tagName==='VIDEO')window.metrics.videos.push({rank:document.querySelector('[data-bwp-video]')?.dataset.cinematic,duration:e.target.duration});},true);
new MutationObserver(()=>{if(window.metrics.domMs===null&&document.querySelector('.bwp-dialog')?.dataset.resultCount==='100000'){window.metrics.domMs=performance.now()-window.apiReturnAt;requestAnimationFrame(()=>requestAnimationFrame(()=>window.metrics.paintMs=performance.now()-window.apiReturnAt));}}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-result-count']});
const api=async(path,opt={})=>{window.metrics.apiCalls.push({path,method:opt.method||'GET'});if(path.endsWith('/feature'))return data.feature;if(path.endsWith('/open')){window.apiReturnAt=performance.now();return {...data.receipt,requestId:opt.body.requestId};}throw Error('Unexpected fixture API');};
window.room=await mountBloodmoonPack({api,accountId:1,getAccountId:()=>1,lock:async(_key,work)=>work()});window.ready=true;
</script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(req.method!=='GET')return res.writeHead(405).end();
 if(url.pathname==='/fixture')return res.writeHead(200,{'content-type':'text/html'}).end(html);
 if(url.pathname==='/fixture.json')return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({feature,receipt}));
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname.startsWith('/api/'))throw Error('Production API unavailable in this fixture');
 if(url.pathname.startsWith('/assets/')){
  if(!assets.has(url.pathname))assets.set(url.pathname,(async()=>{const response=await fetch('https://cnine-card.pages.dev'+url.pathname);if(!response.ok)throw Error('Asset '+response.status+' '+url.pathname);return {body:Buffer.from(await response.arrayBuffer()),type:response.headers.get('content-type')};})());
  const asset=await assets.get(url.pathname);return res.writeHead(200,{'content-type':asset.type}).end(asset.body);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const {width,rate,watchVideos} of [{width:1440,rate:1,watchVideos:true},{width:390,rate:4,watchVideos:false},{width:320,rate:4,watchVideos:false}]){
  const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[],bad=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push({status:r.status(),url:r.url()});});
  if(rate>1){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});}
  await page.goto(base+'/fixture');await page.waitForFunction(()=>window.ready);await page.locator('[data-bwp-budget-preset="100000000000000"]').click();await page.locator('[data-bwp-bulk-start]').click();await page.locator('[data-bwp-confirm-start]').click();
  await page.waitForFunction(()=>window.metrics?.paintMs!==null);assert.equal(await page.locator('[data-bwp-results] img').count(),15);assert.equal(await page.locator('.bwp-count-summary img').count(),0);
  const early=await page.evaluate(()=>({domMs:window.metrics.domMs,paintMs:window.metrics.paintMs,images:document.querySelectorAll('[data-bwp-results] img').length,nodes:document.querySelectorAll('[data-bwp-results] *').length,resultsBeforeVideoEnd:!document.querySelector('[data-bwp-film]').hidden}));
  if(watchVideos)await page.waitForFunction(()=>document.querySelector('[data-bwp-film]').hidden,{},{timeout:45000});
  else {for(let i=0;i<3;i++){if(await page.locator('[data-bwp-skip]').isVisible())await page.locator('[data-bwp-skip]').click();await page.waitForTimeout(60);}}
  await page.waitForFunction(()=>document.querySelector('[data-bwp-film]').hidden);const finished=await page.evaluate(()=>({finishedMs:performance.now()-window.apiReturnAt,videos:window.metrics.videos,apiCalls:window.metrics.apiCalls}));
  if(watchVideos){assert.deepEqual(finished.videos.map(r=>r.rank),['SS','SSS']);assert(finished.finishedMs>=18000);}
  await page.locator('.bwp-count-details summary').click();assert.equal(await page.locator('.bwp-count-details tbody tr').count(),51);
  await page.locator('[data-bwp-results] img').evaluateAll(imgs=>Promise.all(imgs.map(i=>{i.loading='eager';return i.decode();})));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.equal(finished.apiCalls.filter(r=>r.method==='POST').length,1);
  const report={width,cpuThrottle:rate,watchVideos,...early,...finished,detailRows:51,ordinaryImages:0,errors,bad,realApiWrites:0};reports.push(report);console.log(JSON.stringify(report));await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-performance.json'),JSON.stringify({status:'PASSED',at:new Date().toISOString(),actualProductionComponents:true,api:'mocked with verified remote benchmark receipt; no production purchase',reports},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
