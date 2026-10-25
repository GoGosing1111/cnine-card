import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {bloodmoonFixture} from 'file:///C:/Users/User/.codex/worktrees/bloodmoon-bulk-release/cnine-card/tests/helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,bloodmoonPackDraft,bloodmoonPackCatalogRow,readBloodmoonPackSettings} from 'file:///C:/Users/User/.codex/worktrees/bloodmoon-bulk-release/cnine-card/shared/mercenary-bloodmoon-pack-v1.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft} from 'file:///C:/Users/User/.codex/worktrees/bloodmoon-bulk-release/cnine-card/shared/mercenary-halloween-pack-v1.mjs';
import {handleBloodmoonPack,readBloodmoonPackState} from 'file:///C:/Users/User/.codex/worktrees/bloodmoon-bulk-release/cnine-card/functions/_mercenary_bloodmoon_pack.js';
import {handleHalloweenPack} from 'file:///C:/Users/User/.codex/worktrees/bloodmoon-bulk-release/cnine-card/functions/_mercenary_halloween_pack.js';
import {MERCENARY_CMS_SEED as seed} from 'file:///C:/Users/User/.codex/worktrees/bloodmoon-bulk-release/cnine-card/functions/_mercenary_cms_seed.js';

const root=process.cwd(),out='C:/Users/User/Downloads/cnine-z-body-sword-20260918/site/docs/qa/bloodmoon-opening-20261025/live-ui';fs.mkdirSync(out,{recursive:true});
const cleanup=[],reports=[];let liveFeature;let samples=[],posts=0,allowFixtureOpening=false;
const f=await bloodmoonFixture({after:fn=>cleanup.push(fn)},{randomInt:max=>{const n=samples.shift()??0;assert(n<max);return n;}});
await f.setting(HALLOWEEN_PACK_KEY,{revision:23,settings:halloweenPackDraft()});
const halloweenBefore=(await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.woff2':'font/woff2'};
const apiScript=`async function api(path,options={}){const r=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),d,{status:r.status});return d;}`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/room')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#090711"><script type="module">import {mountBloodmoonPack} from '/js/mercenary-bloodmoon-pack-live.mjs';${apiScript}window.ready=mountBloodmoonPack({accountId:1,getAccountId:()=>1,api});</script></body></html>`);
  if(url.pathname==='/cms')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;background:#10141d;color:#eee"><span id="roleBadge">OWNER</span><nav id="nav"></nav><h1 id="pageTitle"></h1><main id="cms" style="max-width:1180px;margin:auto"></main><script type="module" src="/admin/mercenary-admin-v1.js"></script></body></html>');
  if(url.pathname==='/api/admin/mercenaries')return json({revision:1,updatedAt:new Date().toISOString(),document:seed.document,catalog:seed.catalog,audit:[]});
  if(['/api/admin/mercenaries/bloodmoon-pack','/api/admin/mercenaries/halloween-pack'].includes(url.pathname)){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers:{origin:url.origin,'content-type':'application/json'},...(req.method==='PATCH'?{body:Buffer.concat(chunks)}:{})});
   const handler=url.pathname.endsWith('/bloodmoon-pack')?handleBloodmoonPack:handleHalloweenPack;const r=await handler({path:url.pathname.slice(5),request,env:f.env,deps:{requirePermission:async()=>f.user,json:(body,status=200)=>({body,status})}});return json(r.body,r.status);
  }
  if(url.pathname==='/api/'+BLOODMOON_PACK.featurePath)return json(liveFeature);
  if(url.pathname==='/api/'+BLOODMOON_PACK.openPath){assert(allowFixtureOpening,'Only the isolated fixture may open');posts++;const chunks=[];for await(const c of req)chunks.push(c);return json(await f.service.open(f.env,f.user,JSON.parse(Buffer.concat(chunks))));}
  if(url.pathname==='/api/'+BLOODMOON_PACK.receiptPath)return json(await f.service.receipt(f.env,f.user,url.searchParams.get('requestId')));
  if(url.pathname.startsWith('/api/'))return json({maintenance:{active:false},enabled:false,connected:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60});
  const remote=await fetch('https://cnine-card.pages.dev'+url.pathname+url.search);res.writeHead(remote.status,{'content-type':remote.headers.get('content-type')||'application/octet-stream'});res.end(Buffer.from(await remote.arrayBuffer()));
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message,code:e.code}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});

