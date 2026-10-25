import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/streamer-cnine-four-20261025'),publicBase=process.env.QA_PUBLIC_BASE||'';
fs.mkdirSync(out,{recursive:true});
const response=await fetch('https://cnine-card.pages.dev/api/streamer-profiles');assert(response.ok);const roster=await response.json();
const expected=['qpqpro','zalalz','mew030709','yjk011599'];for(const id of expected)assert(roster.profiles.some(p=>p.id===id));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'},cache=new Map(),missing=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){assert.equal(req.method,'GET');res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(url.pathname==='/api/streamer-profiles'?roster:{maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[]}));}
 if(publicBase){const key=url.pathname+url.search;if(!cache.has(key))cache.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await cache.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){file=path.resolve('C:/Users/User/Downloads/cnine-z-body-sword-20260918/site','.'+decodeURIComponent(url.pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500);res.end(error.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const width of (publicBase?[390]:[1440,390])){
  const page=await browser.newPage({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(publicBase)await page.route(publicBase+'/api/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:new URL(route.request().url()).pathname==='/api/streamer-profiles'?roster:{maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[]}});});
  if(publicBase){
   await page.route(publicBase+'/qa/streamer-logo',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/streamer-lounge-v2036.css?v=2038-station-only"></head><body><aside data-streamer-lounge-host hidden></aside><script type="module" src="/js/streamer-lounge-v2036.js?v=20261025-cnine-four"></script></body></html>'}));
   await page.goto(publicBase+'/qa/streamer-logo',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.StreamerLounge);await page.evaluate(()=>StreamerLounge.mount());
  }else{
   await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.StreamerLounge&&window.SoopketmonV21ExactShell&&typeof renderShell==='function');
   await page.evaluate(async()=>{API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'라운지 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('home');document.querySelector('[data-miracle-close]')?.click();await StreamerLounge.mount();});
   await page.waitForSelector('[data-streamer-lounge-host]',{state:'attached'});await page.evaluate(async()=>{await StreamerLounge.mount();document.querySelector('soop-adventure-lobby').openMenu('social');});
  }
  await page.locator('[data-streamer-lounge-open]:visible').click();await page.locator('#streamerLoungeV2036[open]').waitFor();await page.locator('#streamerLoungeV2036').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
  const logoIds=await page.locator('[data-sl40-cnine-logo]').evaluateAll(xs=>xs.map(el=>el.closest('[data-profile-id]').dataset.profileId).sort());assert.deepEqual(logoIds,[...expected].sort());
  const logos=await page.locator('[data-sl40-cnine-logo]').evaluateAll(async xs=>Promise.all(xs.map(async el=>{const image=new Image();image.src=el.getAttribute('href');await image.decode();const name=el.parentNode.querySelector('[role="heading"]');return {id:el.closest('[data-profile-id]').dataset.profileId,href:el.getAttribute('href'),size:Number(el.getAttribute('width')),bottom:Number(el.getAttribute('y'))+Number(el.getAttribute('height')),nameY:Number(name.getAttribute('y')),loaded:image.naturalWidth>0};})));
  assert(logos.every(l=>l.loaded&&l.size===(width<600?28:38)&&l.bottom<l.nameY&&l.href===logos[0].href));
  const links=await page.locator('.sl40-station-link').evaluateAll(xs=>xs.map(el=>el.getAttribute('href')));assert.deepEqual(links,roster.profiles.map(p=>p.stationUrl));
  assert.equal(await page.locator('#streamerLoungeV2036').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:path.join(out,'lounge-'+width+'.png')});
  for(const name of ['디임','나무늘봉순']){await page.getByRole('searchbox',{name:'스트리머 이름 검색'}).fill(name);assert.equal(await page.locator('.sl40-card').count(),1);assert.equal(await page.locator('[data-sl40-cnine-logo]').count(),1);await page.screenshot({path:path.join(out,'search-'+name+'-'+width+'.png')});}
  await page.keyboard.press('Escape');assert.equal(await page.locator('#streamerLoungeV2036[open]').count(),0);assert.deepEqual(errors,[]);
  reports.push({width,logoIds,logos,rosterCount:links.length,searchAndClose:true});console.log(width+' 4 logos, original sizes, target searches and close PASS');await page.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',assetSource:publicBase||'local source',surface:publicBase?'deployed lounge component':'main lobby',reports,productionWrites:0},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
