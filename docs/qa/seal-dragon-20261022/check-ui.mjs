import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const out='docs/qa/seal-dragon-20261022',url='http://127.0.0.1:8916/preview/seal-battle-rework-20261021/';
const browser=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try{
 for(const [name,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile',recordVideo:{dir:out+'/video',size:{width,height}}});
  await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const failed=[];page.on('response',r=>{if(r.status()>=400&&r.url().includes('dragon-20261022'))failed.push({url:r.url(),status:r.status()});});
  await page.goto(url);await page.locator('[data-seal-role="BOSS"]').waitFor();
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:out+'/'+name+'-boss.png',fullPage:true});
  await page.locator('[data-seal-role="BOSS"]').click();await page.locator('[data-seal-confirm]').click();
  await page.locator('.battle-v3-live-shell canvas').waitFor({timeout:60000});
  await page.waitForTimeout(1200);await page.screenshot({path:out+'/'+name+'-battle.png'});
  await page.locator('.seal-battle-return').waitFor({timeout:60000});
  const diag=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics());
  await page.screenshot({path:out+'/'+name+'-result.png'});
  assert.match(await page.locator('#battleMessage').innerText(),/본체 피해 반영 완료/);
  await page.locator('.seal-battle-return').click();
  for(const scenario of ['active','last-seal','complete','no-charge','no-deck','failed']){
   await page.selectOption('#scenario',scenario);await page.waitForTimeout(100);
   if(await page.locator('.seal-dragon-reveal [data-seal-confirm]').isVisible())await page.locator('.seal-dragon-reveal [data-seal-confirm]').click();
   if(['no-charge','no-deck','failed','complete'].includes(scenario))assert(await page.locator('[data-seal-role]').isDisabled());
   if(scenario==='complete')assert.equal(await page.locator('#sealClearClaim').isDisabled(),false);
   if(scenario==='active'||scenario==='complete')await page.screenshot({path:out+'/'+name+'-'+scenario+'.png',fullPage:true});
  }
  await page.selectOption('#scenario','boss-last');await page.waitForTimeout(100);
  if(await page.locator('.seal-dragon-reveal [data-seal-confirm]').isVisible())await page.locator('.seal-dragon-reveal [data-seal-confirm]').click();
  await page.locator('[data-seal-role="BOSS"]').click();await page.locator('[data-seal-confirm]').click();await page.locator('.seal-battle-return').waitFor({timeout:60000});
  assert.match(await page.locator('#battleMessage').innerText(),/공동 토벌 완료/);const death=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics());
  await page.screenshot({path:out+'/'+name+'-death.png'});await page.locator('.seal-battle-return').click();
  await page.goto(url+'admin.html');await page.locator('#sealDragonHp').waitFor();await page.waitForFunction(()=>document.querySelector('#sealDragonHp').value==='15000000000');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/'+name+'-cms.png',fullPage:true});
  report.push({name,errors,failed,diag,death});await context.close();
 }
 await fs.writeFile(out+'/browser-check.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.map(({name,errors,failed,diag,death})=>({name,errors,failed,dragon:diag.characterStates?.filter(c=>c.sealDragon),death:death.characterStates?.filter(c=>c.sealDragon)})),null,2));
}catch(error){await fs.writeFile(out+'/browser-failure.json',JSON.stringify({error:error.stack,report},null,2));throw error;}finally{await browser.close();}
