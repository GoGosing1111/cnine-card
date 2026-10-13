import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const base=process.env.TERRITORY_FORMATION_QA_URL,output=process.env.TERRITORY_FORMATION_QA_DIR;
if(!base||new URL(base).hostname!=='127.0.0.1'||!output)throw Error('Local QA fixture URL and output required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[],run=Date.now();
try{
 for(const viewport of [{width:1440,height:1050},{width:390,height:844}]){
  const device=viewport.width>700?'pc':'mobile',context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const requests=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/territory-war/'))requests.push(new URL(r.url()).pathname)});
  async function visit(scenario){await page.goto(base+'/?qaFormation='+scenario+'&qaRun='+device+'-'+run);await page.locator('#qaTerritoryOpen').click();await page.locator('.tf-shell,.tw4-shell').waitFor();}
  async function inspect(label,selector='.tf-shell'){
   const root=page.locator(selector);await root.scrollIntoViewIfNeeded();
   const sizing=await root.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));assert.ok(sizing.scroll<=sizing.width+2,label+' overflow');
   await page.waitForFunction(selector=>[...document.querySelector(selector).querySelectorAll('img')].filter(n=>n.getBoundingClientRect().height>0).every(n=>n.complete&&n.naturalWidth>0),selector);
   const buttons=await root.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height>0).map(n=>({label:n.textContent.trim(),image:getComputedStyle(n).backgroundImage,height:n.getBoundingClientRect().height})));
   assert.ok(buttons.every(b=>b.image.includes('/formation-v1/button-')&&b.height>=44),label+' image button coverage');
   await page.screenshot({path:output+'/'+device+'-'+label+'.png'});checks.push({device,label,buttons:buttons.length,noOverflow:true,imagesLoaded:true});
  }
  await visit('RECRUITING');await page.evaluate(()=>document.fonts.ready);assert.match(await page.locator('.tf-brand img').getAttribute('src'),/soopketmon-logo-approved/);assert.match(await page.locator('.tf-brand h1').evaluate(n=>getComputedStyle(n).fontFamily),/TFNoto/);assert.match(await page.locator('.tf-countdown time').evaluate(n=>getComputedStyle(n).fontFamily),/TFBarlow/);if(device==='mobile')assert.ok((await page.locator('[data-tw3-register]').boundingBox()).y+54<=viewport.height,'primary recruitment action above fold');await inspect('recruit');
  await page.locator('[data-tw3-register]').click();await page.locator('[data-tw3-unregister]').waitFor();assert.ok(requests.includes('/api/territory-war/register'));
  await inspect('registered');await page.locator('[data-tw3-loadout-refresh]').click();await page.waitForFunction(()=>!document.querySelector('#territoryWarModalV3.is-busy'));
  await page.locator('[data-tw3-unregister]').click();await page.locator('[data-tw3-register]').waitFor();assert.ok(requests.includes('/api/territory-war/unregister'));
  await visit('PREPARING&side=B');assert.match(await page.locator('.tf-hero-copy').textContent(),/정화 진영/);await inspect('preparing');await page.locator('[data-twf-squad]').click();await page.locator('#twFormationSquad').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-tw3-loadout-refresh]').isDisabled(),true);await inspect('preparing-squad','.tf-squad');
  await visit('INCOMPLETE');await page.locator('#twFormationSquad').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-tw3-loadout-refresh]').isEnabled(),true);await page.locator('[data-tw3-loadout-refresh]').click();await page.waitForFunction(()=>document.querySelector('.tf-squad .tf-readiness b')?.textContent==='출전 덱 준비 완료');assert.equal(await page.locator('[data-tw3-loadout-refresh]').isDisabled(),true);
  await visit('OFF');assert.equal(await page.locator('[data-tw3-register]').count(),0);await inspect('off');
  await visit('OFF_REWARD');await page.locator('[data-tw3-claim]').scrollIntoViewIfNeeded();await inspect('off-reward');await page.locator('[data-tw3-claim]').click();await page.locator('[data-tw3-claim]').waitFor({state:'detached'});assert.ok(requests.includes('/api/territory-war/claim'));
  await visit('LONG_NAME');await inspect('long-name');
  await visit('SPECTATOR');await page.locator('#twFormationSquad').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-tw3-loadout-refresh]').isDisabled(),true);
  await visit('TRUCE');const briefing=page.locator('.tw3-truce-overlay button');if(await briefing.count())await briefing.click();await page.locator('[data-tw4-drawer="loadout"]').click();await page.waitForTimeout(300);await inspect('live-squad','.tw4-drawer[data-type="loadout"]');assert.equal(await page.locator('.tf-squad [data-tw3-loadout-refresh]').isEnabled(),true);
  await page.locator('.tf-squad [data-tw3-loadout-refresh]').click();await page.waitForFunction(()=>!document.querySelector('#territoryWarModalV3.is-busy'));
  await page.locator('[data-tw3-close]').first().click();assert.equal(await page.locator('#territoryWarModalV3').count(),0);
  checks.push({device,registerCancelRefreshClaim:true,preparingLock:true,incompleteRepair:true,spectatorLock:true,truceRefresh:true,close:true});await context.close();
 }
 assert.deepEqual(errors,[]);const report={passed:true,checks,errors};await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
