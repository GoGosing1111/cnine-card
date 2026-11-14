import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const out='docs/qa/pet-rework-20261114/unified',browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir(out,{recursive:true});await fs.mkdir('.impeccable/review/pet-codex-v3',{recursive:true});
const report={environment:'Windows installed Chrome headless. Viewport emulation, not physical mobile. Isolated local adapter only.',viewports:[],effects:[],errors:[]};
const ready=page=>page.locator('[data-pg-action="roll"][data-kind="stats"]:not([disabled])').waitFor();
const roll=(page,kind)=>page.locator('[data-pg-action="roll"][data-kind="'+kind+'"]');
const snapshot=page=>page.evaluate(()=>window.__petGrowthDemo.state());
const check=page=>page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,missingImages:[...document.querySelectorAll('.pet-codex-v3 img')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().left<innerWidth&&(!x.complete||!x.naturalWidth)).map(x=>x.src),smallControls:[...document.querySelectorAll('.pet-codex-v3 button,.pet-codex-v3 select,.pet-codex-v3 input,.pet-codex-v3 summary')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().height<43).map(x=>x.textContent.trim()),svgIcons:document.querySelectorAll('.pet-codex-v3 svg').length}));
async function capture(page,file){await page.screenshot({path:out+'/'+file,fullPage:true});await fs.copyFile(out+'/'+file,'.impeccable/review/pet-codex-v3/'+file);}
try{
 for(const width of [1440,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:width>800?1000:844}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:18874/pet-codex/');await ready(page);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.pet-codex-v3 img')].filter(x=>x.getBoundingClientRect().left<innerWidth).map(x=>x.decode().catch(()=>{})));});
  const layout=await check(page);assert.ok(layout.scrollWidth<=width);assert.deepEqual(layout.missingImages,[]);assert.deepEqual(layout.smallControls,[]);assert.equal(layout.svgIcons,0);
  assert.equal(await page.locator('.pg-stats-pane').count(),1);assert.equal(await page.locator('.pg-trait-pane').count(),1);
  await capture(page,'desktop-'+width+'.png');
  const initial=await snapshot(page),frames=new Set(),start=Date.now();
  await roll(page,'stats').click();await page.locator('[data-dice-phase="rolling"]').waitFor();
  assert.equal(await page.locator('[data-pg-action="apply"]').count(),0);
  assert.equal(await roll(page,'trait').isDisabled(),true);assert.equal(await page.locator('[data-pc-pet]').first().isDisabled(),true);
  for(let n=0;n<4;n++){frames.add(await page.locator('[data-dice-sprite]').getAttribute('data-frame'));await page.waitForTimeout(110);}
  assert.ok(frames.size>=3,'Dice must show distinct actual frames');
  if(width===1440||width===390)await capture(page,'rolling-stats-'+width+'.png');
  await page.locator('[data-pg-action="apply"]').waitFor();assert.ok(Date.now()-start>=1000);
  const pending=await snapshot(page);assert.equal(pending.wallet.stats,initial.wallet.stats-1);assert.deepEqual(pending.instances[0].stats,initial.instances[0].stats);
  if(width===1440||width===390)await capture(page,'result-stats-'+width+'.png');
  await page.locator('[data-pg-action="keep"]').click();await ready(page);assert.deepEqual((await snapshot(page)).instances[0].stats,initial.instances[0].stats);
  await roll(page,'trait').click();await page.locator('[data-dice-phase="rolling"][data-kind="trait"]').waitFor();
  if(width===390){await page.waitForTimeout(260);await capture(page,'rolling-trait-390.png');}
  await page.locator('[data-pg-action="apply"]').waitFor();await page.locator('[data-pg-action="apply"]').click();await ready(page);
  const applied=await snapshot(page);assert.equal(applied.wallet.trait,initial.wallet.trait-1);assert.deepEqual(applied.instances[0].stats,initial.instances[0].stats);
  await page.locator('[data-pg-instance]').selectOption('heukgu-02');await page.locator('[data-pg-equip="PVE"]').click();await ready(page);assert.equal((await snapshot(page)).loadouts.PVE,'heukgu-02');
  await page.locator('[data-pc-pet]').nth(1).click();await page.locator('.pg-unowned').waitFor();assert.equal(await page.locator('[data-pg-action="roll"]').count(),0);
  await page.locator('[data-pc-pet="PET-HEUKGU"]').click();await ready(page);
  await page.evaluate(()=>window.__petGrowthDemo.loseResponse());await roll(page,'stats').click();await page.locator('[data-pg-action="retry"]').waitFor();
  const charged=await snapshot(page);await page.locator('[data-pg-action="retry"]').click();await page.locator('[data-pg-action="keep"]').waitFor();assert.equal((await snapshot(page)).wallet.stats,charged.wallet.stats);
  await page.locator('[data-pg-action="keep"]').click();await ready(page);
  await page.locator('[data-pc-search]').fill('존재하지않는이름');await page.locator('.pc-no-results').waitFor();await page.locator('[data-pc-search]').fill('');
  await page.locator('[data-pc-filter="owned"]').click();assert.equal(await page.locator('[data-pc-pet]').count(),1);
  await page.locator('[data-pc-filter="all"]').click();
  report.viewports.push({width,layout,distinctDiceFrames:[...frames],checks:['simultaneous stats and traits','stats roll visible >= 1 second','trait roll visible','controls locked during roll','one charge before choice','keep/apply','trait preserves stats','instance selection and PvE loadout','unowned state','search and filters','lost response idempotent retry']});
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:18874/pet-codex/');await ready(page);
 for(const id of ['ASSAULT','GUARD','VITALITY','HASTE','HUNTER','LUCK']){
  await page.locator('.pg-trait-options').evaluate(e=>e.open=true);await page.locator('[data-pg-preview-trait="'+id+'"]').click();await page.locator('[data-fx-pause]').waitFor();await page.waitForTimeout(600);
  await page.locator('[data-fx-pause]').click();await page.locator('[data-pg-effect-section]').screenshot({path:out+'/effect-'+id+'.png'});
  await page.locator('[data-pg-action="close-effect"]').click();assert.equal(await page.evaluate(()=>window.__petGrowthDemo.getActiveFx()),0);
  report.effects.push(id);
 }
 await page.evaluate(()=>window.__petGrowthDemo.foreignPending());await page.locator('[data-pc-refresh]').click();await page.locator('[data-pg-pending-pet]').waitFor();assert.equal(await page.locator('[data-pg-action="apply"]').count(),0);
 await page.locator('[data-pg-pending-pet]').click();await page.locator('[data-pg-action="apply"]').waitFor();assert.match(await page.locator('.pg-heading h2').textContent(),/봉순/);
 await page.locator('[data-pg-action="keep"]').click();await page.close();
 const race=await browser.newPage({viewport:{width:390,height:844}});
 await race.route('**/fx-preview.bundle.mjs',async route=>{await new Promise(r=>setTimeout(r,800));await route.continue();});
 await race.goto('http://127.0.0.1:18874/pet-codex/');await ready(race);await race.locator('[data-pg-action="effect"]').click();await race.locator('[data-pg-action="close-effect"]').click();await race.waitForTimeout(1200);
 assert.equal(await race.evaluate(()=>window.__petGrowthDemo.getActiveFx()),0);assert.equal(await race.locator('canvas').count(),0);
 await roll(race,'stats').click();await race.locator('[data-dice-phase="rolling"]').waitFor();await race.evaluate(()=>window.__petGrowthDemo.dispose());const disposed=await race.evaluate(()=>window.__petCodexReview.animation());await race.waitForTimeout(1400);assert.deepEqual(await race.evaluate(()=>window.__petCodexReview.animation()),disposed);assert.equal(disposed.active,false);await race.close();
 report.cancelledFxAndRollCleanly=true;
 const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await reduced.goto('http://127.0.0.1:18874/pet-codex/');await ready(reduced);await roll(reduced,'stats').click();await reduced.locator('[data-pg-action="apply"]').waitFor();assert.ok((await reduced.evaluate(()=>window.__petCodexReview.animation())).updates<=1);await reduced.close();report.reducedMotion=true;
 assert.deepEqual(report.errors,[]);await fs.writeFile(out+'/browser-checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}

