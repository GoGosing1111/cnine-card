import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {BLACKCROWN_PACK,BLACKCROWN_PACK_KEY,blackcrownPackDraft,blackcrownPackCatalogRow,readBlackcrownPackSettings} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft} from '../shared/mercenary-halloween-pack-v1.mjs';
import {handleBlackcrownPack,readBlackcrownPackState} from '../functions/_mercenary_blackcrown_pack.js';
import {handleHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';

const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/blackcrown-pack-20261027/ui');fs.mkdirSync(out,{recursive:true});
const cleanup=[],reports=[];let samples=[],posts=0,allowFixtureOpening=false;
const f=await blackcrownFixture({after:fn=>cleanup.push(fn)},{randomInt:max=>{const n=samples.shift()??0;assert(n<max);return n;}});
await f.setting(HALLOWEEN_PACK_KEY,{revision:23,settings:halloweenPackDraft()});
const halloweenBefore=(await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.woff2':'font/woff2'};
const apiScript=`async function api(path,options={}){const r=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),d,{status:r.status});return d;}`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/room')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#090711"><script type="module">import {mountBlackcrownPack} from '/js/mercenary-blackcrown-pack-live.bundle.mjs';${apiScript}window.ready=mountBlackcrownPack({accountId:1,getAccountId:()=>1,api});</script></body></html>`);
  if(url.pathname==='/cms')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><link rel="stylesheet" href="/css/mercenary-blackcrown-pack.bundle.css"><body style="margin:0;background:#10141d;color:#eee"><span id="roleBadge">OWNER</span><nav id="nav"></nav><h1 id="pageTitle"></h1><main id="cms" style="max-width:1180px;margin:auto"></main><script type="module" src="/admin/mercenary-admin-v1.js"></script></body></html>');
  if(url.pathname==='/api/admin/mercenaries')return json({revision:1,updatedAt:new Date().toISOString(),document:seed.document,catalog:seed.catalog,audit:[]});
  if(['/api/admin/mercenaries/blackcrown-pack','/api/admin/mercenaries/halloween-pack'].includes(url.pathname)){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers:{origin:url.origin,'content-type':'application/json'},...(req.method==='PATCH'?{body:Buffer.concat(chunks)}:{})});
   const handler=url.pathname.endsWith('/blackcrown-pack')?handleBlackcrownPack:handleHalloweenPack;const r=await handler({path:url.pathname.slice(5),request,env:f.env,deps:{requirePermission:async()=>f.user,json:(body,status=200)=>({body,status})}});return json(r.body,r.status);
  }
  if(url.pathname==='/api/'+BLACKCROWN_PACK.featurePath)return json(await readBlackcrownPackState(f.env,{releaseEnabled:allowFixtureOpening,userId:1}));
  if(url.pathname==='/api/'+BLACKCROWN_PACK.openPath){assert(allowFixtureOpening,'Only the isolated fixture may open');posts++;const chunks=[];for await(const c of req)chunks.push(c);return json(await f.service.open(f.env,f.user,JSON.parse(Buffer.concat(chunks))));}
  if(url.pathname==='/api/'+BLACKCROWN_PACK.receiptPath)return json(await f.service.receipt(f.env,f.user,url.searchParams.get('requestId')));
  if(url.pathname.startsWith('/api/'))return json({maintenance:{active:false},enabled:false,connected:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60});
  if(JSON.parse(fs.readFileSync('scripts/blackcrown-authoring-only-20261027.json','utf8')).includes(url.pathname.slice(1)))return res.writeHead(404).end();let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message,code:e.code}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});

