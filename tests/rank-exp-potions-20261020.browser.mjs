import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {potionFixture} from './helpers/rank-exp-potion-fixture.mjs';
import {handleRankExpPotion,readRankExpPotion} from '../functions/_rank_exp_potion.js';
const root=process.cwd(),out=resolve('docs/qa/rank-exp-potions-20261020');mkdirSync(out,{recursive:true});
const app=readFileSync('js/app.js','utf8'),entry=app.slice(app.indexOf('async function openInventoryPack('),app.indexOf("  if(itemCode==='ICON_CARD_CHOICE_TICKET')"))+'}';
const recovery=app.slice(app.indexOf('function inventoryPendingGifts(){'),app.indexOf('const INVENTORY_GROUPS=')),icon=app.slice(app.indexOf('function inventoryIcon('),app.indexOf('function inventoryItemGroup('));
const operations=app.slice(app.indexOf('const LIVE_OPERATION_META='),app.indexOf('function packImagePath('));
let f,dropResponse=false,posts=0;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host),base=url.origin;
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/qa')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/inventory-v2125.css"><link rel="stylesheet" href="/css/live-operations-v1868.css"><link data-rank-potion-style rel="stylesheet" href="/css/rank-exp-potion-v1.css?v=20261020-v1"><body style="background:#080c17;color:white;font-family:sans-serif;padding:16px"><button id="open2">2배 물약 사용</button><button id="open3">3배 물약 사용</button><button data-live-operations-open>콘텐츠 현황</button><div data-live-operations-list="all" class="live-operations-list" style="max-width:800px"></div><section id="inventoryGiftRecovery" class="iv25-gift-recovery" hidden></section><dialog id="inventoryDetailDialog" class="iv25-dialog"><div class="iv25-dialog-head"><b>아이템 상세</b><button onclick="this.closest('dialog').close()" aria-label="닫기">×</button></div><div id="inventoryDialogContent"></div></dialog><script>
 let currentOwner=7;const API_MODE=true,API_TOKEN='local-account-7',loadUser=()=>({serverUserId:currentOwner}),clearApiCache=()=>{},renderShell=()=>{},escapeHtml=s=>String(s).replaceAll('<','&lt;');
 const burningEventIsActive=()=>true,burningMode=()=>'MIRACLE',burningEventNumbers=()=>({coins:5,minutes:60}),burningMultiplierText=String,burningRemainingText=()=>'00:42:00 남음';
 const apiRequest=async(path)=>{const r=await fetch('/api/'+path,{headers:{authorization:'Bearer local-account-'+currentOwner}});if(!r.ok)throw Object.assign(Error('fetch failed'),{status:r.status});return r.json();};
 const loadInventory=async()=>{window.refreshed=(window.refreshed||0)+1;document.getElementById('inventoryDialogContent').innerHTML='refreshed inventory';inventoryRenderGiftRecovery();};
 ${entry}\n${recovery}\n${icon}\n${operations}
 document.getElementById('open2').onclick=()=>openInventoryPack('RANK_EXP_POTION_2X_60M',5);document.getElementById('open3').onclick=()=>openInventoryPack('RANK_EXP_POTION_3X_60M',1);
 document.getElementById('inventoryGiftRecovery').onclick=e=>{const target=e.target.closest('[data-inventory-recover]');if(target)openInventoryPack(target.dataset.inventoryRecover,0);};
 loadLiveOperations(true).then(()=>window.ready=true);
 </script></body></html>`);
 if(url.pathname==='/api/live-operations')return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({serverNow:new Date().toISOString(),items:[],pollSeconds:30}));
 if(url.pathname.startsWith('/api/rank-exp-potion/')){
  let body='';for await(const chunk of req)body+=chunk;
  const response=await handleRankExpPotion({path:url.pathname.slice(5),request:new Request(base+url.pathname+url.search,{method:req.method,headers:{...req.headers,origin:base},...(body?{body}:{})}),env:f.env,deps:f.deps});
  if(url.pathname.endsWith('/use')){posts++;if(dropResponse&&response.status===200){dropResponse=false;return res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'검수: 사용 후 응답 유실',retryable:true}));}}
  return res.writeHead(response.status,{'content-type':'application/json'}).end(await response.text());
 }
 const file=resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+'\\')&&!file.startsWith(root+'/'))return res.writeHead(403).end();
 const bytes=readFileSync(file);return res.writeHead(200,{'content-type':({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}).end(bytes);
}catch(error){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:error.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
try{
 for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
  f=await potionFixture(null);await f.p("UPDATE cnine_user_inventory SET quantity=1,unseen_quantity=1 WHERE item_code='RANK_EXP_POTION_3X_60M'").run();
  const page=await browser.newPage({viewport:{width,height},isMobile:width<700,hasTouch:width<700}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/qa');await page.waitForFunction(()=>window.ready);await page.locator('#open2').click();await page.locator('[data-potion-use]').waitFor();
  await page.locator('[data-potion-cancel]').click();assert.equal(await f.stock(2),5);await page.locator('#open2').click();await page.locator('[data-potion-use]').waitFor();
  await page.locator('.rank-potion-heading img').evaluate(i=>i.decode());const layout=await page.locator('.rank-potion-dialog').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,width:el.getBoundingClientRect().width,frame:getComputedStyle(el).borderImageSource}));
  assert.equal(layout.overflow,false);assert(layout.width<=width);assert.match(layout.frame,/panel.webp/);
  assert(await page.locator('.rank-potion-heading').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.iv25-dialog-head').getBoundingClientRect().bottom));
  await page.screenshot({path:join(out,'use-'+width+'.png')});
  await page.locator('[data-potion-use]').focus();await page.keyboard.press('Enter');await page.locator('[data-potion-done]').waitFor();assert.equal(await f.stock(2),4);await page.locator('[data-potion-done]').click();
  await page.locator('#open2').click();await page.locator('[data-potion-use]').filter({hasText:'60분 연장'}).waitFor();await page.screenshot({path:join(out,'extend-'+width+'.png')});await page.locator('[data-potion-use]').click();await page.locator('[data-potion-done]').waitFor();assert((await readRankExpPotion(f.env,7)).remainingSeconds>7100);await page.locator('[data-potion-done]').click();
  await page.locator('#open3').click();await page.locator('[data-potion-use]').filter({hasText:'배율 교체'}).waitFor();assert.match(await page.locator('[data-potion-replace]').textContent(),/기존 ×2의 남은 시간은 사라지고/);
  await page.locator('.rank-potion-heading img').evaluate(i=>i.decode());await page.screenshot({path:join(out,'replace-'+width+'.png')});
  dropResponse=true;const before=posts;await page.locator('[data-potion-use]').click();await page.locator('output').filter({hasText:'응답 유실'}).waitFor();assert.equal(posts,before+1);assert.equal(await f.stock(3),0);
  await page.keyboard.press('Escape');await page.locator('[data-inventory-recover="RANK_EXP_POTION_3X_60M"]').click();await page.locator('[data-potion-done]').waitFor();assert.equal(posts,before+1);assert.equal((await readRankExpPotion(f.env,7)).revision,3);await page.locator('[data-potion-done]').click();
  // Re-entering fetches the private server state, independent of local receipt storage.
  await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('[data-live-operations-open]').click();
  const live=page.locator('#liveOperationsDialog');assert.equal(await live.locator('[data-live-burning-event="MIRACLE"]').count(),1);assert.equal(await live.locator('.kind-rank-exp-potion').count(),1);assert.match(await live.locator('[data-live-operations-count]').textContent(),/2건/);assert.match(await live.locator('.kind-rank-exp-potion').textContent(),/적용 중.*계급 경험치 ×3/);
  assert.match(await live.locator('[data-rank-potion-countdown]').textContent(),/^0[01]:[0-5][0-9]:[0-5][0-9]$/);await live.locator('.kind-rank-exp-potion img').evaluate(i=>i.decode());
  const statusLayout=await live.evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,width:el.getBoundingClientRect().width}));assert.equal(statusLayout.overflow,false);assert(statusLayout.width<=width);
  await page.screenshot({path:join(out,'status-'+width+'.png')});
  await page.evaluate(()=>{setRankExpPotionState({...rankExpPotionState,revision:1,multiplier:2});renderLiveOperations();});assert.match(await live.locator('.kind-rank-exp-potion').textContent(),/×3/);
  await page.evaluate(()=>{currentOwner=8;renderLiveOperations();});assert.equal(await live.locator('.kind-rank-exp-potion').count(),0);
  await page.evaluate(()=>{currentOwner=7;renderLiveOperations();rankExpPotionServerOffset+=3700000;updateLiveOperationClocks();});assert.equal(await live.locator('.kind-rank-exp-potion').count(),0);assert.match(await live.locator('[data-live-operations-count]').textContent(),/1건/);
  assert.deepEqual(errors,[]);checks.push({viewportWidth:width,viewportHeight:height,dialog:layout,statusLayout,cancelWithoutConsumption:true,sameExtends:true,differentReplaces:true,zeroStockReceiptRecovery:true,reloadRestoresPersonalStatus:true,miracleCoexists:true,expiryHides:true,accountIsolation:true,errors});
  await page.close();await f.close();f=null;
 }
 writeFileSync(join(out,'browser.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({checks},null,2));
}finally{await browser.close();await f?.close();await new Promise(r=>server.close(r));}
