import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {magicFixture} from './helpers/magic-presets-fixture.mjs';
import {magicSettings} from '../functions/_magic.js';
import {magicSeason2PackSettings} from '../functions/_magic_season2_pack.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.resolve(process.env.QA_OUTPUT_DIR||'../qa/magic-season2-cms');
await fs.mkdir(output,{recursive:true});
const f=await magicFixture(true);await f.p("UPDATE users SET role='OWNER' WHERE id=1").run();
const before=await magicSettings(f.env),errors=[],checks=[];
const deps={authenticate:f.user,readBody:r=>r.json(),json:(body,status=200)=>Response.json(body,{status}),writeAdminLog:async()=>{}};
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin.css"><link rel="stylesheet" href="/admin/admin-v1094-magic.css"><style>body{display:block;padding:20px;margin:0}#magicAdminRoot{max-width:1320px;margin:auto}#nav,#pageTitle{display:none}</style><body><nav id="nav"></nav><h1 id="pageTitle"></h1><section id="view-magiccards" class="view"><div id="magicAdminRoot"></div></section><script>var state={role:'OWNER'};var $=s=>document.querySelector(s);function renderIdentity(){}function show(){}function setBusy(b,on,text){b.disabled=on;if(on){b.dataset.label=b.textContent;b.textContent=text}else b.textContent=b.dataset.label}async function api(p,o){const r=await fetch('/api/'+p,o),b=await r.json();if(!r.ok)throw Error(b.error);return b}</script><script src="/admin/admin-v1094-magic.js"></script><script>show('magiccards')</script></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||undefined});let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://127.0.0.1:8877/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/cms-qa')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/api/admin/magic-system'){
   if(request.method()==='GET')return route.fulfill({json:{settings:await magicSettings(f.env),season2Pack:await magicSeason2PackSettings(f.env),cards:[],stats:{},uniqueEffects:[]}});
   const response=await f.call('admin/magic-system',request.postDataJSON(),deps);
   return route.fulfill({status:response.status,json:await response.json()});
  }
  if(url.pathname.startsWith('/admin/')&&!url.pathname.includes('..')){
   const file=path.join(root,url.pathname.slice(1));
   try{return await route.fulfill({contentType:file.endsWith('.css')?'text/css':'application/javascript',body:await fs.readFile(file)});}catch{}
  }
  return route.fulfill({status:404,body:''});
 });
 await page.goto('http://127.0.0.1:8877/cms-qa');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  const panel=page.locator('.magicSeason2Panel');await panel.waitFor();
  assert.equal(await page.locator('#magicS2CardChance').inputValue(),'5');assert.equal(await page.locator('#magicS2StarChance').inputValue(),'10');
  if(width===1440){assert.equal(await page.locator('#magicS2StarMin').inputValue(),'');assert.equal(await page.locator('#magicS2StarMax').inputValue(),'');}
  await panel.scrollIntoViewIfNeeded();
  const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  for(const input of await panel.locator('input,select,button').all()){
   const box=await input.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,'season2 controls fit viewport');
  }
  await panel.screenshot({path:path.join(output,'cms-season2-'+width+'.png')});
  await page.locator('#magicS2StarMin').fill('12345');await page.locator('#magicS2StarMax').fill('54321');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/magic-system')&&r.request().method()==='POST');
  await page.locator('#magicSaveSeason2Pack').click();assert.equal((await response).status(),200);
  await page.waitForFunction(()=>document.querySelector('#magicSaveSeason2Pack').disabled===false);
  const saved=await magicSeason2PackSettings(f.env);assert.equal(saved.packRewards.masterStarMin,12345);assert.equal(saved.packRewards.masterStarMax,54321);
  assert.equal(saved.packRewards.magicCardChance,5);assert.equal(saved.packRewards.masterStarChance,10);
  assert.equal(saved.openingEnabled,false);assert.equal(saved.drawCoinCost,1_000_000_000);
  assert.deepEqual(await magicSettings(f.env),before);
  await page.reload();await page.locator('#magicS2StarMin').waitFor();assert.equal(await page.locator('#magicS2StarMin').inputValue(),'12345');
  checks.push(width+'px CMS: exact percentages, editable quantities, persisted reload, season1 untouched, opening locked');
 }
 assert.deepEqual(errors,[]);const result={checks,errors,fixture:'isolated PostgreSQL; no production writes'};
 await fs.writeFile(path.join(output,'cms-qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){if(page)await page.screenshot({path:path.join(output,'cms-failure.png'),fullPage:true});throw error;}
finally{await browser.close();await f.close();}
