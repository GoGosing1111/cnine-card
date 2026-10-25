import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {HALLOWEEN_PACK,halloweenPackState,halloweenPackCatalogRow} from '../shared/mercenary-halloween-pack-v1.mjs';
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/halloween-shop-remove-20261025');fs.mkdirSync(out,{recursive:true});
const read=async p=>{const r=await fetch('https://cnine-card.pages.dev/api/'+p);assert(r.ok);return r.json();};
const [bloodmoon,oldHalloween,catalog]=await Promise.all([read('mercenaries/v3/bloodmoon-pack/feature'),read(HALLOWEEN_PACK.featurePath),read('packs')]);
const stockRows=oldHalloween.stock.filter(s=>s.prepared).map(s=>({code:s.code,stock_limit:s.limit,issued:s.issued}));
const halloween={...oldHalloween,...halloweenPackState(oldHalloween.settings,stockRows,oldHalloween.normalCards)};
const staleHalloween={...halloweenPackCatalogRow(oldHalloween.settings,stockRows),drawEnabled:true,comingSoon:false};
const packs=catalog.packs.filter(p=>p&&p.id!==HALLOWEEN_PACK.id&&p.id!=='halloween');
assert.equal(bloodmoon.userOpeningEnabled,true);assert.equal(halloween.userOpeningEnabled,false);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.woff2':'font/woff2'};
let posts=0;const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(req.method!=='GET'){posts++;return json({error:'QA never makes purchases'},423);}
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/halloween-room')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#090711"><script type="module">import {mountHalloweenPack} from '/js/mercenary-halloween-pack-live.mjs';window.ready=mountHalloweenPack({accountId:1,getAccountId:()=>1,api:async p=>(await fetch('/api/'+p)).json()});</script></body></html>`);
  if(url.pathname==='/halloween-cms')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;background:#10141d;color:#eee"><main id="cms" style="max-width:1180px;margin:auto"></main><script type="module">import {createHalloweenMercenaryEditor} from '/admin/mercenary-halloween-admin-v1.mjs';const root=document.querySelector('#cms'),editor=createHalloweenMercenaryEditor({request:async()=>(await fetch('/api/admin/mercenaries/halloween-pack')).json(),onRender:render});function render(){root.innerHTML=editor.html();editor.mount(root.querySelector('[data-halloween-root]'));}render();</script></body></html>`);
  if(url.pathname==='/api/'+HALLOWEEN_PACK.featurePath||url.pathname==='/api/'+HALLOWEEN_PACK.adminPath)return json(halloween);
  if(url.pathname==='/api/mercenaries/v3/bloodmoon-pack/feature')return json(bloodmoon);
  if(url.pathname==='/api/packs')return json({...catalog,packs});
  if(url.pathname.startsWith('/api/'))return json({maintenance:{active:false},enabled:false,connected:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60});
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){file=path.resolve('C:/Users/User/Downloads/cnine-z-body-sword-20260918/site','.'+decodeURIComponent(url.pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');}
  if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width<600?900:1080},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(base+'/?screen=buy');await page.waitForFunction(()=>typeof renderShell==='function');await page.waitForSelector('#key');
  const ids=await page.evaluate(({packs,staleHalloween})=>{
   document.querySelector('[data-miracle-close]')?.click();API_MODE=false;API_TOKEN='';
   localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'상점 검수',serverUserId:1,role:'USER',coin:100000000000000,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));
   selectedPackId=staleHalloween.id;applyServerPacks([...packs,staleHalloween,{...staleHalloween,id:'halloween'}]);
   const fallback=selectedPackId;selectedPackId='mercenary-bloodmoon-ss-limited';renderShell('buy');return {fallback,ids:PACKS.map(p=>p.id)};
  },{packs,staleHalloween});
  assert(!ids.ids.includes(HALLOWEEN_PACK.id));assert(!ids.ids.includes('halloween'));assert(ids.ids.includes(ids.fallback));
  assert.equal(await page.locator('[data-pack-id="mercenary-halloween-ss-limited"],.pack-choice-halloween,.halloween-shop-hero').count(),0);
  assert.equal(await page.locator('.bloodmoon-shop-hero h2').innerText(),'블러드문팩');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,'shop-'+width+'.png')});
  await page.locator('[data-bloodmoon-pack-enter]').click();await page.locator('[data-bwp-buy="1"]:not([disabled])').waitFor();assert.match(await page.locator('[data-bwp-availability]').innerText(),/개봉 가능/);await page.locator('[data-bwp-close]').click();
  await page.goto(base+'/halloween-room');await page.locator('[data-hwp-availability]').filter({hasText:'판매 종료'}).waitFor();
  for(const count of [1,10])assert(await page.locator('[data-hwp-buy="'+count+'"]').isDisabled());assert(await page.locator('[data-hwp-auto-start]').isDisabled());assert.equal(await page.locator('[data-hwp-recover]').innerText(),'이전 결과 확인');assert.equal(await page.locator('[data-hwp-recover]').isDisabled(),false);
  await page.locator('.hwp-dialog').screenshot({path:path.join(out,'retired-room-'+width+'.png')});
  await page.goto(base+'/halloween-cms');await page.locator('[data-halloween-mode]').waitFor();assert.match(await page.locator('.mlc-hero').innerText(),/상점 제거/);assert.match(await page.locator('.mc-release-strip').innerText(),/신규 개봉이 차단/);
  await page.locator('.mlc-hero').screenshot({path:path.join(out,'cms-'+width+'.png')});assert.deepEqual(errors,[]);
  reports.push({width,shopRemoved:true,staleRowsFiltered:true,staleSelectionRecovered:true,bloodmoonOpeningEnabled:true,retiredRoomPurchasesDisabled:true,previousResultButtonEnabled:true,cmsRetiredLabel:true,errors});await context.close();
 }
 assert.equal(posts,0);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',reports,productionTransactions:0},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