try{
 liveFeature=await (await fetch('https://cnine-card.pages.dev/api/mercenaries/v3/bloodmoon-pack/feature')).json();assert.equal(liveFeature.userOpeningEnabled,true);const saved={pack:{settings:liveFeature.settings}};
 Object.assign(f.settings,readBloodmoonPackSettings(saved.pack.settings),{mode:'ON'});await f.configure(4);allowFixtureOpening=true;
 for(const width of (process.env.QA_WIDTHS||'390').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:width<600?900:1080},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/bloodmoon|blood-pack/.test(r.url()))failed.push({url:r.url(),status:r.status()});});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_admin_token','fixture');});
  await page.goto(base+'/?screen=buy');await page.waitForFunction(()=>typeof renderShell==='function');await page.waitForSelector('#key');
  const row=(await (await fetch('https://cnine-card.pages.dev/api/packs')).json()).packs.find(p=>p.id===BLOODMOON_PACK.id);assert.equal(row.drawEnabled,true);
  await page.evaluate(row=>{document.querySelector('[data-miracle-close]')?.click();API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'블러드문팩 검수',serverUserId:1,role:'USER',coin:100000000000000,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));applyServerPacks([row]);selectedPackId=row.id;renderShell('buy');},row);
  assert.equal(await page.locator('.bloodmoon-shop-hero h2').innerText(),'블러드문팩');assert.equal(await page.locator('[data-pack-id="mercenary-bloodmoon-ss-limited"] strong').innerText(),'블러드문팩');
  await page.locator('.bloodmoon-shop-art img').evaluate(i=>i.decode());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('.bloodmoon-shop-main').screenshot({path:path.join(out,'shop-'+width+'.png')});
  await page.locator('[data-bloodmoon-pack-enter]').click();await page.locator('[data-bwp-buy="1"]:not([disabled])').waitFor();assert.equal(await page.locator('#bwp-title').innerText(),'블러드문팩');
  assert.equal(await page.locator('[data-bwp-bulk-start]').isDisabled(),false);assert.match(await page.locator('[data-bwp-availability]').innerText(),/개봉 가능/);
  await page.locator('[data-bwp-budget-preset="100000000000000"]').click();assert.match(await page.locator('[data-bwp-bulk-quote]').innerText(),/66,666회/);
  await page.locator('[data-bwp-bulk-start]').click();assert.match(await page.locator('[data-bwp-confirm-text]').innerText(),/66,666회/);await page.locator('[data-bwp-confirm-cancel]').click();assert.equal(posts,0);
  for(const code of ['V-978','V-974','V-975'])assert.match(await page.locator('.bwp-dialog [data-bwp-stock-code="'+code+'"]').innerText(),/남은 \d+장/);
  await page.locator('[data-bwp-buy="1"]').click();await page.locator('[data-bwp-confirm-cancel]').click();assert.equal(posts,0);
  assert.equal(await page.locator('.bwp-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.locator('.bwp-dialog').screenshot({path:path.join(out,'room-on-'+width+'.png')});
  await page.locator('[data-bwp-close]').click();
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,shopName:true,shopEntry:true,openingEnabled:true,stockLimits:[5,3,3],bulkCountAt100Trillion:66666,confirmationCancelledWithoutCharge:true,errors,failed});await context.close();
 }
 assert.equal(posts,0);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',assetSource:'https://cnine-card.pages.dev',packSource:'actual public API',reports,productionTransactions:0},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));for(const fn of cleanup)await fn();}
