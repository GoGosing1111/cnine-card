import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.TERRITORY_RENEWAL_QA_URL,output=process.env.TERRITORY_RENEWAL_QA_DIR;
if(!base||new URL(base).hostname!=='127.0.0.1'||!output||path.resolve(output).startsWith(process.cwd()))throw Error('Use local fixture URL and output outside repository');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const device=viewport.width>700?'pc':'mobile',context=await browser.newContext({viewport,serviceWorkers:'block',recordVideo:{dir:output,size:viewport}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(device+': '+e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(base+'/');await page.waitForFunction(()=>typeof openTerritoryWar==='function');
  await page.locator('#qaTerritoryOpen').click();await page.locator('[data-tw4-node="4"]').click();await page.locator('.tw6-map-entry').click();
  await page.waitForFunction(()=>CNineTerritoryBattlefield.diagnostics().ready,{},{timeout:60000});
  const codes=['ARC_LANCE','DISRUPTION_WAVE','CITADEL_REPAIR'];
  const measurements=[];
  for(const [i,code] of codes.entries()){
   const side=i===1?'B':'A';
   await page.evaluate(async ({code,side})=>{CNineTerritoryBattlefield.previewControl('stop');await CNineTerritoryBattlefield.playPreview(code,side);CNineTerritoryBattlefield.previewControl('pause');CNineTerritoryBattlefield.previewControl('seek',code==='CITADEL_REPAIR'?1.8:1.55);},{code,side});
   await page.waitForTimeout(120);
   const diag=await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics());
   assert.equal(diag.failed,'');assert.equal(diag.active,1);assert.equal(diag.last.type,code);assert.equal(diag.renewalFrames[code],16);assert.ok(diag.last.contact.frame>=7&&diag.last.contact.frame<16);
   assert.equal(await page.locator('.tw6-fx-canvas').count(),1);
   assert.ok(diag.last.contact.target.x-diag.last.contact.width/2>=0);assert.ok(diag.last.contact.target.x+diag.last.contact.width/2<=diag.geometry.w);
   await page.screenshot({path:path.join(output,device+'-'+code.toLowerCase()+'.png')});
   const time=diag.last.time;await page.waitForTimeout(180);assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).last.time,time);
   await page.evaluate(()=>{CNineTerritoryBattlefield.previewControl('speed',.5);CNineTerritoryBattlefield.previewControl('resume')});
   await page.waitForTimeout(200);assert.ok((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).last.time>time);
   await page.evaluate(()=>CNineTerritoryBattlefield.previewControl('stop'));assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).active,0);
   measurements.push({code,side,frame:diag.last.contact.frame,target:diag.last.contact.target,geometry:diag.geometry});
  }
  const drawer=page.locator('[data-tw4-drawer="operations"]');await drawer.first().click();for(const code of codes)await page.locator('[data-tw3-operation="'+code+'"]').waitFor({state:'visible'});await page.waitForTimeout(400);await page.locator('[data-tw3-operation="ARC_LANCE"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,device+'-skills.png')});
  await page.evaluate(()=>CNineTerritoryBattlefield.dispose());assert.equal(await page.locator('.tw6-fx-canvas').count(),0);
  checks.push({device,measurements,oneRenderer:true,pauseSeekResumeSpeedStop:true,cleanup:true});
  await page.goto(base+'/qa-territory-admin');await page.waitForSelector('#tw5-arcLanceCharge');
  for(const key of ['arcLanceCharge','arcLanceHpPercent','disruptionChargeDrain','repairHpPercent','repairCharge'])assert.ok(await page.locator('#tw5-'+key).count());
  await page.locator('#tw5-arcLanceCharge').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,device+'-cms.png')});
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage();
 await page.goto(base+'/');await page.locator('#qaTerritoryOpen').click();await page.locator('[data-tw4-node="4"]').click();await page.locator('.tw6-map-entry').click();
 await page.waitForFunction(()=>CNineTerritoryBattlefield.diagnostics().ready,{},{timeout:60000});
 await page.evaluate(async()=>{await CNineTerritoryBattlefield.playPreview('CITADEL_REPAIR');CNineTerritoryBattlefield.previewControl('pause');CNineTerritoryBattlefield.previewControl('seek',1.6)});
 const reduced=await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics());assert.equal(reduced.reduced,true);assert.equal(reduced.last.contact.frame,8);
 await page.locator('[data-tw6-return-map]').click();assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).paused,true);
 await context.close();checks.push({reducedMotion:true,mapPause:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,errors},null,2));
 await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,checks,errors},null,2));
}finally{await browser.close()}
