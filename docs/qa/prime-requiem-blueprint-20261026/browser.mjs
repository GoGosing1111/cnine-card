import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {blueprintFixture} from './fixture.mjs';
import {MATERIAL} from './register.mjs';
import {handleWorkshop} from '../../../functions/_workshop.js';
import {PRIME_CRAFT_KEY} from '../../../shared/mercenary-craft-v1.mjs';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../../..'),cleanup=[],reports=[],errors=[],failed=[];
const f=await blueprintFixture({after:fn=>cleanup.push(fn)});let posts=0;
const app=fs.readFileSync(root+'/js/app.js','utf8'),inventory=app.slice(app.indexOf('const RETIREMENT_REROLL_META='),app.indexOf('let landSuperstarBusy=false;'));
const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/">';
const item={...MATERIAL,quantity:3,usable:false,unseenQuantity:0};
const inventoryHtml=`<!doctype html><html lang="ko">${head}<link rel="stylesheet" href="/css/inventory-v2125.css"><style>body{margin:0;padding:12px;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}main{max-width:1280px;margin:auto}*{box-sizing:border-box}</style><main id="view"></main><script>const loadUser=()=>({id:7,serverUserId:7}),summaryBar=()=>'',escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));${inventory};document.getElementById('view').innerHTML=inventoryView();inventoryUiState.items=[${JSON.stringify(item)}];renderInventoryItems(inventoryUiState.items);bindInventoryControls(document.getElementById('inventoryVault'));document.getElementById('inventoryVault').setAttribute('aria-busy','false');</script></html>`;
const adminHtml=`<!doctype html><html lang="ko">${head}<link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css"><style>body{display:block;padding:12px}#cms{max-width:1340px;margin:auto}#nav{display:block}.view[hidden]{display:none!important}input,select{min-width:0;max-width:100%}</style><h1 id="pageTitle">제작소 관리</h1><nav id="nav"><button data-view="equipment">장비</button></nav><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','local-account-7')</script><script src="/admin/workshop-admin-v1668.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/qa/inventory'||url.pathname==='/qa/cms')return res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(url.pathname.endsWith('cms')?adminHtml:inventoryHtml);
 if(url.pathname==='/api/admin/workshop'){
  if(req.method!=='GET')posts++;
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
  const response=await handleWorkshop({path:'admin/workshop',request,env:f.env,deps:{...f.deps,readBody:r=>r.json()}});
  res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text());
 }
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end('not found');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const width of [1280,390]){
  await f.p('DELETE FROM app_meta WHERE key=?',PRIME_CRAFT_KEY).run();
  const page=await browser.newPage({viewport:{width,height:width>700?900:844},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});page.on('dialog',d=>d.accept());
  await page.goto(base+'/qa/inventory');await page.locator('[data-inventory-select="'+MATERIAL.code+'"]').waitFor();
  await page.locator('#inventorySearch').fill('프라임 레퀴엠');await page.locator('[data-inventory-select="'+MATERIAL.code+'"]').click();
  const detail=page.locator(width<=700?'#inventoryDetailDialog':'#inventoryDetail');
  await detail.locator('img').evaluate(i=>i.decode());assert.match(await detail.innerText(),/프라임 레퀴엠 설계도/);assert(await detail.locator('[data-inventory-use]').isDisabled());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:out+'/inventory-'+width+'.png'});
  await page.goto(base+'/qa/cms');await page.locator('[data-view="workshop"]').click();await page.waitForFunction(()=>document.querySelector('#workshopAdminLoadV1668')?.textContent.includes('연결 완료'));await page.locator('#workshopAdminPrime').click();await page.locator('#kaironMaterialAdd').waitFor();
  await page.locator('#kaironMaterialAdd').click();
  await page.locator('[data-workshop-material-code]').last().selectOption(MATERIAL.code);await page.locator('[data-workshop-material-qty]').last().fill('2');
  const savedResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/workshop')&&r.request().method()==='POST');await page.locator('#kaironSave').click();const saved=await savedResponse;assert.equal(saved.status(),200);assert.equal((await saved.json()).ok,true);
  await page.locator('#workshopAdminReloadV1668').click();await page.waitForFunction(()=>document.querySelector('#workshopAdminLoadV1668')?.textContent.includes('연결 완료'));await page.locator('#workshopAdminPrime').click();
  assert.equal(await page.locator('[data-workshop-material-code]').last().inputValue(),MATERIAL.code);assert.equal(await page.locator('[data-workshop-material-qty]').last().inputValue(),'2');assert.equal(await page.locator('[data-workshop-material-qty]').first().inputValue(),'');
  assert(await page.locator('#kaironActive').isDisabled());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('#workshopRecipeEditorV1668 img').evaluate(i=>i.decode());await page.locator('#workshopRecipeEditorV1668').screenshot({path:out+'/cms-'+width+'.png'});
  reports.push({width,inventoryImageLoaded:true,directUseDisabled:true,cmsSelectedSavedReloaded:true,primeStillLocked:true,defaultQuantityUnchanged:true,horizontalOverflow:false});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.equal(posts,2);
 fs.writeFileSync(out+'/browser.json',JSON.stringify({status:'PASSED',reports,isolatedCmsPosts:posts,productionWrites:0,errors,failed,visualApprovalByUser:false},null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));for(const fn of cleanup.reverse())await fn();}