try{
 const {cloneBlackcrownSettings}=await import('../scripts/ops/blackcrown-registration-20261027.mjs');
 const saved=JSON.parse(fs.readFileSync('docs/qa/blackcrown-pack-20261027/read.json','utf8'));
 Object.assign(f.settings,cloneBlackcrownSettings(saved.source.settings));
 for(const [code,limit] of Object.entries(f.settings.stockLimits))await f.p('UPDATE mercenary_limited_stock_v1 SET stock_limit=? WHERE code=?',limit,code).run();
 await f.configure(4);await f.own('V-950',20);await f.own('V-951');await f.p('UPDATE users SET coin=? WHERE id=1',100000000000000).run();allowFixtureOpening=true;
 for(const width of (process.env.QA_WIDTHS||'1440,390').split(',').map(Number)){
  await f.p('DELETE FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=?','V-952').run();const postStart=posts;
  const context=await browser.newContext({viewport:{width,height:width<600?900:1080},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  page.on('dialog',async d=>{console.error('DIALOG',d.message());await d.dismiss();});page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message);});page.on('response',r=>{if(r.status()>=400&&/blackcrown|black-crown/.test(r.url()))failed.push({url:r.url(),status:r.status()});});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_admin_token','fixture');});
  await page.goto(base+'/?screen=buy');await page.waitForFunction(()=>typeof renderShell==='function');await page.waitForSelector('#key');
  const row=blackcrownPackCatalogRow(f.settings,(await f.pg.query('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1')).rows);
  await page.evaluate(row=>{document.querySelector('[data-miracle-close]')?.click();API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'블랙크라운팩 검수',serverUserId:1,role:'USER',coin:100000000000000,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));applyServerPacks([row]);selectedPackId=row.id;renderShell('buy');},row);
  assert.equal(await page.locator('.blackcrown-shop-hero h2').innerText(),'블랙크라운팩');assert.equal(await page.locator('[data-pack-id="mercenary-blackcrown-ss-limited"] strong').innerText(),'블랙크라운팩');
  await page.locator('.blackcrown-shop-art img').evaluate(i=>i.decode());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('.blackcrown-shop-main').screenshot({path:path.join(out,'shop-'+width+'.png')});
  await page.locator('[data-blackcrown-pack-enter]').click();await page.locator('[data-bcp-buy="1"]:not([disabled])').waitFor();assert.equal(await page.locator('#bcp-title').innerText(),'블랙크라운팩');
  assert.equal(await page.locator('[data-bcp-bulk-start]').isDisabled(),false);assert.match(await page.locator('[data-bcp-availability]').innerText(),/개봉 가능/);
  await page.locator('[data-bcp-budget-preset="100000000000000"]').click();assert.match(await page.locator('[data-bcp-bulk-quote]').innerText(),/66,666회/);
  await page.locator('[data-bcp-bulk-start]').click();assert.match(await page.locator('[data-bcp-confirm-text]').innerText(),/66,666회/);await page.locator('[data-bcp-confirm-cancel]').click();assert.equal(posts,postStart);
  assert.match(await page.locator('[data-bcp-ownership]').innerText(),/현재 2종 보유.*1\/2/);
  for(const stock of (await f.state()).stock.filter(r=>/^V-95[0-5]$/.test(r.code)))assert.match(await page.locator('.bcp-dialog [data-bcp-stock-code="'+stock.code+'"]').innerText(),new RegExp('남은 '+stock.remaining+'장'));
  await page.locator('[data-bcp-buy="1"]').click();await page.locator('[data-bcp-confirm-cancel]').click();assert.equal(posts,postStart);
  assert.equal(await page.locator('.bcp-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.notEqual(await page.locator('.bcp-dialog').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');await page.locator('.bcp-dialog').evaluate(e=>e.scrollTop=0);await page.locator('.bcp-dialog').screenshot({path:path.join(out,'room-on-'+width+'.png')});
  await page.locator('[data-bcp-close]').click();await page.goto(base+'/cms#mercenaries/blackcrown');await page.locator('[data-blackcrown-price="single"]').waitFor();
  assert.equal(await page.locator('[data-blackcrown-mode]').inputValue(),'ON');assert.equal(await page.locator('[data-blackcrown-mode] option[value=ON]').evaluate(e=>e.disabled),false);assert.equal(await page.locator('[data-blackcrown-price="single"]').inputValue(),'1500000000');
  assert.match(await page.locator('[data-blackcrown-root] .blackcrown-ownership-rule').innerText(),/현재 보유 종류/);
  await page.locator('[data-blackcrown-mode]').selectOption('OFF');await page.locator('[data-blackcrown-save]').click();await page.waitForFunction(()=>document.querySelector('[data-blackcrown-root] .mlc-hero').textContent.includes('판매 상태 · OFF'));
  await page.reload();await page.locator('[data-blackcrown-mode]').waitFor();assert.equal(await page.locator('[data-blackcrown-mode]').inputValue(),'OFF');
  await page.locator('[data-blackcrown-mode]').selectOption('ON');await page.locator('[data-blackcrown-save]').click();await page.waitForFunction(()=>document.querySelector('[data-blackcrown-root] .mlc-hero').textContent.includes('판매 상태 · ON'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('[data-blackcrown-root] .mlc-hero').screenshot({path:path.join(out,'cms-'+width+'.png')});
  const sourceSettings=structuredClone(f.settings);f.settings.normalRankRatesPpm=Object.fromEntries(Object.keys(f.settings.normalRankRatesPpm).map(r=>[r,r==='SSS'?1000000:0]));f.settings.missRatePpm=0;f.settings.normalSssRatePpm=0;f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-952'?1000000:0]));await f.configure(30);
  await page.goto(base+'/room');await page.locator('[data-bcp-buy="1"]:not([disabled])').waitFor();await page.locator('[data-bcp-buy="1"]').click();await page.locator('[data-bcp-confirm-start]').click();await page.waitForFunction(()=>document.querySelector('[data-bcp-result-total]').textContent.includes('1회 개봉'));assert.equal(posts,postStart+1);await page.locator('[data-bcp-result-total]').scrollIntoViewIfNeeded();await page.locator('.bcp-dialog').screenshot({path:path.join(out,'result-'+width+'.png')});await page.locator('[data-bcp-close]').click();
  Object.assign(f.settings,sourceSettings);await f.configure(40);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,shopName:true,shopEntry:true,openingEnabled:true,ssStockLimit:65,distinctOwnedTypes:2,ssProbabilityDivisor:2,cmsSaveReload:true,bulkCountAt100Trillion:66666,cmsOnEnabled:true,confirmationCancelledWithoutCharge:true,isolatedOpeningResult:true,errors,failed});await context.close();
 }
 assert.equal(posts,reports.length);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',reports,productionTransactions:0},null,2));console.log(JSON.stringify(reports));
}catch(error){for(const ctx of browser.contexts())for(const page of ctx.pages()){console.error((await page.locator('body').innerText()).slice(-6000));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}throw error;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));for(const fn of cleanup)await fn();}
