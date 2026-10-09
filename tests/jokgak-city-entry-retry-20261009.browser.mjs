import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {cityWorkerFixture} from './helpers/jokgak-city-worker.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.CITY_QA_ORIGIN||'http://127.0.0.1:8918',out=process.env.CITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'city-entry-retry-'));
fs.mkdirSync(out,{recursive:true});const f=await cityWorkerFixture(),browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const initial=await (await f.request('status')).json(),pending={kind:'join',body:{requestId:'browser-pending-join-20261009',epoch:initial.shift.id}};
  await page.addInitScript(pending=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('jokgak:pending:1',JSON.stringify(pending));},pending);
  await page.route('**/api/jokgak-city/**',async route=>{
    const req=route.request(),url=new URL(req.url()),response=await f.request(url.pathname.split('/jokgak-city/')[1]+url.search,req.postData()?JSON.parse(req.postData()):undefined);
    await route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});
  });
  await page.route('**/__city-entry-qa/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><body style="margin:0;background:#080d18"><main></main><script>function loadUser(){return {id:1,role:"OWNER",nickname:"검수 1"}}</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
  await page.goto(origin+'/__city-entry-qa/',{waitUntil:'domcontentloaded'});await page.locator('[data-city-action="join"]').click();await page.locator('.jc-dialog h2').filter({hasText:'처리 상태 확인'}).waitFor();await page.locator('[data-city-retry]').click();
  await page.locator('[data-city-action="leave"]').waitFor();assert.equal(await page.locator('[data-city-cash]').textContent(),'10,000원');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('jokgak:pending:1'))),null);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM jokgak_city_actions_v1').first()).n,1);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-city-action="leave"]').waitFor();assert.equal(await page.locator('[data-city-cash]').textContent(),'10,000원');assert.equal(await page.locator('.jc-dialog').count(),0);
  await page.screenshot({path:path.join(out,'entry-retry-recovered.png'),fullPage:true});assert.deepEqual(errors,[]);
  const report={runtime:'workerd',checks:['saved pending join retries successfully','one entry receipt','pending request cleared','cash initialized once','reload stays in city without error dialog'],errors};fs.writeFileSync(path.join(out,'entry-retry-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await f.dispose();}
