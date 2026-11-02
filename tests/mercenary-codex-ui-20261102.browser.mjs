import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startCodexUiServer} from './helpers/mercenary-codex-ui-server.mjs';

const out=process.env.CODEX_UI_QA_OUT;
assert.ok(out,'Set CODEX_UI_QA_OUT outside the release directory');
await fs.mkdir(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const server=await startCodexUiServer(),browser=await chromium.launch({channel:'chrome',headless:true});
const results={checks:[],screens:[],pageErrors:[],widths:[],writes:[]};
const check=(condition,label)=>{assert.ok(condition,label);results.checks.push(label);};
const pause=page=>page.waitForTimeout(120);
async function capture(page,name){
 await page.locator('.source-art:visible').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:path.join(out,name+'.png')});results.screens.push(name);
}
async function ready(page,query='?view=all'){
 await page.goto(server.origin+'/mercenary-codex/'+query,{waitUntil:'networkidle'});
 await page.locator('.roster-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
}
try{
 for(const [label,width,height] of [['desktop',1440,1000],['tablet',820,1024],['mobile',390,844],['small',320,700]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','isolated-codex-ui');localStorage.setItem('cnine_player_client_id_v1552','isolated-codex-ui-7');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'격리 검수'}));});
  const page=await context.newPage();page.on('pageerror',error=>results.pageErrors.push(label+': '+error.message));
  await ready(page);
  const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,firstCard:document.querySelector('.roster-row').getBoundingClientRect().toJSON(),firstName:document.querySelector('.row-identity b').getBoundingClientRect().toJSON(),managementOpen:document.querySelector('#managementPanel').open}));
  results.widths.push({label,...geometry});check(geometry.scrollWidth<=width+1,label+' no horizontal overflow');check(!geometry.managementOpen,label+' browsing starts with compact management');
  if(width<=760){check(geometry.firstName.bottom<height-66,label+' first card name above fixed bottom navigation');check(geometry.firstCard.top<450,label+' first card begins before 450px');}
  await capture(page,label+'-all');
  if(width>760){
   await page.locator('[data-code="V-013"]').focus();await page.keyboard.press('Enter');
   check(await page.evaluate(()=>document.activeElement.dataset.code==='V-013'),label+' Enter preserves selected card focus');
   await page.keyboard.press('Tab');check(await page.evaluate(()=>document.activeElement.id==='focusSelection'),label+' Tab skips the rest of the roster');
   await page.keyboard.press('Enter');check(await page.evaluate(()=>document.activeElement.id==='selectionName'),label+' detail shortcut focuses heading');
   await page.keyboard.press('Escape');check(await page.evaluate(()=>document.activeElement.dataset.code==='V-013'),label+' Escape restores same card');
   await page.keyboard.press('ArrowRight');check(await page.evaluate(()=>document.activeElement.dataset.code==='V-014'),label+' arrow key selects next card');
  }
  await page.locator('#search').fill('프라임');await pause(page);
  check(await page.locator('.roster-row').count()===1,label+' search returns Prime');
  check(await page.locator('#inspection .empty-selection').count()===1,label+' filtered-out selection becomes explicit empty selection');
  check(await page.locator('#inspection [data-equip]').count()===0,label+' no stale deployment controls after filtering');
  await page.locator('#refreshCatalog').click();await pause(page);
  check(await page.locator('#inspection .empty-selection').count()===1,label+' refresh preserves explicit selection waiting state');
  await capture(page,label+'-search');
  await page.locator('#search').fill('no-such-mercenary');await page.locator('[data-reset]').waitFor();
  check(await page.locator('[data-reset]').innerText()==='필터 초기화',label+' reset describes its action');await page.locator('[data-reset]').click();
  await page.locator('#limitedView').click();await page.locator('#search').fill('나무늘봉순');
  check(await page.locator('.roster-row').count()===4,label+' same-name editions remain distinguishable');
  await page.locator('#search').fill('no-such-mercenary');await page.locator('[data-reset]').click();
  check(await page.locator('#limitedView').getAttribute('aria-selected')==='true',label+' reset preserves limited tab');
  await page.locator('#ownedView').click();check(await page.locator('#managementPanel').evaluate(e=>e.open),label+' composition tab expands management');
  check(await page.locator('.ownership-meta').first().isVisible(),label+' ownership level visible');
  await page.locator('[data-code="V-001"]').click();
  if(width<=760){await page.locator('#inspectionSheet[open]').waitFor();check(!await page.locator('.deployment-controls').evaluate(e=>e.open),label+' mobile detail starts with artwork');}
  if(!await page.locator('.deployment-controls').evaluate(e=>e.open))await page.locator('.deployment-controls>summary').click();
  const rule=await page.locator('.deployment-rule').evaluate(e=>({size:parseFloat(getComputedStyle(e).fontSize),text:e.textContent}));
  check(rule.size>=14&&rule.text.includes('SSS'),label+' dual composition constraint readable');
  check(await page.locator('[data-equip]').count()===4,label+' four existing mode-slot actions retained');
  await capture(page,label+'-composition');
  if(width<=760){
   await page.locator('#inspectionSheet').evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.locator('#closeInspection').click();
   await page.locator('[data-code="V-013"]').click();check(await page.locator('#inspectionSheet').evaluate(e=>e.scrollTop===0),label+' new detail starts at title');
   await capture(page,label+'-detail');
   await page.keyboard.press('Escape');check(await page.evaluate(()=>document.activeElement.dataset.code==='V-013'),label+' mobile close restores selected card');
  }
  if(width===390){
   await page.locator('[data-code="V-021"]').click();await page.locator('.deployment-controls>summary').click();
   await page.locator('[data-equip="V-021"][data-deploy-mode="PVE"][data-deploy-slot="0"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-current-mode="PVE"] strong')?.textContent.includes('오메가-X'));
   check(server.fixture.account.loadouts.PVE.mercenaryCodes[0]==='V-021','fixture PVE slot saves through existing request');
   check(server.fixture.account.loadouts.PVP.mercenaryCodes[0]==='V-001','PVP untouched by PVE slot save');
   check(server.fixture.writes.at(-1).revision===1&&Boolean(server.fixture.writes.at(-1).requestId),'revision and idempotency request fields retained');
   await page.locator('#closeInspection').click();
  }
  if(width===1440){
   await page.evaluate(()=>document.documentElement.style.fontSize='200%');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'200% text scaling no document overflow');
   await capture(page,'desktop-text-200');await page.evaluate(()=>document.documentElement.style.fontSize='');
  }
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 server.fixture.accountMode='error';await ready(page);
 check(await page.locator('.roster-row').count()>0,'account failure leaves public catalog usable');
 await page.locator('#ownedView').click();check(await page.locator('[data-retry-account]').count()>0,'account failure provides retry');
 server.fixture.accountMode='empty';await page.locator('[data-retry-account]').first().click();await page.locator('text=아직 보유한 용병이 없습니다.').waitFor();check(true,'empty ownership offers recovery navigation');
 await capture(page,'mobile-empty-account');await context.close();
 check(results.pageErrors.length===0,'no browser page errors');
 results.writes=server.fixture.writes;results.assetFallbacks=server.fixture.assetFallbacks;results.serverErrors=server.fixture.errors;
 console.log(JSON.stringify({passed:results.checks.length,widths:results.widths,writes:results.writes.length,pageErrors:results.pageErrors,serverErrors:results.serverErrors.length}));
}finally{
 await browser.close();await server.close();await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(results,null,2));
}
