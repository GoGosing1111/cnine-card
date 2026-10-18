import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK} from '../shared/mercenary-halloween-pack-v1.mjs';
const root=process.cwd(),out=process.env.QA_OUT||'C:/Users/User/.codex/tmp/halloween-sss-fallback-20261018/qa';
fs.mkdirSync(out,{recursive:true});
const cleanups=[],f=await halloweenFixture({after:fn=>cleanups.push(fn)});
await f.pg.exec('UPDATE mercenary_limited_stock_v1 SET issued=stock_limit');
let posts=0;
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=value=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/qa')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Halloween isolated stock QA</title><body></body></html>');
  if(url.pathname==='/api/'+HALLOWEEN_PACK.featurePath)return json(await f.state());
  if(url.pathname==='/api/'+HALLOWEEN_PACK.openPath){posts++;const data=[];for await(const part of req)data.push(part);return json(await f.service.open(f.env,f.user,JSON.parse(Buffer.concat(data).toString())));}
  if(url.pathname==='/api/'+HALLOWEEN_PACK.receiptPath)return json(await f.service.receipt(f.env,f.user,url.searchParams.get('requestId')));
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(error.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message,code:error.code}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))failed.push(r.url());});
  const before=await f.coin(),beforePosts=posts;
  await page.goto(origin+'/qa');
  await page.evaluate(async()=>{
   window.qaReceipts=[];window.addEventListener('limited-pack:receipt',event=>window.qaReceipts.push(event.detail));
   const {mountHalloweenPack}=await import('/js/mercenary-halloween-pack-live.mjs');
   await mountHalloweenPack({accountId:1,getAccountId:()=>1,lock:async(_key,work)=>work(),api:async(path,options={})=>{
    const response=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});
    const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),value);return value;
   }});
  });
  await page.locator('[data-hwp-buy="10"]:not([disabled])').waitFor();
  assert.equal(await page.locator('[data-hwp-stock-code]').count(),10);
  assert.ok((await page.locator('[data-hwp-stock-code]').allTextContents()).every(t=>t==='남은 0장 · 소진'));
  await page.locator('.hwp-rules summary').click();assert.match(await page.locator('.hwp-rules').innerText(),/소진된 리미티드의 확률은 전부 일반 SSS에 합산됩니다/);
  assert.equal(await page.locator('.hwp-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:path.join(out,'rules-'+width+'.png')});
  await page.locator('[data-hwp-buy="10"]').click();await page.locator('[data-hwp-confirm-start]').click();
  await page.waitForFunction(()=>document.querySelector('.hwp-dialog')?.dataset.resultCount==='10');
  assert.equal(await page.locator('.hwp-result[data-rank="SSS"]').count(),10);assert.equal(await page.locator('.hwp-result.is-limited').count(),0);
  await page.locator('[data-hwp-skip]').click();await page.locator('[data-hwp-buy="10"]:not([disabled])').waitFor();
  await page.locator('.hwp-dialog').evaluate(el=>{el.scrollTop=0;});
  assert.equal(await page.locator('.hwp-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:path.join(out,'results-'+width+'.png')});
  await page.locator('[data-hwp-auto-toggle]').click();await page.locator('[data-hwp-auto-count]').selectOption('1');await page.locator('[data-hwp-auto-repeats]').fill('2');
  await page.locator('[data-hwp-auto-start]').click();await page.locator('[data-hwp-confirm-start]').click();
  for(const expected of [2,3]){
   await page.waitForFunction(n=>window.qaReceipts.length===n,expected);
   await page.locator('[data-hwp-skip]').click();
  }
  await page.locator('[data-hwp-buy="10"]:not([disabled])').waitFor();
  assert.match(await page.locator('[data-hwp-status]').innerText(),/총 2회/);assert.equal(posts-beforePosts,3);assert.equal(await f.coin(),before-1100);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,0);
  reports.push({width,stockZeroLabels:10,tenOrdinarySss:true,automaticSingles:2,coinDebit:1100,posts:posts-beforePosts,errors,failed});
  await page.locator('[data-hwp-close]').click();await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({isolatedDatabase:true,productionWrites:0,reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const cleanup of cleanups.reverse())await cleanup();}
