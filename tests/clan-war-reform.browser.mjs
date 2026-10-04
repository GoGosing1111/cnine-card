import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.env.CLAN_REFORM_QA_ORIGIN||'http://127.0.0.1:8965',out=process.env.CLAN_REFORM_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'clan-reform-qa-'));
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const checks=[],errors=[],check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 await fetch(base+'/api/preview/reform-reset',{method:'POST'});
 for(const [i,viewport] of [{width:1440,height:1000},{width:390,height:844}].entries()){
  const userId=i?4:6,label=i?'mobile':'desktop';
  await fetch(base+'/api/preview/reform-phase?phase=active',{method:'POST'});
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/review-live/?as='+userId,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof window.ClanV1?.bind==='function'&&typeof renderShell==='function');
  await page.evaluate(()=>renderShell('clan'));await page.locator('.cw-plan').waitFor();
  await page.locator('[data-clan-tab="schedule"]').click();
  await page.locator('input[name=warDay][value="2"]').check();await page.locator('input[name=warDay][value="4"]').check();
  await page.locator('[data-cw-schedule] button[type=submit]').click();await page.locator('[data-cw-schedule] button[type=submit]').filter({hasText:'수정'}).waitFor();
  const saved=await (await fetch(base+'/api/clan/war/planning',{headers:{'x-review-user':String(userId)}})).json();check(saved.myDays.includes(2)&&saved.myDays.includes(4),label+' weekly signup saved to PostgreSQL');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' no horizontal overflow');
  await page.waitForFunction(()=>!window.ClanV1.state.loading);await page.locator('.cw-plan').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+label+'-schedule.png'});
  await page.locator('[data-clan-tab="war"]').click();await page.locator('.cw-field').waitFor();
  await page.locator('.cw-arena').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+label+'-arena.png'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.cw-mission-art img,.cw-arena-art,.cw-command-crest img')].every(i=>i.complete&&i.naturalWidth>0));check(true,label+' production artwork and clan crests load');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' entire war screen fits width');
  await page.locator('[data-cw-action="assault"]').click();await page.waitForFunction(()=>document.querySelector('.cw-field-hero aside strong')?.textContent.match(/\+[1-9]/));
  check(true,label+' low-power support adds visible contribution');
  const boxes=await page.locator('.cw-mission .cw-action').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),p=n.closest('.cw-mission').getBoundingClientRect();return {width:r.width,inside:r.left>=p.left&&r.right<=p.right};}));
  check(boxes.every(b=>b.width>100&&b.inside),label+' mission buttons fit and do not overlap');
  await page.locator('.cw-missions').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+label+'-battlefield.png'});
  await page.locator('.cw-command').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+label+'-commander.png'});
  await page.locator('[data-clan-tab="roster"]').click();check((await page.locator('#clanRoot').textContent()).includes('집행관'),label+' executive label visible');
  await fetch(base+'/api/preview/reform-phase?phase=ready',{method:'POST'});
  await page.evaluate(()=>{const blocker=document.createElement('div');blocker.id='qaBattle';blocker.className='battle-v3-stage';blocker.style.cssText='position:fixed;width:10px;height:10px';document.body.append(blocker);document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(800);check(await page.locator('.cw-ready-popup').count()===0,label+' battle prevents intrusive popup');
  await page.evaluate(()=>{document.getElementById('qaBattle').remove();document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('.cw-ready-popup[open]').waitFor({timeout:35000});const box=await page.locator('.cw-ready-popup').boundingBox();
  check(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,label+' ready popup fits viewport');
  await page.screenshot({path:out+'/'+label+'-ready-popup.png'});
  await page.locator('.cw-ready-popup [data-status="READY"]').click();await page.locator('.cw-ready-popup').waitFor({state:'detached'});
  const ready=await (await fetch(base+'/api/clan/war/planning',{headers:{'x-review-user':String(userId)}})).json();check(ready.war.myReady==='READY',label+' ready reply persists');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('clan'));await page.locator('.cw-plan').waitFor();
  check(await page.locator('.cw-ready-popup').count()===0,label+' answered popup not resent on reload');
  check(await page.locator('input[name=warDay][value="2"]').isChecked(),label+' saved week survives reload');
  await page.close();
 }
 check(errors.length===0,'No browser exceptions: '+errors.join('; '));
 fs.writeFileSync(out+'/results.json',JSON.stringify({checks,errors,output:out},null,2));console.log(JSON.stringify({passed:checks.length,output:out}));
}finally{await browser.close();}
