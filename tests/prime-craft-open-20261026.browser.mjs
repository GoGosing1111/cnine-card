import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {handleWorkshop} from '../functions/_workshop.js';
import {ensurePrimeMaterialCatalog} from '../functions/_mercenary_prime_material.js';
import {saveMercenaryCraft} from '../functions/_mercenary_craft.js';
import {PRIME_CRAFT_KEY} from '../shared/mercenary-craft-v1.mjs';
const root=process.cwd(),primary='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site',out=path.join(root,'docs/qa/prime-craft-open-20261026'),cleanup=[],reports=[],errors=[],failed=[];
fs.mkdirSync(out,{recursive:true});const f=await equipmentFixture({after:fn=>cleanup.push(fn)});let posts=0;
await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();await ensurePrimeMaterialCatalog(f.env);
const material='MERCENARY_PRIME_DEPLETED_CARD',blueprint='PRIME_REQUIEM_BLUEPRINT';
await f.p("INSERT INTO inventory_items(code,name,category,image_url,is_active) VALUES(?,'프라임 레퀴엠 설계도','MATERIAL','assets/items/prime-requiem-blueprint-v1.webp',1)",blueprint).run();
for(const item of [material,blueprint])await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,3,3)',item).run();
const configured=revision=>({code:'WORKSHOP_PRIME_REQUIEM',category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-975',outputQuantity:1,paymentMode:'BOTH',craftRevision:revision,coinCost:150000000000000,masterStarCost:0,successRate:100,materials:[{itemCode:material,quantity:1},{itemCode:blueprint,quantity:1}],isActive:false,isPublic:true});
const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
const client=`window.loadUser=()=>({id:7,serverUserId:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),{status:r.status});return d;};`;
const workshop=`<!doctype html><html lang="ko">${head}<link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><link rel="stylesheet" href="/css/workshop-workbench-v1.css"><link rel="stylesheet" href="/css/command-ui-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}.modal{display:none}button{font-family:inherit}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><div id="modal" class="modal"></div><script>${client}</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'MERCENARY_CRAFT'});bindWorkshopView();</script></html>`;
const admin=`<!doctype html><html lang="ko">${head}<link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css"><style>body{display:block;padding:12px}#cms{max-width:1340px;margin:auto}#nav{display:block}.view[hidden]{display:none!important}input,select{min-width:0;max-width:100%}</style><h1 id="pageTitle">격리 CMS 검수</h1><nav id="nav"><button data-view="equipment">장비</button></nav><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','local-account-7')</script><script src="/admin/workshop-admin-v1668.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET')posts++;
 if(['/qa/workshop','/qa/cms'].includes(url.pathname))return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(url.pathname.endsWith('workshop')?workshop:admin);
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});const response=await handleWorkshop({path:url.pathname.slice(5),request,env:f.env,deps:{...f.deps,readBody:r=>r.json()}});res.writeHead(response?.status||404,Object.fromEntries(response?.headers||[]));return res.end(response?await response.text():'{}');}
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 let file;for(const base of [root,primary]){const candidate=path.resolve(base,'.'+decodeURIComponent(url.pathname));if(candidate.startsWith(path.resolve(base)+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()){file=candidate;break;}}
 if(!file)return res.writeHead(404).end('not found');const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.json':'application/json','.woff2':'font/woff2'};res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e.message);res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const width of [1280,390]){
  const saved=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',PRIME_CRAFT_KEY).first())?.value||'{"revision":0}');
  await saveMercenaryCraft(f.env,f.user,configured(saved.revision));
  await f.p('UPDATE users SET coin=300000000000000 WHERE id=7').run();
  await f.p('UPDATE cnine_user_inventory SET quantity=3 WHERE user_id=7 AND item_code IN (?,?)',material,blueprint).run();
  const page=await browser.newPage({viewport:{width,height:width>700?960:844},serviceWorkers:'block'});await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});page.on('dialog',d=>{if(d.type()==='alert')console.log('QA alert:',d.message());return d.accept();});
  await page.goto(base+'/qa/cms');await page.locator('[data-view="workshop"]').click();await page.waitForFunction(()=>document.querySelector('#workshopAdminLoadV1668')?.textContent.includes('연결 완료'));await page.locator('#workshopAdminPrime').click();
  assert(await page.locator('#kaironActive').isEnabled());assert.equal(await page.locator('#kaironActive').isChecked(),false);
  await page.locator('#kaironActive').check();const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/workshop')&&r.request().method()==='POST');await page.locator('#kaironSave').click();assert.equal((await response).status(),200);
  await page.reload();await page.locator('[data-view="workshop"]').click();await page.waitForFunction(()=>document.querySelector('#workshopAdminLoadV1668')?.textContent.includes('연결 완료'));await page.locator('#workshopAdminPrime').click();assert(await page.locator('#kaironActive').isChecked());
  assert.equal(await page.locator('#kaironCoin').inputValue(),'150000000000000');assert.equal(await page.locator('#kaironRate').inputValue(),'100');
  await page.locator('#workshopRecipeEditorV1668 img').evaluate(i=>i.decode());await page.locator('#workshopRecipeEditorV1668').screenshot({path:out+'/cms-'+width+'.png'});
  await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('.ws-prime-forge').waitFor();assert(await page.locator('#wsMaterialCraft').isEnabled());assert.match(await page.locator('.ws-prime-forge').innerText(),/설계도/);assert.match(await page.locator('.ws-prime-forge').innerText(),/150조/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('.ws-prime-forge img').first().evaluate(i=>i.decode());await page.locator('.ws-prime-forge').screenshot({path:out+'/workshop-'+width+'.png'});
  const crafted=page.waitForResponse(r=>r.url().endsWith('/api/workshop/craft')&&r.request().method()==='POST');await page.locator('#wsMaterialCraft').click();const result=await crafted;assert.equal(result.status(),200);assert.equal((await result.json()).success,true);
  assert.equal(await f.coin(),150000000000000);assert.equal(await f.quantity(material),2);assert.equal(await f.quantity(blueprint),2);
  await f.p('UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=7 AND item_code=?',blueprint).run();await page.reload();await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('.ws-prime-forge').waitFor();assert(await page.locator('#wsMaterialCraft').isDisabled());
  reports.push({width,operatorCheckboxEnabled:true,checkedSavedReloaded:true,economicsPreserved:true,userCraftSucceeded:true,missingMaterialDisabled:true,horizontalOverflow:false});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.equal(posts,4);fs.writeFileSync(out+'/browser.json',JSON.stringify({status:'PASSED',reports,isolatedPosts:posts,productionAccountWrites:0,errors,failed},null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));for(const fn of cleanup.reverse())await fn();}
