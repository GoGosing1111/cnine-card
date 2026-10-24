import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK,bloodmoonPackDraft} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLOODMOON_BULK_REFERENCE_PRICES} from '../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {readBloodmoonPackState} from '../functions/_mercenary_bloodmoon_pack.js';

const root=process.cwd(),out=path.join(root,'docs/qa/bloodmoon-bulk-20261025'),cleanup=[],reports=[];let posts=0,locked=true;
fs.mkdirSync(out,{recursive:true});
let sample=0;const f=await bloodmoonFixture({after:fn=>cleanup.push(fn)},{randomInt:max=>{sample=(Math.imul(sample+1,1664525)+1013904223)>>>0;return Math.floor(sample/2**32*max);}});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.avif':'image/avif','.mp4':'video/mp4','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=(body,status=200)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(body));
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/room')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080c14}</style><script type="module">import {mountBloodmoonPack} from '/js/mercenary-bloodmoon-pack-live.mjs';const api=async(path,o={})=>{const r=await fetch('/api/'+path,{method:o.method||'GET',headers:{'content-type':'application/json'},body:o.body?JSON.stringify(o.body):undefined});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),data);return data;};window.room=await mountBloodmoonPack({api,accountId:1,getAccountId:()=>1,lock:async(_k,work)=>work(),videoFactory:()=>({prepare(){},play(){return Promise.resolve();},cancel(){},destroy(){},setPaused(){}})});</script></html>`);
  if(url.pathname.startsWith('/api/')){
   const route=url.pathname.slice(5);
   if(route===BLOODMOON_PACK.featurePath)return json(await readBloodmoonPackState(f.env,{releaseEnabled:!locked}));
   if(route===BLOODMOON_PACK.openPath){posts++;if(locked)return json({error:'판매 잠금',code:'MERCENARY_BLOODMOON_CLOSED'},423);let raw='';for await(const chunk of req)raw+=chunk;return json(await f.service.open(f.env,f.user,JSON.parse(raw)));}
   if(route===BLOODMOON_PACK.receiptPath)return json(await f.service.receipt(f.env,f.user,url.searchParams.get('requestId')));
   return json({error:'No route'},404);
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname)),target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target))return res.writeHead(404).end('not found');
  res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream'});fs.createReadStream(target).pipe(res);
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message,code:e.code}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:width>600?1100:844},deviceScaleFactor:1}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  locked=true;Object.assign(f.settings,bloodmoonPackDraft());await f.configure(1);
  await page.goto(base+'/room');await page.locator('[data-bwp-bulk-quote]').filter({hasText:'1,000회'}).waitFor();
  const before=posts;await page.locator('[data-bwp-budget-preset="100000000000000"]').click();assert.match(await page.locator('[data-bwp-bulk-quote]').innerText(),/100,000회/);assert.equal(await page.locator('[data-bwp-bulk-start]').isDisabled(),true);assert.equal(posts,before);
  assert.equal(await page.locator('[data-bwp-budget-preset="100000000000000"]').getAttribute('aria-pressed'),'true');
  const style=await page.locator('[data-bwp-budget-preset="100000000000000"]').evaluate(el=>({color:getComputedStyle(el).color,text:getComputedStyle(el).webkitTextFillColor,image:getComputedStyle(el).backgroundImage,height:el.getBoundingClientRect().height}));assert.match(style.image,/blood-pack-20261023\/button-ember/);assert.equal(style.color,'rgb(255, 240, 207)');assert.equal(style.text,style.color);assert(style.height>=44);
  await page.locator('.bwp-bulk-panel').screenshot({path:path.join(out,'budget-'+width+'.png')});
  await page.locator('[data-bwp-budget]').fill('100000000000001');assert.match(await page.locator('[data-bwp-bulk-quote]').innerText(),/100조/);assert.equal(await page.locator('[data-bwp-bulk-start]').isDisabled(),true);
  // The production factory remains OFF. Only this isolated fixture enables execution.
  locked=false;f.settings.mode='ON';f.settings.prices={...BLOODMOON_BULK_REFERENCE_PRICES};f.settings.normalRankRatesPpm={C:500000,B:100000,A:100000,S:100000,SS:100000,SSS:100000};f.settings.missRatePpm=0;f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-960'?1000000:0]));f.settings.normalSssRatePpm=0;await f.configure(2);await f.pg.exec('UPDATE users SET coin=200000000000000 WHERE id=1');
  await page.reload();await page.locator('[data-bwp-bulk-start]:not([disabled])').waitFor();await page.locator('[data-bwp-budget-preset="100000000000000"]').click();await page.locator('[data-bwp-bulk-start]').click();await page.locator('[data-bwp-confirm-cancel]').click();assert.equal(posts,before);
  await page.locator('[data-bwp-bulk-start]').click();assert.match(await page.locator('[data-bwp-confirm-text]').innerText(),/100,000회/);await page.locator('[data-bwp-confirm-start]').click();await page.waitForFunction(()=>document.querySelector('.bwp-dialog')?.dataset.resultCount==='100000');
  assert.equal(posts,before+1);assert.match(await page.locator('[data-bwp-result-total]').innerText(),/100,000회/);assert.equal(await page.locator('.bwp-count-summary img').count(),0);
  await page.locator('.bwp-count-details summary').click();assert(await page.locator('.bwp-count-details tbody tr').count()>0);assert((await page.locator('[data-bwp-results] *').count())<400);
  await page.locator('[data-bwp-results] img').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode();})));
  assert.equal(await page.locator('.bwp-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.locator('.bwp-count-summary').screenshot({path:path.join(out,'counts-'+width+'.png')});
  await page.locator('[data-bwp-recover]').click();await page.waitForFunction(()=>document.querySelector('[data-bwp-status]')?.textContent.includes('개봉 완료'));assert.equal(posts,before+1);assert.equal(await f.coin(),1e14);
  await page.locator('.bwp-dialog').evaluate(el=>el.dataset.resultCount='1');assert.equal(await page.locator('[data-bwp-results]').evaluate(el=>getComputedStyle(el).display),'block');await page.locator('.bwp-dialog').evaluate(el=>el.dataset.resultCount='100000');
  // Use the existing non-transactional review with a representative mixed result.
  locked=true;Object.assign(f.settings,bloodmoonPackDraft());await f.configure(3);await page.goto(base+'/preview/blood-pack-interface-20261023/');await page.locator('[data-view="results"]').click();
  assert.equal(await page.locator('[data-bwp-results] img').count(),4);assert.equal(await page.locator('.bwp-count-summary img').count(),0);assert.match(await page.locator('.bwp-miss-count').innerText(),/80,000/);
  await page.locator('.bwp-count-details summary').click();await page.locator('[data-bwp-results] img').evaluateAll(imgs=>Promise.all(imgs.map(i=>{i.loading='eager';return i.decode();})));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('[data-bwp-results]').screenshot({path:path.join(out,'results-'+width+'.png')});
  assert.equal(posts,before+1);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,lockedPurchase:true,count:100000,posts:1,compactResults:true,ordinaryImages:0,exampleFeaturedImages:4,referenceStyle:style,errors,failed});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',fixtureOnly:true,productionTransactions:0,reports},null,2));console.log(JSON.stringify(reports));
}catch(error){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({error:error.stack,reports},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
