// Actual CMS/player components against isolated SQLite. No production mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {saveMercenaryCraft,readMercenaryCraft,readMercenaryCraftStock} from '../functions/_mercenary_craft.js';
import {LIMITED_SHARD_CRAFTS,LIMITED_CRAFT_SHARD} from '../shared/mercenary-limited-shard-craft-v1.mjs';
import {handleWorkshop,__workshopCraftTest} from '../functions/_workshop.js';

const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'docs/qa/mercenary-limited-shard-craft-20261025');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await equipmentFixture({after:cb=>cleanup.push(cb)}),checks=[],errors=[],writes=[];
await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
await f.p("INSERT INTO inventory_items(code,name,category,is_active,image_url) VALUES(?,'SSS 리미티드 조각','MATERIAL',1,'assets/items/sss-limited-shard-20261020/item.webp')",LIMITED_CRAFT_SHARD).run();
await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,100,100)',LIMITED_CRAFT_SHARD).run();
const common='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/command-ui-v1.css"><link rel="stylesheet" href="/css/mercenary-shard-craft-v1.css">';
const html=`<!doctype html><html lang="ko">${common}<link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><link rel="stylesheet" href="/css/workshop-workbench-v1.css"><link rel="stylesheet" href="/css/mercenary-craft-reveal-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}.modal{display:none}.modal.show{display:flex;position:fixed;inset:0;z-index:999;background:#000b;align-items:center;justify-content:center;overflow:auto}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><div id="modal" class="modal"></div><script>localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/mercenary-craft-reveal-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'MERCENARY_CRAFT'});bindWorkshopView();</script></html>`;
const admin=`<!doctype html><html lang="ko"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css">${common}<style>body{display:block;padding:20px}#cms{max-width:1340px;margin:auto}#nav{display:block}.view[hidden]{display:none!important}input,select{min-width:0;max-width:100%}</style><h1 id="pageTitle">격리 CMS 검수</h1><nav id="nav"><button data-view="equipment">장비</button></nav><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');</script><script src="/admin/workshop-admin-v1668.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(['/qa/workshop','/qa/cms'].includes(url.pathname)){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(url.pathname.endsWith('cms')?admin:html);}
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  if(req.method==='POST')writes.push({path:url.pathname,body:JSON.parse(body)});
  const response=await handleWorkshop({path:url.pathname.slice(5),request:new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body})}),env:f.env,deps:{...f.deps,readBody:r=>r.json()}});
  res.writeHead(response?.status||404,{'content-type':'application/json'});return res.end(response?await response.text():'{}');
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('Not found');}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--explicitly-allowed-ports='+server.address().port]});
try{
 for(const width of [1440,390,320]){
  const definition=LIMITED_SHARD_CRAFTS.find(d=>d.code===({1440:'V-996',390:'V-979',320:'V-972'}[width]));
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/qa/cms');await page.locator('[data-view=workshop]').click();await page.locator('#workshopAdminLimitedShard').click();
  await page.locator(`[data-workshop-recipe-id="${definition.draftId}"]`).click();
  assert.equal(await page.locator('#kaironCoin').inputValue(),'');assert.equal(await page.locator('#kaironStars').inputValue(),'');assert.equal(await page.locator('#kaironRate').inputValue(),'');
  assert.equal(await page.locator('[data-workshop-material-qty]').inputValue(),'');assert(await page.locator('[data-workshop-material-code]').isDisabled());assert(await page.locator('[data-workshop-material-remove]').isDisabled());
  assert.match(await page.locator('#limitedShardCraftStock').innerText(),/SSS 리미티드 조각 발행수량/);
  assert.equal(await page.locator('.shard-craft-list-title').count(),1);assert.equal(await page.locator('.workshop-admin-list-v1668 button').count(),15); // one equipment fixture + 14 mercenaries
  for(const [id,value] of [['kaironCoin','100'],['kaironStars','1'],['kaironRate','100']])await page.locator('#'+id).fill(value);
  await page.locator('[data-workshop-material-qty]').fill('1');
  await page.locator('#limitedShardStockAdd').click();await page.waitForFunction(()=>document.getElementById('limitedShardStockNotice')?.textContent.includes('5장 추가 완료'));
  assert.equal(await page.locator('#kaironCoin').inputValue(),'100','+5 preserves unsaved costs');assert.equal((await readMercenaryCraft(f.env,definition)).policy.coinCost,null);assert.equal((await readMercenaryCraftStock(f.env,definition)).limit,10);
  assert.equal(await page.locator('#limitedShardStockAdd').evaluate(b=>getComputedStyle(b).color),'rgb(24, 36, 10)');
  assert.match(await page.locator('#limitedShardStockAdd').evaluate(b=>getComputedStyle(b).borderImageSource),/action-user-approved.webp/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('#workshopRecipeEditorV1668').screenshot({path:path.join(out,width+'-cms.png')});
  // Save with publication only, verify player cannot craft until operational ON.
  await page.locator('#kaironPublic').check();await page.locator('#kaironSave').click();
  await page.waitForFunction(()=>!document.getElementById('kaironSave')?.disabled);
  const id=Number((await f.p('SELECT id FROM workshop_recipes_v1668 WHERE code=?',definition.recipeCode).first()).id);
  await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();
  const selector=page.locator(`[data-material-recipe="${id}"]`);if(await selector.count())await selector.click();
  await page.locator('.ws-shard-craft').waitFor();assert(await page.locator('#wsMaterialCraft').isDisabled());
  await page.locator('.ws-shard-craft').screenshot({path:path.join(out,width+'-locked.png')});
  const {policy}=await readMercenaryCraft(f.env,definition);
  await saveMercenaryCraft(f.env,f.user,{code:definition.recipeCode,category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:definition.code,outputQuantity:1,paymentMode:'BOTH',craftRevision:policy.revision,...policy,isActive:true});
  await page.reload();await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();if(await selector.count())await selector.click();assert(await page.locator('#wsMaterialCraft').isEnabled());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert(await page.getByRole('img',{name:definition.art.name+' 승인 원화'}).evaluate(i=>i.complete&&i.naturalWidth>0));
  await page.locator('.ws-shard-craft').screenshot({path:path.join(out,width+'-ready.png')});
  await page.locator('#wsMaterialCraft').click();await page.locator('.mc-skip').click();await page.locator('.mc-done').waitFor();assert.match(await page.locator('[data-result-name]').innerText(),new RegExp(definition.art.name));await page.locator('.mc-done').click();
  assert.equal((await readMercenaryCraftStock(f.env,definition)).crafted,1);
  assert.equal(writes.filter(w=>w.path==='/api/workshop/craft'&&w.body.recipeId===id).length,1);
  checks.push({width,draftLocked:true,independentInitialStock:5,stockAdded:5,unsavedFormPreserved:true,requiredMaterialFixed:true,savedOffThenOn:true,craftSuccess:true,outputNameCorrect:true,duplicateCharge:false,overflow:false,approvedPanelAndButton:true});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASS',checks,errors,productionMutations:0,visualApproval:'not claimed'},null,2));console.log(JSON.stringify({status:'PASS',checks,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
