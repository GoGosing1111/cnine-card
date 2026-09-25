// Actual lobby/navigation and faction UI against a synthetic local server.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.FACTION_QA_ORIGIN||'http://127.0.0.1:8963',output=fs.mkdtempSync(path.join(os.tmpdir(),'faction-pause-recovery-'));
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
async function phase(name){const r=await fetch(base+'/api/preview/session?phase='+name,{method:'POST'});assert.equal(r.status,200)}
async function enter(page,viewport){
 const lobby=page.locator('soop-adventure-lobby');await lobby.locator('.stage-character').waitFor();
 if(viewport.width>980)await lobby.locator('.sidebar [data-category="social"]').click();
 else await lobby.locator('.mobile-dock [data-category="all"]').click();
 await lobby.locator('.menu-result[data-route="clan"]').click();await page.locator('.clan-tabs [data-clan-tab="faction"]').click();await page.locator('.fw-zone').first().waitFor();
}
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await fetch(base+'/api/preview/reset',{method:'POST'});
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/review-live/');await enter(page,viewport);
  await page.locator('.fw-zone').first().waitFor();assert.equal(await page.locator('.fw-zone').count(),25);
  const before=await (await fetch(base+'/api/clan/faction/overview')).json();
  await phase('territory');await page.locator('[data-fw-reload]').first().click();await page.locator('.fw-session-strip h3').filter({hasText:'영토전'}).waitFor();
  await phase('territory-restart');await page.locator('[data-fw-reload]').first().click();await page.locator('.fw-session-strip h3').filter({hasText:'영토전'}).waitFor();
  await phase('resume');await page.locator('[data-fw-reload]').first().click();await page.locator('.fw-session-strip h3').filter({hasText:/^세력전 .*진행 중$/}).waitFor();
  assert.equal(await page.locator('.fw-zone').count(),25);assert.equal(await page.locator('[data-fw-launch]').isEnabled(),true);
  const response=await fetch(base+'/api/clan/faction/overview');assert.equal(response.status,200);const after=await response.json();
  assert.deepEqual(after.districts.map(d=>[d.id,d.owner]),before.districts.map(d=>[d.id,d.owner]));
  assert.equal(after.sessions.current.remainingMs,before.sessions.current.remainingMs);
  await page.reload();await enter(page,viewport);
  assert.equal(await page.locator('.fw-zone').count(),25);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.fw-session-strip').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`recovered-${viewport.width}.png`)});
  checks.push(`${viewport.width}: lobby entry, restart pause, resume, ownership/time preserved, reload, no overflow`);await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors,output}));
}finally{await browser.close()}
