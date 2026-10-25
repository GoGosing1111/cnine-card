import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {bloodmoonPackState} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {prepareStockIncrease} from '../scripts/ops/bloodmoon-eunseol-plus1-20261025.mjs';
const root=process.cwd(),out=process.env.QA_OUT;assert(out);fs.mkdirSync(out,{recursive:true});
const live=await(await fetch('https://cnine-card.pages.dev/api/mercenaries/v3/bloodmoon-pack/feature')).json();
const settings=prepareStockIncrease(live.settings),stock=live.stock.map(s=>({code:s.code,stock_limit:settings.stockLimits[s.code],issued:s.issued}));
const state={...live,...bloodmoonPackState(settings,stock,live.normalCards)};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.woff2':'font/woff2'};
let writes=0;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(req.method!=='GET'){writes++;res.writeHead(405).end();return;}
 if(url.pathname==='/state'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(state));return;}
 if(url.pathname==='/room'){res.writeHead(200,{'content-type':mime['.html']}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><script type="module">import {mountBloodmoonPack} from "/js/mercenary-bloodmoon-pack-live.mjs";await mountBloodmoonPack({accountId:1,getAccountId:()=>1,api:()=>fetch("/state").then(r=>r.json())});</script></body></html>');return;}
 if(url.pathname==='/cms'){res.writeHead(200,{'content-type':mime['.html']}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;background:#10141d;color:#eee"><main></main><script type="module">import {createBloodmoonMercenaryEditor} from "/admin/mercenary-bloodmoon-admin-v1.mjs";const root=document.querySelector("main");const editor=createBloodmoonMercenaryEditor({request:()=>fetch("/state").then(r=>r.json()),onRender(){root.innerHTML=editor.html();editor.mount(root.querySelector("[data-bloodmoon-root]"));}});root.innerHTML=editor.html();editor.mount(root.querySelector("[data-bloodmoon-root]"));</script></body></html>');return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});const reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width<600?900:1080},serviceWorkers:'block'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/room');await page.locator('[data-bwp-buy="1"]:not([disabled])').waitFor();
  const old=live.stock.find(s=>s.code==='V-973');assert.match(await page.locator('[data-bwp-stock-code="V-973"]').innerText(),new RegExp('남은 '+(old.remaining+1)+'장'));
  assert.equal(await page.locator('.bwp-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.locator('.bwp-dialog').screenshot({path:path.join(out,'room-'+width+'.png')});
  await page.goto(base+'/cms');await page.locator('[data-bloodmoon-price="single"]').waitFor();assert.match(await page.locator('.mlc-hero').innerText(),/SS 6종 각 40장/);
  assert.match(await page.locator('.mlc-hero').innerText(),/레오넬 9장/);
  assert.equal(await page.locator('[data-bloodmoon-price="single"]').inputValue(),'1500000000');assert.equal(await page.locator('[data-bloodmoon-mode]').inputValue(),'ON');
  const eunseol=await page.locator('[data-bwp-cms-rank="SSS"] article').filter({has:page.locator('[data-bloodmoon-rate="V-973"]')}).innerText();assert.match(eunseol,/팩 발행 4장/);assert(eunseol.includes('발행 '+old.issued+' · 잔여 '+(old.remaining+1)));assert.equal(await page.locator('[data-bloodmoon-effective="V-973"]').innerText(),'0.0000016%');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('.mlc-hero').screenshot({path:path.join(out,'cms-'+width+'.png')});
  assert.deepEqual(errors,[]);reports.push({width,eunseolLimit:4,eunseolIssued:old.issued,eunseolRemaining:old.remaining+1,oddsPreserved:true,priceAndModePreserved:true,errors});await context.close();
 }
 assert.equal(writes,0);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({reports,mutations:0},null,2));console.log(JSON.stringify({reports,mutations:writes}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
