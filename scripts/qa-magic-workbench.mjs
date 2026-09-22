import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8822',output=path.resolve(process.env.QA_OUTPUT_DIR||'../qa/magic-workbench');
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local fixture only');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM});
const results=[],errors=[];let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  let rejectNextDialog=false;
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{if(rejectNextDialog){rejectNextDialog=false;return d.dismiss();}return d.accept();});
  await page.goto(base+'/__qa/login');await page.locator('#login').click();await page.waitForURL('**/?screen=home');
  await page.goto(base+'/?screen=magic');await page.locator('#mwCards .mw-card').first().waitFor();
  assert.equal(await page.locator('.mw-card').count(),12);
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.locator('#mwSearch').fill('결계');assert.equal(await page.locator('.mw-card').count(),1);
  await page.locator('#mwSearch').fill('no-match');await page.locator('#mwResetFilters').waitFor();await page.locator('#mwResetFilters').click();assert.equal(await page.locator('.mw-card').count(),14);
  await page.locator('[data-mw-card="11"]').click();assert.equal(await page.locator('#mwEquip').isDisabled(),true);
  await page.locator('[data-mw-card="2"]').click();assert.equal(await page.locator('#mwEnhance').count(),0,'max level cannot enhance');
  await page.locator('[data-mw-card="1"]').click();await page.locator('#mwEnhance').click();await page.waitForFunction(()=>document.querySelector('[data-mw-card="1"]')?.getAttribute('aria-label').includes('강화 1'));
  results.push('real enhancement confirm, material consumption and refreshed level');
  await page.locator('[data-mw-type="PVP"][data-mw-preset="2"]').click();
  await page.locator('[data-mw-card="13"]').click();assert.equal(await page.locator('#mwEquip').isDisabled(),true,'PVE-only card cannot equip to PVP');
  await page.locator('[data-mw-card="4"]').click();await page.locator('#mwEquip').click();assert.equal(await page.locator('#mwSave').isEnabled(),true);
  rejectNextDialog=true;assert.equal((await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('pvp'))).cancelled,true);
  assert.equal(await page.evaluate(()=>window.SoopketmonV21ExactShell.currentRoute),'magic');assert.equal(await page.locator('#mwSave').isEnabled(),true);
  const before=await page.evaluate(async()=>{const r=await fetch('/api/magic/status');return r.json()});
  await page.route('**/api/magic/loadout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'검수용 저장 실패'})}));
  await page.locator('#mwSave').click();await page.getByRole('alert').filter({hasText:'검수용 저장 실패'}).waitFor();assert.equal(await page.locator('#mwSave').isEnabled(),true);
  assert.match(await page.locator('[data-mw-slot="0"]').innerText(),/위기의 치유/);
  await page.unroute('**/api/magic/loadout');await page.locator('#mwSave').click();await page.waitForFunction(()=>document.querySelector('#mwSave')?.disabled&&document.querySelector('.mw-notice')?.textContent.includes('저장했습니다'));
  const after=await page.evaluate(async()=>{const r=await fetch('/api/magic/status');return r.json()});
  assert.equal(after.pvp.magicPresets[2][0],4);assert.deepEqual(after.pvp.magicPresets[1],before.pvp.magicPresets[1]);assert.equal(after.pvp.activePreset,1);
  results.push('desktop search, empty/owned/max/PVE-only, failed draft retention, separate preset save');
  // Use the existing app entry and its actual ranked deck tab, not a mock renderer.
  await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('pvp'));await page.locator('[data-pvp="deck"]').click();await page.locator('[data-ranked-magic="0"]').waitFor();
  await page.locator('[data-pvp-preset="2"]').click();assert.equal(await page.locator('[data-ranked-magic="0"]').inputValue(),'4');
  await page.locator('[data-ranked-magic="3"]').selectOption('6');
  rejectNextDialog=true;assert.equal((await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('home'))).cancelled,true);assert.equal(await page.locator('[data-ranked-magic="3"]').inputValue(),'6');assert.equal(await page.evaluate(()=>window.SoopketmonV21ExactShell.currentRoute),'pvp');
  await page.locator('#savePvpDeck').click();
  await page.waitForFunction(()=>document.querySelector('#savePvpDeck')?.disabled&&document.querySelector('.ranked-save-state')?.textContent.includes('적용 중'));
  const ranked=await page.evaluate(async()=>{const r=await fetch('/api/pvp/config');return r.json()});assert.equal(ranked.activePreset,2);assert.equal(ranked.magicPresets[2][3],6);assert.deepEqual(ranked.magicPresets[1],before.pvp.magicPresets[1]);
  await page.reload();await page.waitForFunction(()=>window.SoopketmonV21ExactShell&&document.querySelector('#app main.page'));await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('pvp'));await page.locator('[data-pvp="deck"]').click();await page.locator('[data-ranked-magic="3"]').waitFor();assert.equal(await page.locator('[data-ranked-magic="3"]').inputValue(),'6');
  await page.locator('.mw-ranked').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'ranked-desktop.png'),fullPage:true});results.push('ranked combined save, active selection, reload persistence and cancelled navigation');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('magic'));await page.locator('[data-mw-section="collection"]').click();await page.locator('#mwCards .mw-card').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal page overflow');
    await page.screenshot({path:path.join(output,`mobile-${width}.png`),fullPage:true});
    await page.locator('#mwCards').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`cards-${width}.png`)});
    await page.locator('[data-mw-card="4"]').click();await page.locator('#mwDetailClose').waitFor({state:'visible'});
    const bounds=await page.locator('.mw-detail').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=844,'mobile detail contained');
    await page.screenshot({path:path.join(output,`detail-${width}.png`)});
    await page.keyboard.press('Escape');assert.equal(await page.locator('.mw-detail').isVisible(),false);await page.locator('[data-mw-card="4"]').click();
    await page.locator('#mwDetailClose').click();await page.locator('[data-mw-card="4"]').click();
    await page.locator('#mwEquip').click();assert.equal(await page.locator('.mw-detail').isVisible(),false);await page.locator('#mwRestore').click();
    await page.locator('[data-mw-section="draw"]').click();assert.equal(await page.locator('#magicDrawBtn').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:path.join(output,`draw-${width}.png`),fullPage:true});
    await page.locator(width===390?'#magicDrawBtn':'#magicDraw10Btn').click();await page.locator('.magic-draw-reveal button').waitFor();await page.locator('.magic-draw-reveal.show').waitFor();await page.locator('.magic-draw-reveal').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))});await page.screenshot({path:path.join(output,`draw-result-${width}.png`)});await page.locator('.magic-draw-reveal button').click();await page.waitForFunction(()=>document.querySelector('#magicDrawBtn')?.disabled===false);results.push(`real ${width===390?1:10}-draw confirm, receipt result and return`);
    await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('pvp'));await page.locator('[data-pvp="deck"]').click();await page.locator('.mw-ranked').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(output,`ranked-${width}.png`)});
    results.push(`${width}px list, detail, controls and draw`);
  }
  await fs.writeFile(path.join(output,'qa.json'),JSON.stringify({results,errors},null,2));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors,output},null,2));
}catch(error){if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(await page.evaluate(()=>({url:location.href,text:document.body.innerText.slice(-6000)})));}throw error;}
finally{await fs.writeFile(path.join(output,'qa.json'),JSON.stringify({results,errors},null,2));await browser.close();}
