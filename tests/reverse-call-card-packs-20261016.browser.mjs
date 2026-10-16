import fs from 'node:fs/promises';
import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'docs/qa/reverse-call-card-packs-20261016');await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(root,'assets/ui/packs/reverse-call-20261016/manifest.json'),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{try{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});const checks=[],errors=[],badImages=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1050},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({maintenance:{active:false},enabled:false,connected:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60})}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push({width,error:e.message}));
  page.on('response',r=>{if(r.status()>=400&&/reverse-call-20261016|card-frames/.test(r.url()))badImages.push(r.url());});
  await page.goto(base+'/?screen=buy',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof cardHtml==='function'&&typeof renderShell==='function');
  await page.waitForSelector('#key',{timeout:30000});
  await page.evaluate(()=>{
   document.querySelector('[data-miracle-close]')?.click();API_MODE=false;API_TOKEN='';
   cards=['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH','SUPERSTAR'].map((grade,i)=>({id:'qa-'+grade,grade,rarity:grade,name:'CNINE 검수',title:grade+' 카드',image:'assets/cards/7777777.jpg',focusX:50,focusY:50,basePower:1000,powerType:'FIXED',limitedTotal:null,uniqueAbility:null}));
   localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'CNINE 검수',role:'USER',coin:5000,cardShards:0,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},testCoinGrantedV13:true}));
   PACKS.push({id:'ultimate',theme:'ultimate',name:'얼티메이트팩',subtitle:'ULTIMATE PACK',price:0,allowed:[],description:'화면 검수',range:'검수',guarantee10:'SR',guarantee20:'HR'},{id:'mercenary-limited',theme:'mercenary-limited',name:'리미티드 용병팩',prices:{single:null,ten:null},description:'화면 검수',range:'검수'});
  });
  for(const id of ['pickup','ultimate','hyper','mercenary-limited','superstar']){
   await page.evaluate(id=>{selectedPackId=id;renderShell('buy');},id);
   await page.locator('.hero-pack-zone img,.limited-shop-art img').first().waitFor();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.pack-selector img,.hero-pack-zone img,.limited-shop-art img')].map(img=>{img.loading="eager";return img.decode();}));});
   const sources=await page.locator('.pack-selector img,.hero-pack-zone img,.limited-shop-art img').evaluateAll(images=>images.map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0})));
   assert.ok(sources.length>0&&sources.every(i=>i.loaded&&i.src.includes('/reverse-call-20261016/')),id+' currentSrc '+JSON.stringify(sources));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,id+' overflow');
   await page.locator(".hero-pack-zone,.limited-shop-art").first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`store-${id}-${width}.png`),fullPage:true});checks.push({surface:'store',id,width,sources});
  }
  await page.evaluate(()=>renderShell('dex'));
  await page.locator('.dex-card-display').first().waitFor();await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.dex-card-display img')].map(i=>{i.loading="eager";return i.decode();}));});
  assert.equal(await page.locator('.dex-card-display').count(),13);
  assert.equal(await page.locator('.card-header .card-brand-logo').count(),13);
  assert.ok(!(await page.locator('#dexSections').innerText()).includes('SOOP'));
  assert.ok((await page.locator('#dexSections').innerText()).includes('CNINE 검수'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'dex overflow');
  await page.locator(".dex-section").first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`codex-${width}.png`),fullPage:true});checks.push({surface:'codex',width,cards:13,nicknamePreserved:true});
  await page.evaluate(()=>{void showSpecialCardReveal(cards.find(c=>c.grade==='SSR'),loadUser());});
  await page.waitForSelector('.cinematic-card-back .card-brand-logo');await page.locator('.cinematic-card-back .card-brand-logo').evaluate(i=>i.decode());
  assert.ok((await page.locator('.cinematic-card-back .card-brand-logo').getAttribute('src')).includes('/reverse-call-20261016/'));
  await page.screenshot({path:path.join(out,`card-reveal-${width}.png`)});await page.locator('#specialRevealSkip').click();checks.push({surface:'card-reveal',width});
  for(const [name,url,ready]of [['hyper','/preview/hyper-pack-v1/','#hyperStage canvas'],['limited','/preview/mercenary-limited-pack-20261006-v1/','[data-lp-canvas][data-state="ready"]']]){
   const images=[];page.on('request',request=>{if(request.url().includes('/assets/ui/packs/'))images.push(request.url());});
   await page.goto(base+url,{waitUntil:'domcontentloaded'});await page.waitForSelector(ready,{timeout:45000});
   if(name==='hyper')await page.waitForFunction(()=>!document.getElementById('openOne').disabled);
   assert.ok(images.some(url=>url.includes('/reverse-call-20261016/'+(name==='hyper'?'hyper':'mercenary-limited')+'-768.webp')),name+' real canvas texture');
   await page.screenshot({path:path.join(out,`opening-${name}-${width}.png`),fullPage:true});checks.push({surface:'opening',name,width,images:images.filter(p=>p.includes('/packs/'))});
  }
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:1560,height:1240},serviceWorkers:'block'});await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/');
 await page.setContent('<html lang="ko"><head><style>body{background:#0b101d;color:#e7e9f5;font:14px Arial;margin:30px}h1{font-size:26px}.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:20px}figure{margin:0}img{width:100%;height:380px;object-fit:contain}figcaption{text-align:center;padding:10px}</style></head><body><h1>리버스콜 · 카드팩 13종 · 확정 큐브</h1><div class="grid">'+manifest.assets.map(a=>`<figure><img src="${base}/${a.outputs.find(o=>o.path.endsWith('-768.webp')).path}"><figcaption>${a.id}</figcaption></figure>`).join('')+'</div></body></html>');
 await page.evaluate(()=>Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode();})));await page.screenshot({path:path.join(out,'all-packs.png'),fullPage:true});await page.close();
 assert.deepEqual(badImages,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify({checkedAt:new Date().toISOString(),fixtureOnly:true,productionWrites:0,checks,errors,badImages},null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length}));
}catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e.stack),checks,errors,badImages},null,2));throw e;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
