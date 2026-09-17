import fs from 'node:fs';import assert from 'node:assert/strict';
import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.FACTION_QA_ORIGIN||'http://127.0.0.1:8960',out=process.env.FACTION_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'clan-faction-qa-'));fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'}),headless:true});
const checks=[],errors=[],check=(value,name)=>{assert.ok(value,name);checks.push(name);};
try{
 for(const viewport of [{width:1600,height:1080},{width:1440,height:560},{width:768,height:1024},{width:390,height:844},{width:320,height:740}]){
  await fetch(base+'/api/preview/reset',{method:'POST'});
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/preview/clan-faction-v1/');await page.locator('.fw-zone').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const label=viewport.width+'x'+viewport.height;
  check(await page.locator('.fw-zone').count()===25,label+' all 25 districts');
  check(await page.evaluate(()=>document.body.scrollWidth===innerWidth&&document.querySelector('#clanRoot').scrollWidth<=document.querySelector('#clanRoot').clientWidth+1),label+' no page overflow');
  check(await page.locator('#clanRoot img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),label+' clan marks loaded');
  await page.locator('[data-fw-zone="11110"]').press('Enter');await page.locator('.fw-detail h2').filter({hasText:'종로구'}).waitFor();check(true,label+' keyboard map selection');
  await page.locator('[data-fw-tab="formation"]').first().click();await page.locator('.fw-squads').waitFor();check(await page.locator('.fw-member-slot').count()===20,label+' four squads, 20 slots');
  await page.locator('[data-fw-remove="3"]').click();await page.locator('#fw-assign-squad').selectOption('attack2');await page.locator('[data-fw-add="3"]').click();await page.locator('[data-fw-save]').click();await page.getByText('부대 편성을 저장했습니다.',{exact:true}).waitFor();
  check(true,label+' formation persists');await page.screenshot({path:out+'/formation-'+label+'.png'});
  await page.locator('[data-fw-tab="treasury"]').first().click();await page.locator('[data-fw-collect]').click();await page.locator('.fw-notice').filter({hasText:'분배했습니다'}).waitFor();check(true,label+' tax distribution receipt');
  await page.locator('[data-clan-tab="command"]').click();await page.locator('.clan-mode-card').first().waitFor();check(await page.locator('.clan-mode-card').count()===2,label+' regular / faction entry separation');
  await page.locator('.clan-mode-card[data-clan-tab="war"]').click();await page.locator('[data-clan-fight]').waitFor();check(true,label+' regular clan war preserved');
  await page.screenshot({path:out+'/regular-'+label+'.png'});
  await page.locator('[data-clan-tab="faction"]').first().click();await page.locator('[data-fw-tab="map"]').first().click();await page.locator('.fw-zone').first().waitFor();
  await page.locator('[data-fw-zone="11680"]').click();await page.locator('[data-fw-launch]').click();await page.locator('.fw-conflict-detail').waitFor();check(true,label+' launch opens shared HP engagement');
  await page.locator('[data-fw-room-strike]').click();await page.locator('.review-battle-result').waitFor();await page.locator('.review-battle-result button').click();await page.locator('.fw-notice').filter({hasText:'공유 HP'}).waitFor();check(true,label+' server V3 result applied and returned');
  await page.locator('.fw-battle-room [data-fw-room-close]').first().click();
  await page.locator('.fw-map-panel').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/map-'+label+'.png'});
  await page.locator('#review-invasion').click();await page.locator('.fw-invasion-alert[open]').waitFor({timeout:15000});
  check((await page.locator('.fw-invasion-alert').textContent()).includes('T1 지휘관'),label+' invader clan and name shown');
  const box=await page.locator('.fw-invasion-alert').boundingBox();check(box.x>=0&&box.x+box.width<=viewport.width&&box.y>=0&&box.y+box.height<=viewport.height,label+' alert fits viewport');
  await page.screenshot({path:out+'/alert-'+label+'.png'});await page.locator('[data-fw-defend]').click();await page.locator('.fw-battle-room h2').filter({hasText:'마포구'}).waitFor();check(true,label+' alert directly enters battle room');
  await page.close();
 }
 check(errors.length===0,'No browser JS errors: '+errors.join('; '));
 fs.writeFileSync(out+'/browser-results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,output:out}));
}finally{await browser.close();}
