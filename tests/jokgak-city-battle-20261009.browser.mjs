import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.CITY_QA_ORIGIN||'http://127.0.0.1:8918',out=process.env.CITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'jokgak-combat-'));
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],checks=[];
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport});page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');});
    await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,visible:false,items:[],cards:[]}}));
    await page.goto(origin+'/preview/jokgak-city-v1/',{waitUntil:'networkidle'});await page.locator('.jc-person').first().click();
    await page.locator('[data-city-action="attack"]').click();
    await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics?.().mounted===true,{},{timeout:45000});
    await page.waitForFunction(()=>document.querySelector('.battle-v3-live-shell.is-v3-ready'),{},{timeout:45000});
    await page.screenshot({path:path.join(out,viewport.width+'-battle.png')});
    const diag=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics());fs.writeFileSync(path.join(out,viewport.width+'-battle-diagnostics.json'),JSON.stringify(diag,null,2));
    assert.ok(JSON.stringify(diag).includes('city-street-battle-v1.webp'),'rendered city backdrop');checks.push(viewport.width+' current V3 city battlefield mounted');
    await page.evaluate(()=>window.JokgakCity.showNotice({id:'combat-notice',action:'attack',actorName:'알림 검수',location:'MARKET',health:55,winner:'A',jailedUntil:0}));
    await page.locator('.jc-dispatch').waitFor();assert.ok(await page.locator('.battle-v3-live-shell').count());await page.locator('[data-notice-dismiss]').click();checks.push(viewport.width+' popup does not replace active battle');
    await page.locator('.jc-battle-result').waitFor({timeout:120000});await page.screenshot({path:path.join(out,viewport.width+'-battle-result.png')});await page.locator('.jc-battle-result button').click();await page.locator('.jc-person').first().waitFor();assert.equal(await page.locator('.battle-v3-modal').count(),0);checks.push(viewport.width+' result and return completed');
    await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'combat-report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors,out}));
}finally{await browser.close();}
