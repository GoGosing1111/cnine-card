import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {ASCENDANT_EQUIPMENT,ASCENDANT_EQUIPMENT_SETS} from '../shared/mercenary-ascendant-equipment-v1.mjs';
const require=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'),{chromium}=require('playwright');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out='C:/Users/User/Downloads/upload/cnine-card/operations/mercenary-ascendant-balance-20261028',gallery='C:/Users/User/Downloads/upload/cnine-card/preview/mercenary-ascendant-equipment-20261028-v1';
await fs.mkdir(out,{recursive:true});
const f=await ascendantEquipmentFixture(),errors=[],screens=[],missing=[];
for(const mode of ['PVE','PVP'])for(const item of ASCENDANT_EQUIPMENT.filter(i=>i.tier===(mode==='PVE'?1:10)))await f.equip(mode,item);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:{...req.headers,origin:url.origin},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const response=await handleMercenaryAccount({path:url.pathname.slice(5),env:f.env,deps:f.deps,request});
   if(!response){res.writeHead(404).end();return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!/^\/(mercenary-codex|assets|shared|js)\//.test(url.pathname)){res.writeHead(404).end();return;}
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await fs.readFile(file));
 }catch(error){if(error.code==='ENOENT')missing.push(req.url);else errors.push(error.stack);res.writeHead(error.code==='ENOENT'?404:500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const {url}=JSON.parse(await fs.readFile(path.join(gallery,'qa/server.json'),'utf8'));
 const balance=JSON.parse(await fs.readFile(path.join(gallery,'balance.json'),'utf8'));
 assert.equal(balance.sourceSha256,createHash('sha256').update(await fs.readFile(path.join(root,'shared/mercenary-ascendant-equipment-v1.mjs'))).digest('hex'));
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.stack));
  await page.goto(url);await page.waitForFunction(()=>window.resourceGalleryReady&&[...document.querySelectorAll('.item img')].every(i=>i.complete&&i.naturalWidth===512));
  assert.equal(await page.locator('.item').count(),50);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const mode of ['TOTAL','PVE','PVP']){
   await page.locator('[data-mode="'+mode+'"]').click();const key=mode==='TOTAL'?'totalPower':mode==='PVE'?'pvePower':'pvpPower';
   const values=await page.locator('.power-summary strong').allTextContents();assert.deepEqual(values,ASCENDANT_EQUIPMENT_SETS.map(s=>s[key].toLocaleString('ko-KR')));
  }
  for(const [count,active] of [[1,0],[2,1],[4,2],[5,3]]){await page.locator('.set-effects select').first().selectOption(String(count));assert.equal(await page.locator('.set').first().locator('.effect-step.active').count(),active);}
  await page.screenshot({path:path.join(out,'gallery-pvp-'+width+'.png')});screens.push('gallery-pvp-'+width+'.png');
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.goto(base+'/mercenary-codex/equipment/');await page.waitForFunction(()=>document.querySelectorAll('.gear-option').length===80);
  assert.equal(await page.locator('#gearPower').textContent(),'+ 1,086,750');
  await page.locator('[data-mode="PVP"]').click();assert.equal(await page.locator('#gearPower').textContent(),'+ 345,000');
  await page.locator('#effectsDisclosure summary').click();assert.match(await page.locator('#effects').innerText(),/5세트 ON/);assert.match(await page.locator('#effects').innerText(),/25%/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,'armory-pvp-'+width+'.png')});screens.push('armory-pvp-'+width+'.png');
  await page.locator('.gear-option[aria-label^="창세의 왕관 장신구"]').click();await page.locator('.inspect-effects summary').click();assert.match(await page.locator('.inspect-effect-body').innerText(),/5세트/);assert.match(await page.locator('.inspect-effect-body').innerText(),/PVE와 PVP/);
  await page.screenshot({path:path.join(out,'armory-detail-'+width+'.png')});screens.push('armory-detail-'+width+'.png');
  await page.locator('.equip-action').click();await page.waitForFunction(()=>document.querySelector('.equip-action')?.textContent.includes('PVP에 장착'));
  assert.equal((await (await context.request.get(base+'/api/mercenaries/v3/equipment',{headers:{authorization:'Bearer local-account-7'}})).json()).loadouts.PVP.effects.shieldPercent,undefined);
  await page.locator('.equip-action').click();await page.waitForFunction(()=>document.querySelector('.equip-action')?.textContent.includes('PVP 장착 해제'));
  const restored=await (await context.request.get(base+'/api/mercenaries/v3/equipment',{headers:{authorization:'Bearer local-account-7'}})).json();assert.equal(restored.loadouts.PVP.effects.shieldPercent,25);assert.equal(restored.loadouts.PVE.power,1086750);
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={checkedAt:new Date().toISOString(),widths:[1440,390],galleryModes:['TOTAL','PVE','PVP'],gallerySets:10,galleryItems:50,thresholds:[1,2,4,5],actualArmory:true,isolatedApi:true,unequipRemovesFiveSetEffect:true,reequipRestoresEffect:true,pveConfigurationPreserved:true,noHorizontalOverflow:true,errors,missing,screens,productionWrites:0};
 await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));await f.close();}
