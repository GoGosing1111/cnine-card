import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK,halloweenPackCatalogRow} from '../shared/mercenary-halloween-pack-v1.mjs';
import {halloweenEscape,halloweenStockText} from '../js/mercenary-halloween-presentation-v2.mjs';
const root=process.cwd(),out=process.env.QA_OUT||'C:/Users/User/.codex/tmp/halloween-jokro-20261021/qa';
fs.mkdirSync(out,{recursive:true});
const cleanups=[],f=await halloweenFixture({after:fn=>cleanups.push(fn)});
f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-979'?1000000:0]));
await f.configure();await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-999'");
const app=fs.readFileSync('js/app.js','utf8'),heroSource=app.match(/function halloweenPackHero\(pack\) \{[\s\S]*?\r?\n\}/)?.[0]||'';
assert(heroSource.startsWith('function halloweenPackHero(pack)')&&heroSource.length<6000);
const renderHero=new Function('escapeHtml','packResponsiveImage','halloweenShopStockText','pack',heroSource+'\nreturn halloweenPackHero(pack);');
const stockRows=(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1')).rows,pack=halloweenPackCatalogRow(f.settings,stockRows);
const shop=renderHero(halloweenEscape,p=>`<img src="/${p.imageUrl}" alt="할로윈 팩">`,s=>halloweenStockText(null,s),pack);
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4','.woff2':'font/woff2'};
let posts=0;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=v=>res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(v));
  if(['/qa','/shop'].includes(url.pathname))return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/mercenary-halloween-pack-v2.css"><body style="margin:0;background:#080b14;color:white">'+(url.pathname==='/shop'?shop:'')+'</body></html>');
  if(url.pathname==='/api/'+HALLOWEEN_PACK.featurePath)return json(await f.state());
  if(url.pathname.startsWith('/api/')){posts++;return res.writeHead(403).end();}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500).end(e.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))failed.push(r.url());});
  for(const surface of ['shop','room']){
   await page.goto(origin+(surface==='shop'?'/shop':'/qa'));
   if(surface==='room')await page.evaluate(async()=>{
    const {mountHalloweenPack}=await import('/js/mercenary-halloween-pack-live.mjs');
    await mountHalloweenPack({accountId:1,getAccountId:()=>1,lock:async(_key,work)=>work(),api:async p=>(await fetch('/api/'+p)).json()});
   });
   const roster=page.locator('.hwp-sss-roster');await roster.waitFor();
   await roster.scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>[...document.querySelectorAll('.hwp-sss-roster img')].every(i=>i.complete&&i.naturalWidth>0));
   assert.equal(await roster.locator('[data-rank="SSS"]').count(),4);
   assert.equal(await page.locator('[data-hwp-stock-code="V-979"]').innerText(),'남은 3장');
   assert.equal(await page.locator('[data-hwp-stock-code="V-999"]').innerText(),'남은 0장 · 소진');
   assert.match(await page.locator('.hwp-legend-collection').innerText(),/네 명의 SSS/);
   const target=page.locator(surface==='room'?'.hwp-dialog':'body');
   assert.equal(await target.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   assert.equal(await roster.evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),width===390?2:4);
   if(surface==='room')await target.evaluate(e=>{e.scrollTop=e.scrollHeight;});
   else await page.locator('[data-code="V-979"]').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`${surface}-${width}.png`)});
   reports.push({surface,width,sssCards:4,jokroRemaining:3,heliosRemaining:0,horizontalOverflow:false});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await context.close();
 }
 assert.equal(posts,0);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({isolatedDatabase:true,productionWrites:0,posts,reports},null,2)+'\n');
 console.log(JSON.stringify({posts,reports}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const cleanup of cleanups.reverse())await cleanup();}
