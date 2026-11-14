import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:18876',out='docs/qa/pet-rework-20261114/live';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report={conditions:'Windows Chrome headless; local isolated PostgreSQL-compatible database, actual /pet-codex/ entry and live API handler',widths:[],checks:[]};
const wallet=page=>page.evaluate(async()=>{const r=await fetch('/api/pets/v2/growth');return (await r.json()).wallet;});
try{
 for(const width of [1440,768,390,320]){
  await fetch(base+'/__reset');const context=await browser.newContext({viewport:{width,height:width>800?1000:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/pet-codex/');await page.locator('[data-pg-action="roll"][data-kind="stats"]').waitFor();
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/desktop-${width}.png`,fullPage:true});
  const shape=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,broken:[...document.querySelectorAll('.pet-codex-v3 img')].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src),small:[...document.querySelectorAll('.pet-codex-v3 button,.pet-codex-v3 select')].filter(n=>n.getBoundingClientRect().height>0&&n.getBoundingClientRect().height<44).map(n=>n.textContent)}));
  assert.equal(shape.overflow,false);assert.deepEqual(shape.broken,[]);assert.deepEqual(shape.small,[]);assert.deepEqual(errors,[]);report.widths.push({width,...shape,errors});
  assert.match(await page.locator('.pg-stats-pane').innerText(),/1회 코인 5조/);assert.match(await page.locator('.pg-trait-pane').innerText(),/1회 코인 30조/);
  if(width===1440||width===390){
   const before=await wallet(page);await page.locator('[data-pg-action="roll"][data-kind="stats"]').click();const frames=[];
   for(let i=0;i<4;i++){await page.waitForTimeout(170);frames.push(await page.locator('[data-dice-sprite]').getAttribute('data-frame'));}
   assert.ok(new Set(frames).size>=3);await page.screenshot({path:`${out}/rolling-${width}.png`,fullPage:true});await page.locator('[data-pg-action="apply"]').waitFor();
   const charged=await wallet(page);assert.equal(BigInt(before.coin)-BigInt(charged.coin),5000000000000n);assert.equal(before.masterStars-charged.masterStars,10000000);
   await page.reload();await page.locator('[data-pg-action="keep"]').waitFor();assert.deepEqual(await wallet(page),charged);await page.locator('[data-pg-action="keep"]').click();await page.locator('[data-pg-action="roll"][data-kind="trait"]').waitFor();
   await page.locator('[data-pg-action="roll"][data-kind="trait"]').click();await page.locator('[data-pg-action="apply"]').waitFor();
   const resultsVisible=await page.locator('.pg-result-actions').evaluate(el=>[...el.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&!!top&&b.contains(top);}));assert.equal(resultsVisible,true,'Both result buttons must be fully visible above mobile navigation');
   await page.screenshot({path:`${out}/trait-result-${width}.png`,fullPage:true});await page.screenshot({path:`${out}/trait-result-viewport-${width}.png`});await page.locator('[data-pg-action="apply"]').click();
   await page.locator('[data-pg-action="roll"][data-kind="stats"]:enabled').waitFor();const after=await wallet(page);assert.equal(BigInt(charged.coin)-BigInt(after.coin),30000000000000n);assert.equal(charged.masterStars-after.masterStars,50000000);
   await page.locator('[data-pg-action="effect"]').click();await page.locator('[data-fx-play]').waitFor();await page.waitForTimeout(500);await page.screenshot({path:`${out}/effect-${width}.png`,fullPage:true});await page.locator('[data-pg-action="close-effect"]').click();assert.equal(await page.evaluate(()=>window.__petActiveFx),0);
   report.checks.push({width,frames,statsCost:'5조 + 1000만',traitCost:'30조 + 5000만',reloadPending:true,effect:true,after});
  }
  await context.close();
 }
 await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
