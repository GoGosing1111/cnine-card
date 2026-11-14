import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const out='docs/qa/pet-rework-20261114';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={environment:{platform:'Windows',browser:'Headless installed Chrome',mobile:'viewport emulation only; not a physical mobile device',entry:'/pet-codex/ (existing HTML and mount; isolated local account adapter)',productionWrites:0},viewports:[],effects:[],errors:[]};
const ready=async page=>{await page.locator('[data-pg-action="roll"]').waitFor();await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.pet-growth img')].map(x=>x.decode().catch(()=>{})));});};
const open=async page=>{await page.locator('[data-pet-growth-open]').click();await ready(page);};
const check=async page=>page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,missingImages:[...document.querySelectorAll('.pet-growth img')].filter(x=>!x.complete||!x.naturalWidth).map(x=>x.src),smallTargets:[...document.querySelectorAll('.pet-growth button:not([disabled])')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<43).map(e=>e.textContent.trim()),newSvgIcons:document.querySelectorAll('.pet-growth svg').length}));
try{
 for(const width of [1440,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000}}),page=await context.newPage();
  page.on('pageerror',error=>report.errors.push({width,message:error.message}));
  await page.goto('http://127.0.0.1:18874/pet-codex/');
  await open(page);const layout=await check(page);
  assert.ok(layout.scrollWidth<=width+1,'Horizontal overflow at '+width);assert.deepEqual(layout.missingImages,[]);assert.deepEqual(layout.smallTargets,[]);assert.equal(layout.newSvgIcons,0);
  await page.screenshot({path:out+'/'+(width===1440?'desktop':width===390?'mobile':'width-'+width)+'.png',fullPage:true});
  const before=await page.evaluate(()=>window.__petGrowthDemo.state());
  await page.locator('[data-pg-action="roll"]').click();await page.locator('[data-pg-action="apply"]').waitFor();
  let after=await page.evaluate(()=>window.__petGrowthDemo.state());assert.equal(after.wallet.stats,before.wallet.stats-1);assert.deepEqual(after.instances[0].stats,before.instances[0].stats);
  if(width===390)await page.screenshot({path:out+'/mobile-compare.png',fullPage:true});
  await page.locator('[data-pg-action="keep"]').click();await ready(page);
  after=await page.evaluate(()=>window.__petGrowthDemo.state());assert.deepEqual(after.instances[0].stats,before.instances[0].stats);
  await page.locator('[data-pg-tab="trait"]').click();
  await page.locator('.pg-trait-list').waitFor();await page.evaluate(async()=>Promise.all([...document.querySelectorAll('.pg-trait-list img')].map(x=>x.decode())));
  if(width===1440||width===390)await page.screenshot({path:out+'/'+(width===1440?'desktop':'mobile')+'-traits.png',fullPage:true});
  await page.locator('[data-pg-action="roll"]').click();await page.locator('[data-pg-action="apply"]').click();await ready(page);
  after=await page.evaluate(()=>window.__petGrowthDemo.state());assert.equal(after.wallet.trait,before.wallet.trait-1);assert.deepEqual(after.instances[0].stats,before.instances[0].stats);
  await page.locator('[data-pg-action="close"]').click();await page.locator('[data-pet-growth-open]').waitFor();
  await open(page);await page.evaluate(()=>window.__petGrowthDemo.loseResponse());await page.locator('[data-pg-action="roll"]').click();await page.locator('[data-pg-action="retry"]').waitFor();
  const lost=await page.evaluate(()=>window.__petGrowthDemo.state());await page.locator('[data-pg-action="retry"]').click();await page.locator('[data-pg-action="keep"]').waitFor();
  assert.equal((await page.evaluate(()=>window.__petGrowthDemo.state())).wallet.stats,lost.wallet.stats);
  await page.locator('[data-pg-action="keep"]').click();await ready(page);
  report.viewports.push({width,layout,checks:['independent grades','keep result','trait preserves stats','apply result','lost response same request recovery','reentry','44px controls']});
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>report.errors.push({effect:true,message:e.message}));
 await page.goto('http://127.0.0.1:18874/pet-codex/');
 for(const id of ['ASSAULT','GUARD','VITALITY','HASTE','HUNTER','LUCK']){
  await page.evaluate(id=>window.__petGrowthDemo.setTrait(id),id);await open(page);
  const start=Date.now();await page.locator('[data-pg-action="effect"]').click();await page.locator('[data-fx-pause]').waitFor({timeout:20000});
  await page.waitForTimeout(850);await page.locator('[data-fx-pause]').click();
  await page.locator('[data-pg-effect]').screenshot({path:out+'/effect-'+id.toLowerCase()+'.png'});
  await page.locator('[data-fx-pause]').click();await page.locator('[data-fx-slow]').click();await page.locator('[data-fx-play]').click();
  await page.waitForTimeout(120);await page.locator('[data-pg-action="close"]').click();
  assert.equal(await page.evaluate(()=>window.__petGrowthDemo.getActiveFx()),0);
  report.effects.push({id,firstOpenMs:Date.now()-start,paused:true,halfSpeed:true,replay:true,cleanup:true});
 }
 await page.close();
 const race=await browser.newPage({viewport:{width:390,height:844}});
 race.on('pageerror',e=>report.errors.push({race:true,message:e.message}));
 await race.route('**/fx-preview.bundle.mjs',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});
 await race.goto('http://127.0.0.1:18874/pet-codex/');await open(race);
 await race.locator('[data-pg-action="effect"]').click();await race.locator('[data-pg-tab="trait"]').click();await race.waitForTimeout(1700);
 assert.equal(await race.evaluate(()=>window.__petGrowthDemo.getActiveFx()),0);
 assert.equal(await race.locator('canvas').count(),0);
 await race.locator('[data-pg-action="close"]').click();await race.evaluate(()=>window.__petGrowthDemo.foreignPending());await race.locator('[data-pet-growth-open]').click();await race.locator('.pg-empty h3').waitFor();
 assert.equal(await race.locator('[data-pg-action="apply"]').count(),0);
 await race.screenshot({path:out+'/mobile-foreign-pending.png',fullPage:true});
 report.asyncCancellation=true;report.foreignPendingBlocked=true;await race.close();
 await fs.writeFile(out+'/browser-checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();}
