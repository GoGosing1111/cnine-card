import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.CITY_QA_ORIGIN||'http://127.0.0.1:8918',out=process.env.CITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'jokgak-city-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const checks=[],errors=[];
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
try{
  for(const viewport of [{width:1440,height:1040},{width:390,height:844}]){
    const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');});
    await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,visible:false,items:[],cards:[]}}));
    await page.goto(origin+'/preview/jokgak-city-v1/',{waitUntil:'networkidle'});await page.locator('.jc-person').first().waitFor();await page.evaluate(()=>document.fonts.ready);
    check(await page.locator('.jc-pin').count()===8,viewport.width+' all 8 places');
    check(await page.locator('.jc-person').count()===10,viewport.width+' exactly 10 residents');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),viewport.width+' no page overflow');
    await page.locator('.jc-person').first().click();await page.screenshot({path:path.join(out,viewport.width+'-city.png'),fullPage:true});
    await page.locator('[data-city-action="inspect"]').click();await page.locator('.jc-dialog').waitFor();check(await page.locator('.jc-inspection li').count()===5,viewport.width+' inspection reveals five cards');await page.locator('.jc-dialog [data-city-dialog-close]').last().click();
    await page.locator('#previewRole').selectOption('NURSE');await page.locator('.jc-person').first().click();await page.locator('[data-city-action="heal"]').click();await page.waitForFunction(()=>!document.querySelector('[data-city-message]')?.textContent.includes('처리하고'));check((await page.locator('.jc-person-health').first().textContent()).includes('75'),viewport.width+' nurse heal +25');
    await page.locator('.jc-pin[data-city-place="HOME"]').click();await page.locator('.jc-location-cover h2').filter({hasText:'집'}).waitFor();check(await page.locator('[data-city-action="attack"]').count()===0,viewport.width+' changing place clears target');
    await page.locator('[data-city-action="move"]').click();await page.locator('.jc-pin.current[data-city-place="HOME"]').waitFor();check(await page.locator('.jc-here').textContent().then(s=>s.includes('현재')),viewport.width+' move updates current building');
    await page.locator('#previewNotice').click();await page.locator('.jc-dispatch').waitFor();check(await page.locator('.jc-dispatch').getAttribute('aria-modal')==='false',viewport.width+' notification non-modal');await page.screenshot({path:path.join(out,viewport.width+'-notification.png'),fullPage:true});await page.locator('[data-notice-record]').click();check(await page.locator('.jc-dialog').textContent().then(s=>s.includes('방어 패배')),viewport.width+' notification opens saved outcome');await page.locator('.jc-dialog [data-city-dialog-close]').last().click();
    await page.locator('[data-city-page="next"]').click();await page.waitForFunction(()=>document.querySelector('.jc-pagination')?.textContent.includes('2 페이지'));check(await page.locator('.jc-person').count()<=10,viewport.width+' bounded next page');
    await page.locator('[data-city-rules]').first().click();check(await page.locator('.jc-role-guide>div').count()===7,viewport.width+' all roles documented');await page.locator('.jc-dialog [data-city-dialog-close]').last().click();
    await page.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({out,checks:checks.length,errors}));
}finally{await browser.close();}
