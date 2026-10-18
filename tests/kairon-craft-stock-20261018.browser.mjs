// Local isolated SQL and real workshop UI only; never grants production items.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {saveKaironCraft,readKaironCraftStock} from '../functions/_mercenary_craft.js';
import {handleWorkshop,__workshopCraftTest} from '../functions/_workshop.js';
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'docs/qa/kairon-craft-stock-20261018');fs.mkdirSync(out,{recursive:true});
let f,recipeId;const checks=[],errors=[];
const craft=requestId=>__workshopCraftTest.craft(f.env,f.user,{recipeId,requestId,paymentType:'BOTH'});
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><link rel="stylesheet" href="/css/workshop-workbench-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}.modal{display:none}.modal.show{display:flex;position:fixed;inset:0;z-index:999;background:#000b;align-items:center;justify-content:center;overflow:auto}button{font-family:inherit}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><div id="modal" class="modal"></div><script>localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'MERCENARY_CRAFT'});bindWorkshopView();</script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/qa/workshop'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
  const response=await handleWorkshop({path:url.pathname.slice(5),request,env:f.env,deps:{...f.deps,readBody:r=>r.json()}});
  res.writeHead(response?.status||404,Object.fromEntries(response?.headers||[]));return res.end(response?await response.text():'{}');
 }
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end('Not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  f=await equipmentFixture();
  await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
  recipeId=await saveKaironCraft(f.env,f.user,{code:'WORKSHOP_KAIRON',category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-988',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,coinCost:1000,masterStarCost:2,successRate:100,materials:[{itemCode:'QA_MATERIAL',quantity:3}],isActive:true,isPublic:true});
  await f.p("UPDATE inventory_items SET name='SSS 용병 조각',image_url='assets/items/starlight-armor-core-v1749.png' WHERE code='QA_MATERIAL'").run();
  await craft('initial-'+label);
  const page=await browser.newPage({viewport,hasTouch:label==='mobile',serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section="MERCENARY_CRAFT"]').click();await page.locator('.ws-kairon-stock strong').waitFor({timeout:10000}).catch(async e=>{console.error(JSON.stringify({errors,body:(await page.locator('body').innerText()).slice(0,3000)}));throw e;});
  assert.match(await page.locator('.ws-kairon-stock').innerText(),/서버 전체 5장 한정[\s\S]*남은 4장/);assert.equal(await page.locator('#wsMaterialCraft').isEnabled(),true);
  await page.locator('.ws-kairon-stock').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-remaining.png'),fullPage:true});
  const layout=await page.locator('.ws-kairon-forge').evaluate(e=>({overflow:document.documentElement.scrollWidth-innerWidth,stockOverflow:e.querySelector('.ws-kairon-stock').scrollWidth-e.querySelector('.ws-kairon-stock').clientWidth,artLoaded:e.querySelector('img').naturalWidth>0}));assert.ok(layout.overflow<=1);assert.ok(layout.stockOverflow<=1);assert.equal(layout.artLoaded,true);
  await page.locator('#wsMaterialCraft').click();await page.locator('#modal.show button').click();assert.match(await page.locator('.ws-kairon-stock').innerText(),/남은 3장/);
  await craft('third-'+label);await craft('fourth-'+label);await page.reload();await page.locator('[data-ws-section="MERCENARY_CRAFT"]').click();await page.locator('.ws-kairon-stock strong').waitFor();assert.match(await page.locator('.ws-kairon-stock').innerText(),/남은 1장/);
  let drop=true;await page.route('**/api/workshop/craft',async route=>{if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.locator('#wsMaterialCraft').click();await page.getByRole('button',{name:'이전 제작 결과 확인',exact:true}).waitFor();
  assert.match(await page.locator('.ws-kairon-stock').innerText(),/남은 0장/);assert.equal(await page.locator('#wsMaterialCraft').isEnabled(),true);
  await page.locator('#wsMaterialCraft').click();await page.locator('#modal.show button').click();
  assert.equal(await page.locator('#wsMaterialCraft').isDisabled(),true);assert.equal(await page.locator('#wsMaterialCraft').innerText(),'한정 수량 소진');assert.equal((await readKaironCraftStock(f.env)).crafted,5);
  await page.locator('.ws-kairon-stock').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-sold-out.png'),fullPage:true});
  checks.push({label,...layout,remainingVisible:4,updatedAfterCraft:3,soldOutVisible:0,exhaustedReplayRecovered:true,crafted:5});await page.close();await f.close();f=null;
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));if(f)await f.close();}
