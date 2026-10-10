import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {SECRET_POLICE_TITLE as t} from '../functions/_secret_police_title.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.env.TITLE_QA_OUTPUT||'C:/Users/User/.codex/tmp/secret-police-title-20261011/qa');await mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const title={id:1,code:t.code,name:t.name,badgeText:t.name,description:t.description,image:t.image,stylePreset:t.style,fontPreset:'SERIF',unlockType:t.type,unlockConfig:t.config,pvePower:75000,sortOrder:t.order,isActive:true,isPublic:true};
const catalog={items:[],titles:[title],profiles:[],slots:[],supplyBoxSettings:{sources:{}},titleUnlockTypes:['MANUAL'],titleStylePresets:['SECRET_POLICE']};
const server=createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(pathname==='/title-cms-qa'){
  res.writeHead(200,{'content-type':mime['.html']});res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/equipment-admin-v1247.css"><link rel="stylesheet" href="/admin/equipment-admin-v1278.css"><link rel="stylesheet" href="/css/achievement-titles-20260927.css"><style>body{margin:16px;background:#090e18;color:#e2eaf7;font-family:Arial,sans-serif}main{max-width:1200px;margin:auto}input,select,textarea{max-width:100%;box-sizing:border-box}.field{min-width:0}</style><main id="equipmentAdminRoot"></main><script>window.api=async()=>(${JSON.stringify(catalog)});</script><script src="/admin/equipment-admin-v1278.js"></script><script>window.loadEquipmentAdmin(${JSON.stringify(catalog)});</script></html>`);return;
 }
 const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(resolve(root)+sep)||/(^|[/\\])\./.test(pathname)){res.writeHead(403);res.end();return;}
 const content=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(content);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/preview/secret-police-title-20261011/',{waitUntil:'networkidle'});await page.locator('.clv2-title-showcase.is-title-secret_police').waitFor();
  const power=await page.evaluate(()=>({pve:window.titlePreview.getState().bonuses.pve,pvp:window.titlePreview.getState().bonuses.pvp}));assert.deepEqual(power,{pve:75000,pvp:75000});
  const images=await page.locator('img').evaluateAll(images=>images.map(i=>({src:new URL(i.src).pathname,loaded:i.complete&&i.naturalWidth>0,fit:getComputedStyle(i).objectFit})));
  assert(images.every(i=>i.loaded));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const badge=await page.locator('.preview-names .title-style-secret_police').evaluate(el=>getComputedStyle(el,'::before').backgroundImage);assert.match(badge,/secret-police-v1.webp/);
  await page.screenshot({path:out+'/'+name+'-title.png',fullPage:true});
  await page.locator('[data-title-equip="2"]').click();assert.equal(await page.evaluate(()=>window.titlePreview.getState().bonuses.pve),75000);
  await page.locator('[data-title-equip="1"]').click();assert.equal(await page.evaluate(()=>window.titlePreview.getState().bonuses.pvp),75000);
  await page.locator('[data-title-unequip]').click();await page.waitForFunction(()=>window.titlePreview.getState().bonuses.pve===0&&window.titlePreview.getState().bonuses.pvp===0);
  await page.goto(base+'/preview/secret-police-title-20261011/?locked=1',{waitUntil:'networkidle'});assert.equal(await page.locator('[data-title-equip]').count(),0);await page.screenshot({path:out+'/'+name+'-locked.png',fullPage:true});
  await page.goto(base+'/title-cms-qa',{waitUntil:'networkidle'});await page.locator('[data-eq-tab="titles"]').click();await page.locator('[data-eq-title-edit="1"]').click();
  assert.equal(await page.locator('#eqTitlePower').inputValue(),'75000');assert.equal(await page.locator('#eqTitleUnlock').inputValue(),'MANUAL');assert.equal(await page.locator('#eqTitleStylePreset').inputValue(),'SECRET_POLICE');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:out+'/'+name+'-cms.png',fullPage:true});
  assert.deepEqual(errors,[]);results.push({viewport:name,power,switchAndUnequip:true,unownedEquipHidden:true,cmsPower:75000,cmsManual:true,images,overflow:false,errors});await context.close();
 }
 await writeFile(out+'/qa.json',JSON.stringify({results},null,2));console.log(JSON.stringify({out,results}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
