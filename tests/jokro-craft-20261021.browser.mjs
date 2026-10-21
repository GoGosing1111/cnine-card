// Isolated SQLite fixtures and actual UI only. No live account mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {saveMercenaryCraft,readMercenaryCraft} from '../functions/_mercenary_craft.js';
import {mercenaryCraftDefinition,jokroCraftDraft} from '../shared/mercenary-craft-v1.mjs';
import {handleWorkshop,__workshopCraftTest} from '../functions/_workshop.js';
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'docs/qa/jokro-craft-20261021');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await equipmentFixture({after:cb=>cleanup.push(cb)}),checks=[],errors=[];
await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
await f.p("INSERT INTO inventory_items(code,name,category,is_active,image_url) VALUES('MERCENARY_SSS_CARD_SHARD','SSS 용병 카드 조각','MATERIAL',1,'assets/items/mercenary-sss-card-shard-v1.png')").run();
await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'MERCENARY_SSS_CARD_SHARD',100,100)").run();
await f.p("UPDATE cnine_user_inventory SET quantity=100000000 WHERE item_code='MASTER_STAR'").run();
await saveMercenaryCraft(f.env,f.user,{code:'WORKSHOP_KAIRON',category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-988',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,coinCost:1e12,masterStarCost:1e6,successRate:2,materials:[{itemCode:'MERCENARY_SSS_CARD_SHARD',quantity:5}],isActive:true,isPublic:true});
let jokroId;
const definition=mercenaryCraftDefinition('WORKSHOP_JOKRO');
async function setJokro(extra={}){const {policy}=await readMercenaryCraft(f.env,definition);jokroId=await saveMercenaryCraft(f.env,f.user,{...jokroCraftDraft(),...extra,code:'WORKSHOP_JOKRO',category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-979',outputQuantity:1,paymentMode:'BOTH',craftRevision:policy.revision});}
await setJokro();
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><link rel="stylesheet" href="/css/workshop-workbench-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}.modal{display:none}.modal.show{display:flex;position:fixed;inset:0;z-index:999;background:#000b;align-items:center;justify-content:center;overflow:auto}button{font-family:inherit}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><div id="modal" class="modal"></div><script>localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'MERCENARY_CRAFT'});bindWorkshopView();</script></html>`;
const admin=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css"><style>body{display:block;padding:20px}#cms{max-width:1340px;margin:auto}#nav{display:block}.view[hidden]{display:none!important}input,select{min-width:0;max-width:100%}</style><h1 id="pageTitle">격리 CMS 검수</h1><nav id="nav"><button data-view="equipment">장비</button></nav><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','local-account-7');</script><script src="/admin/workshop-admin-v1668.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(['/qa/workshop','/qa/cms'].includes(url.pathname)){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(url.pathname.endsWith('cms')?admin:html);}
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
  await setJokro();await f.p("DELETE FROM workshop_craft_logs_v1668 WHERE output_ref='V-979'").run();
  const page=await browser.newPage({viewport,hasTouch:label==='mobile',serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/qa/cms');await page.locator('[data-view=workshop]').click();await page.locator('#workshopAdminJokro').click();await page.locator('.workshop-jokro-admin').waitFor();
  for(const [id,value] of [['kaironCoin','1000000000000'],['kaironStars','10000000'],['kaironRate','1']])assert.equal(await page.locator('#'+id).inputValue(),value);
  assert.equal(await page.locator('[data-workshop-material-qty]').inputValue(),'15');assert.equal(await page.locator('#kaironActive').isChecked(),false);assert.equal(await page.locator('#kaironPublic').isChecked(),false);
  assert.match(await page.locator('.workshop-jokro-admin').innerText(),/남은 2장/);
  const revision=(await readMercenaryCraft(f.env,definition)).policy.revision;
  await page.locator('#kaironSave').click();await page.waitForFunction(()=>!document.getElementById('kaironSave')?.disabled);
  assert.equal((await readMercenaryCraft(f.env,definition)).policy.revision,revision+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,label+'-cms.png'),fullPage:true});
  await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('.ws-kairon-forge').waitFor();assert.equal(await page.locator('.ws-jokro-forge').count(),0);
  await setJokro({isPublic:true});await page.reload();await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('[data-material-recipe="'+jokroId+'"]').click();await page.locator('.ws-jokro-forge').waitFor();
  assert.equal(await page.locator('#wsMaterialCraft').isDisabled(),true);assert.match(await page.locator('.ws-jokro-forge').innerText(),/성공 확률 1%/);
  assert.match(await page.locator('#wsMaterialCraft').evaluate(b=>getComputedStyle(b).borderImageSource),/jokro-craft-20261021\/panel.webp/);
  await page.screenshot({path:path.join(out,label+'-locked.png'),fullPage:true});
  await setJokro({isActive:true,isPublic:true});await page.reload();await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('[data-material-recipe="'+jokroId+'"]').click();
  assert.equal(await page.locator('#wsMaterialCraft').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await page.getByRole('img',{name:'족로 승인 원화'}).evaluate(i=>i.complete&&i.naturalWidth>0),true);
  await page.screenshot({path:path.join(out,label+'-ready.png'),fullPage:true});
  await page.locator('.ws-mercenary-select button').first().click();assert.equal(await page.locator('.ws-jokro-forge').count(),0);await page.locator('[data-material-recipe="'+jokroId+'"]').click();assert.equal(await page.locator('.ws-jokro-forge').count(),1);
  // Force success only inside the local fixture to verify both final slots and lock.
  await setJokro({isActive:true,isPublic:true,successRate:100});
  for(const n of [1,2])await __workshopCraftTest.craft(f.env,f.user,{recipeId:jokroId,requestId:label+'-'+n,paymentType:'BOTH'});
  await page.reload();await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('[data-material-recipe="'+jokroId+'"]').click();
  assert.match(await page.locator('.ws-kairon-stock').innerText(),/남은 0장/);assert.equal(await page.locator('#wsMaterialCraft').isDisabled(),true);
  await page.screenshot({path:path.join(out,label+'-sold-out.png'),fullPage:true});checks.push({label,cmsExactSaved:true,hiddenWhilePrepared:true,selector:true,offDisabled:true,readyEnabled:true,soldOutDisabled:true,overflow:false});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASS',checks,errors,productionMutations:0,visualApproval:'not claimed'},null,2));console.log(JSON.stringify({status:'PASS',checks,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
