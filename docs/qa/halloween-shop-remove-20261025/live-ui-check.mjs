import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//,'')),'live-ui');fs.mkdirSync(out,{recursive:true});
const source='https://cnine-card.pages.dev',read=async p=>{const r=await fetch(source+p);assert(r.ok);return r.json();};
const [catalog,bloodmoon]=await Promise.all([read('/api/packs'),read('/api/mercenaries/v3/bloodmoon-pack/feature')]);
assert(catalog.packs.every(p=>p&&!['halloween','mercenary-halloween-ss-limited'].includes(p.id)));assert.equal(bloodmoon.userOpeningEnabled,true);
let posts=0;const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=body=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(req.method!=='GET'){posts++;return res.writeHead(423).end();}
  if(url.pathname==='/api/packs')return json(catalog);
  if(url.pathname==='/api/mercenaries/v3/bloodmoon-pack/feature')return json(bloodmoon);
  if(url.pathname.startsWith('/api/'))return json({maintenance:{active:false},enabled:false,connected:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60});
  const r=await fetch(source+url.pathname+url.search);res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});res.end(Buffer.from(await r.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
 await page.goto(base+'/?screen=buy');await page.waitForFunction(()=>typeof renderShell==='function');await page.waitForSelector('#key');
 await page.evaluate(packs=>{document.querySelector('[data-miracle-close]')?.click();API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'상점 검수',serverUserId:1,role:'USER',coin:100000000000000,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));applyServerPacks(packs);selectedPackId='mercenary-bloodmoon-ss-limited';renderShell('buy');},catalog.packs);
 assert.equal(await page.locator('[data-pack-id="mercenary-halloween-ss-limited"],.pack-choice-halloween,.halloween-shop-hero').count(),0);assert.equal(await page.locator('.bloodmoon-shop-hero h2').innerText(),'블러드문팩');
 const chooser=page.locator('[data-pack-id]').first().locator('..');await chooser.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));await chooser.screenshot({path:path.join(out,'shop-390.png')});
 await page.locator('[data-bloodmoon-pack-enter]').click();await page.locator('[data-bwp-buy="1"]:not([disabled])').waitFor();assert.match(await page.locator('[data-bwp-availability]').innerText(),/개봉 가능/);await page.locator('[data-bwp-close]').click();
 assert.deepEqual(errors,[]);assert.equal(posts,0);const result={status:'PASSED',width:390,assetSource:source,packSource:'actual public API',shopIds:catalog.packs.map(p=>p.id),halloweenRemoved:true,bloodmoonOpeningEnabled:true,errors,productionTransactions:0};fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await context.close();
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
