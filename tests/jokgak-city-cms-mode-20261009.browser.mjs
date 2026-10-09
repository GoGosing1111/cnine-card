import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings} from '../functions/_jokgak_city_settings.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.CITY_QA_ORIGIN||'http://127.0.0.1:8918',out=process.env.CITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'city-cms-mode-'));
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),owner={id:80,nickname:'관리자',role:'OWNER'},requests=[];
  const row=await f.p('SELECT value FROM app_meta WHERE key=?','jokgak_city_settings_v1').first(),policy=JSON.parse(row.value);policy.mode='ON';
  await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy),'jokgak_city_settings_v1').run();
  const page=await browser.newPage({viewport:{width,height:960}});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(()=>localStorage.setItem('cnine_admin_token','ISOLATED_CITY_MODES'));
   await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(req.method()==='PATCH')requests.push(JSON.parse(req.postData()).policy.mode);
    const response=await handleJokgakCity({path:url.pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>owner,json:(v,status=200)=>Response.json(v,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{}});
   });
   await page.route('**/admin/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/jokgak-city-admin-v1.mjs"></script></body>')}));
   await page.goto(origin+'/admin/#jokgak-city',{waitUntil:'domcontentloaded'});await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
   await page.locator('.city-cms-note').filter({hasText:'저장된 ON'}).waitFor();
   const selected=()=>page.locator('.city-cms-modes input:checked').evaluateAll(inputs=>inputs.map(i=>i.value));
   for(const mode of ['OFF','TEST','ON']){
    await page.locator(`.city-cms-modes label`).filter({has:page.locator(`input[value="${mode}"]`)}).click();
    const actual=await selected();console.log(JSON.stringify({width,requested:mode,checked:actual}));assert.deepEqual(actual,[mode]);assert.equal((await readCitySettings(f.env)).policy.mode,mode==='OFF'?'ON':mode==='TEST'?'OFF':'TEST');
    await page.locator('[data-tab="roles"]').click();await page.locator('[data-tab="operation"]').click();assert.deepEqual(await selected(),[mode]);
    await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'저장 완료 · '+mode}).waitFor();assert.equal((await readCitySettings(f.env)).policy.mode,mode);assert.equal(requests.at(-1),mode);
    await page.locator('[data-reload]').click();await page.locator('.city-cms-note').filter({hasText:'저장된 '+mode}).waitFor();assert.deepEqual(await selected(),[mode]);checks.push(`${width}: ${mode} is exclusive, survives tab changes, saves exactly and reloads`);
   }
   await page.locator('.city-cms-modes label').filter({has:page.locator('input[value="TEST"]')}).click();await page.locator('.city-cms-modes').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-cms-mode-choice.png`)});assert.equal((await readCitySettings(f.env)).policy.mode,'ON');checks.push(`${width}: unsaved TEST selection leaves the persisted ON policy unchanged`);
  }finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'cms-mode-browser.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({out,checks:checks.length,errors}));
}finally{await browser.close();}
